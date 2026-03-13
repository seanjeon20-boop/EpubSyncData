/**
 * src/utils/githubSync.ts
 * 앱 구동 시 GitHub에서 파일을 리스트업하고,
 * 선택한 책의 마지막 읽기 위치를 불러오는 초기화 로직 (React Native)
 */

// GitHub API 응답의 content (Base64) 디코딩 용도
// React Native 에서는 외부 base-64 라이브러리 사용 권장 (npm install base-64, @types/base-64)
import { decode } from 'base-64';

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
    // 주석 등 다른 속성들 위치
}

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
 * 저장된 sync.json 불러오고, 마지막 읽을 위치 등을 확보. sha 정보 저장 중요 (동시성 제어용)
 */
export async function fetchSyncData(): Promise<{ data: SyncData | null; sha: string | null }> {
    try {
        const response = await fetch(`${BASE_URL}/contents/${SYNC_FILE_PATH}`, {
            method: 'GET',
            headers,
        });

        if (response.status === 404) {
            console.log('Sync file not found. Need initialization for the first time.');
            // 새 JSON을 만들어 Push 로직으로 넘어갈 수 있도록 처리
            return { data: null, sha: null };
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch sync data: ${response.status}`);
        }

        const result = await response.json();

        // GitHub API에서 JSON 파일 내용은 base64 문자열로 줍니다. 디코딩 필수.
        // React Native는 atob 가 없어서 base-64 등 툴체인 사용
        const decodedContent = decode(result.content);

        // 이스케이프 문자열 파싱 (UTF-8 고려)
        const utf8Content = decodeURIComponent(escape(decodedContent));
        const syncData: SyncData = JSON.parse(utf8Content);

        return { data: syncData, sha: result.sha };
    } catch (error) {
        console.error('Error fetching and decoding sync.json:', error);
        return { data: null, sha: null };
    }
}

/**
 * 3. 앱 구동 시 진입점 로직 (App.tsx 혹은 초기화 Context 에서 호출)
 */
export async function initializeGitHubSync() {
    console.log('--- Initializing GitHub Sync ... ---');

    // 1. 책 리스트 파일 확인
    const booksOnCloud = await fetchBooksList();
    console.log('총 발견된 책(EPUB):', booksOnCloud.length, '권');

    // 2. 동기화 데이터 가져오기  
    const { data: syncData, sha: currentSha } = await fetchSyncData();

    // 로컬 기기에 `currentSha`를 보관해두었다가 파일 수정(Push) 시 활용!
    // await AsyncStorage.setItem('sync_file_sha', currentSha || ''); 

    // 3. 특정 책의 마지막 위치 정보 렌더링 준비
    const targetBookId = 'book_hash_identifier123'; // 예제 책 선택 시 값
    if (syncData && syncData.books[targetBookId]) {
        const bookInfo = syncData.books[targetBookId];
        console.log(`\n📚 [${bookInfo.title}] 동기화 완료!`);
        console.log(`📌 마지막 읽기 위치(CFI): ${bookInfo.last_read_position}`);
        console.log(`⏱️ 최신 위치 갱신일: ${bookInfo.position_updated_at}`);

        // epubjs 라이브러리에 렌더링 호출을 예약 (컴포넌트 props로 넘기기 등)
        // 예) readerView.display(bookInfo.last_read_position)
    } else {
        console.log('\n📖 이 책의 동기화 데이터가 없습니다. (처음부터 읽기)');
    }

    return { syncData, currentSha, booksOnCloud };
}
