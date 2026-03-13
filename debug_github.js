// 이 스크립트는 GitHub 저장소에 실제로 파일이 있는지 확인합니다
// 실행 전에 아래 값을 수정하세요
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'YOUR_TOKEN_HERE';
const REPO_OWNER = process.env.REPO_OWNER || 'seanjeon20-boop';
const REPO_NAME = process.env.REPO_NAME || 'EpubSyncData';

async function checkRepo() {
    const headers = {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'EpubSyncReader-Debug'
    };

    console.log(`\n=== Checking GitHub Repo: ${REPO_OWNER}/${REPO_NAME} ===\n`);

    // 1. 저장소 루트 확인
    try {
        const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`, { headers });
        console.log(`Root contents status: ${res.status}`);
        if (res.ok) {
            const files = await res.json();
            console.log('Root files/folders:');
            files.forEach(f => console.log(`  [${f.type}] ${f.name} (${f.size} bytes)`));
        } else {
            const err = await res.json();
            console.log('Error:', err.message);
        }
    } catch(e) { console.error('Root check failed:', e.message); }

    // 2. /books 폴더 확인
    console.log('\n--- /books folder ---');
    try {
        const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/books`, { headers });
        console.log(`/books status: ${res.status}`);
        if (res.ok) {
            const files = await res.json();
            console.log('Books:');
            files.forEach(f => console.log(`  [${f.type}] ${f.name} (${(f.size/1024).toFixed(1)} KB) - download_url: ${f.download_url}`));
        } else {
            const err = await res.json();
            console.log('/books Error:', err.message);
        }
    } catch(e) { console.error('/books check failed:', e.message); }

    // 3. 특정 epub 파일 헤드 요청으로 download_url 작동 확인
    const epubFilePath = 'books/The_Greatest_Scientific_Gamble_-_Michael_Joseloff.epub';
    console.log(`\n--- Testing download of ${epubFilePath} ---`);
    try {
        const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${epubFilePath}`, { headers });
        console.log(`File metadata status: ${res.status}`);
        if (res.ok) {
            const info = await res.json();
            console.log(`  Size: ${(info.size/1024).toFixed(1)} KB`);
            console.log(`  download_url: ${info.download_url}`);
            
            // 실제 download_url로 다운로드 시도 (첫 1KB만)
            if (info.download_url) {
                const dlRes = await fetch(info.download_url, { 
                    headers,
                    // Only get first few bytes to check if it works
                    method: 'HEAD'
                });
                console.log(`  download_url HEAD request status: ${dlRes.status}`);
            }
        } else {
            const err = await res.json();
            console.log('File check Error:', err.message);
        }
    } catch(e) { console.error('File check failed:', e.message); }
}

checkRepo();
