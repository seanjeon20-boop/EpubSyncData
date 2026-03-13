import { decode, encode } from 'base-64';
import AsyncStorage from '@react-native-async-storage/async-storage';

let GITHUB_TOKEN = '';
let REPO_OWNER = '';
let REPO_NAME = '';
const SYNC_FILE_PATH = 'data/sync.json';

/**
 * 저장된 GitHub 설정 불러오기
 */
export async function loadSyncConfig() {
    const token = await AsyncStorage.getItem('github_token');
    const owner = await AsyncStorage.getItem('github_owner');
    const name = await AsyncStorage.getItem('github_repo');

    if (token) GITHUB_TOKEN = token;
    if (owner) REPO_OWNER = owner;
    if (name) REPO_NAME = name;

    return !!(GITHUB_TOKEN && REPO_OWNER && REPO_NAME);
}

export function getGithubToken() {
    return GITHUB_TOKEN;
}

const getBaseUrl = () => `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

export const getHeaders = () => ({
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
});

export const getAuthHeader = () => ({
    Authorization: `token ${GITHUB_TOKEN}`,
});

export interface SyncData {
    version: string;
    last_synced_at: string;
    books: Record<string, BookData>;
    stats?: {
        total_reading_minutes: number;
        daily_stats: Record<string, number>; // "YYYY-MM-DD": minutes
    };
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
export async function fetchBooksList(): Promise<{ success: boolean; books: any[]; error?: string }> {
    try {
        if (!GITHUB_TOKEN) return { success: false, books: [], error: 'No token' };

        // 1. Try /books directory
        let response = await fetch(`${getBaseUrl()}/contents/books`, {
            method: 'GET',
            headers: getHeaders(),
        });

        // 2. If 404, try root directory
        if (response.status === 404) {
            console.log('/books folder not found, trying root...');
            response = await fetch(`${getBaseUrl()}/contents`, {
                method: 'GET',
                headers: getHeaders(),
            });
        }

        if (response.status === 401) {
            return { success: false, books: [], error: 'Invalid GitHub Token (Unauthorized)' };
        }

        if (!response.ok) {
            return { success: false, books: [], error: `GitHub error: ${response.status}` };
        }

        const files = await response.json();
        if (!Array.isArray(files)) return { success: true, books: [] };

        const books = files.filter((file: any) => file.name.toLowerCase().endsWith('.epub'));
        return { success: true, books };
    } catch (error: any) {
        console.error('Error fetching books list from GitHub:', error);
        return { success: false, books: [], error: error.message };
    }
}

/**
 * 2. 동기화 데이터 최초 초기화
 */
export async function fetchSyncData(): Promise<{ data: SyncData | null; sha: string | null }> {
    try {
        const response = await fetch(`${getBaseUrl()}/contents/${SYNC_FILE_PATH}`, {
            method: 'GET',
            headers: getHeaders(),
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

        const response = await fetch(`${getBaseUrl()}/contents/${SYNC_FILE_PATH}`, {
            method: 'PUT',
            headers: getHeaders(),
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
export async function updateBookProgress(title: string, cfi: string, bookUrl?: string) {
    if (!cachedSyncData) {
        // Initialize if not exists
        cachedSyncData = {
            version: '1.0',
            last_synced_at: new Date().toISOString(),
            books: {}
        };
    }

    // 제목으로 책 찾기 (파일 확장자 제외하고 비교하거나 포함해서 비교)
    let bookKey = Object.keys(cachedSyncData.books).find(k => 
        cachedSyncData!.books[k].title === title || 
        cachedSyncData!.books[k].file_path.includes(title)
    );

    // 만약 데이터에 없는 새 책이라면 새로 추가
    if (!bookKey) {
        bookKey = `book_${Date.now()}`;
        cachedSyncData.books[bookKey] = {
            title: title,
            file_path: `books/${title}`,
            last_read_position: cfi,
            position_updated_at: new Date().toISOString()
        };
    } else {
        cachedSyncData.books[bookKey].last_read_position = cfi;
        cachedSyncData.books[bookKey].position_updated_at = new Date().toISOString();
    }

    cachedSyncData.last_synced_at = new Date().toISOString();

    // 마지막으로 읽은 책 정보를 AsyncStorage에 저장 (앙프 시작 시 자동 열기용)
    try {
        await AsyncStorage.setItem('last_read_book', JSON.stringify({
            title,
            bookUrl: bookUrl || '',
            cfi,
            timestamp: new Date().toISOString()
        }));
    } catch (e) {
        console.warn('Failed to save last read book info', e);
    }

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

    const result = await fetchBooksList();
    const booksOnCloud = result.books;
    console.log('총 발견된 책(EPUB):', booksOnCloud.length, '권');

    const { data: syncData, sha: currentSha } = await fetchSyncData();

    // Stats 초기화
    if (syncData && !syncData.stats) {
        syncData.stats = { total_reading_minutes: 0, daily_stats: {} };
    }

    return { syncData, currentSha, booksOnCloud, error: result.error };
}

/**
 * 7. 독서 통계 업데이트
 */
export async function updateReadingStats(minutesToAdd: number) {
    if (!cachedSyncData) return;

    if (!cachedSyncData.stats) {
        cachedSyncData.stats = { total_reading_minutes: 0, daily_stats: {} };
    }

    const today = new Date().toISOString().split('T')[0];
    cachedSyncData.stats.total_reading_minutes += minutesToAdd;
    cachedSyncData.stats.daily_stats[today] = (cachedSyncData.stats.daily_stats[today] || 0) + minutesToAdd;
    
    cachedSyncData.last_synced_at = new Date().toISOString();
    await pushSyncData(cachedSyncData);
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
