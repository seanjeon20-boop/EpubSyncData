/**
 * src/utils/githubSync.ts
 * 앱 구동 시 GitHub에서 파일을 리스트업하고,
 * 선택한 책의 마지막 읽기 위치를 불러오는 초기화 로직 (React Native)
 */

import { decode, encode } from 'base-64';

export const GITHUB_TOKEN = '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';
const REPO_OWNER = 'seanjeon20-boop';
const REPO_NAME = 'EpubSyncData';
const SYNC_FILE_PATH = 'data/sync.json';

const BASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
};

export interface SyncData {
    version: string;
    last_synced_at: string;
    books: Record<string, BookData>;
}

export interface BookData {
    title: string;
    file_path: string;
    last_read_position: string | null;
    position_updated_at: string | null;
    annotations?: Annotation[];
}

export interface Annotation {
    type: 'highlight' | 'memo' | 'bookmark';
    cfi: string;
    cfiRange?: string; // For highlights and memos
    text?: string;    // Selected text or memo content
    color?: string;
    created_at: string;
}

// Global cache to easily update the file without fetching it again
let cachedSyncData: SyncData | null = null;
let cachedSha: string | null = null;

/**
 * 1. 앱 구동 시 GitHub의 /books 디렉토리 내 폴더 리스팅 혹은 책 파일 리스트업
 */
export async function fetchBooksList(): Promise<any[]> {
    try {
        const response = await fetch(`${BASE_URL}/contents/books`, {
            method: 'GET',
            headers,
        });

        if (response.status === 404) {
            console.warn('Books directory not found. Please upload epub files to the /books folder.');
            return [];
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch books: ${response.status}`);
        }

        const files = await response.json();
        return files.filter((file: any) => file.name.endsWith('.epub'));
    } catch (error) {
        console.error('Error fetching books list from GitHub:', error);
        return [];
    }
}

/**
 * 2. 동기화 데이터 최초 초기화
 */
export async function fetchSyncData(): Promise<{ data: SyncData | null; sha: string | null }> {
    try {
        const response = await fetch(`${BASE_URL}/contents/${SYNC_FILE_PATH}`, {
            method: 'GET',
            headers,
        });

        if (response.status === 404) {
            console.log('Sync file not found. Need initialization for the first time.');
            return { data: null, sha: null };
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch sync data: ${response.status}`);
        }

        const result = await response.json();
        const decodedContent = decode(result.content);
        const utf8Content = decodeURIComponent(escape(decodedContent));
        const syncData: SyncData = JSON.parse(utf8Content);

        cachedSyncData = syncData;
        cachedSha = result.sha;

        return { data: syncData, sha: result.sha };
    } catch (error) {
        console.error('Error fetching and decoding sync.json:', error);
        return { data: null, sha: null };
    }
}

/**
 * 3. 동기화 데이터 쓰기(Push)
 */
export async function pushSyncData(newData: SyncData): Promise<string | null> {
    try {
        // UTF-8 문자열을 Base64 인코딩
        const jsonString = JSON.stringify(newData, null, 2);
        // encodeURIComponent + unescape is a standard way to encode UTF-8 bytes to btoa/base-64
        const utf8Bytes = unescape(encodeURIComponent(jsonString));
        const encodedContent = encode(utf8Bytes);

        const body = {
            message: `sync: update reading position ${new Date().toISOString()}`,
            content: encodedContent,
            sha: cachedSha || undefined, // 기존 파일을 덮어쓰기 위해 이전 작업의 sha 필요
        };

        const response = await fetch(`${BASE_URL}/contents/${SYNC_FILE_PATH}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errResult = await response.json();
            throw new Error(`Failed to push sync data: ${response.status} - ${errResult.message}`);
        }

        const result = await response.json();
        console.log('✅ 성공적으로 GitHub에 동기화 백업되었습니다!');
        cachedSha = result.content.sha;
        cachedSyncData = newData;
        return result.content.sha;
    } catch (error) {
        console.error('Error pushing sync.json to GitHub:', error);
        return null;
    }
}

/**
 * 4. 특정 책의 읽은 위치를 업데이트하고 GitHub에 예약/바로 푸시
 */
export async function updateBookProgress(title: string, cfi: string) {
    if (!cachedSyncData) return;

    // 제목으로 책 찾기 (더 정밀하게는 id를 쓰는 것이 좋지만, 파일명 베이스로 탐색)
    const bookKey = Object.keys(cachedSyncData.books).find(k => cachedSyncData!.books[k].title === title);

    // 만약 데이터에 없는 새 책이라면 새로 추가
    if (!bookKey) {
        const dummyKey = `book_${Date.now()}`;
        cachedSyncData.books[dummyKey] = {
            title: title,
            file_path: `books/${title}.epub`,
            last_read_position: cfi,
            position_updated_at: new Date().toISOString()
        };
    } else {
        cachedSyncData.books[bookKey].last_read_position = cfi;
        cachedSyncData.books[bookKey].position_updated_at = new Date().toISOString();
    }

    cachedSyncData.last_synced_at = new Date().toISOString();

    // 서버로 전송
    await pushSyncData(cachedSyncData);
}

/**
 * 5. 어노테이션(하이라이트, 메모, 책갈피) 추가
 */
export async function addAnnotation(title: string, annotation: Annotation) {
    if (!cachedSyncData) return;

    const bookKey = Object.keys(cachedSyncData.books).find(k => cachedSyncData!.books[k].title === title);
    if (!bookKey) return;

    const book = cachedSyncData.books[bookKey];
    if (!book.annotations) book.annotations = [];

    book.annotations.push(annotation);
    cachedSyncData.last_synced_at = new Date().toISOString();

    await pushSyncData(cachedSyncData);
}

/**
 * 6. 앱 구동 시 진입점 로직
 */
export async function initializeGitHubSync() {
    console.log('--- Initializing GitHub Sync ... ---');

    const booksOnCloud = await fetchBooksList();
    console.log('총 발견된 책(EPUB):', booksOnCloud.length, '권');

    const { data: syncData, sha: currentSha } = await fetchSyncData();

    return { syncData, currentSha, booksOnCloud };
}

/**
 * 7. 특정 책의 어노테이션 목록 가져오기
 */
export async function getAnnotations(title: string): Promise<Annotation[]> {
    if (!cachedSyncData) {
        await fetchSyncData();
    }
    if (!cachedSyncData) return [];

    const bookKey = Object.keys(cachedSyncData.books).find(k => cachedSyncData!.books[k].title === title);
    if (!bookKey) return [];

    return cachedSyncData.books[bookKey].annotations || [];
}
