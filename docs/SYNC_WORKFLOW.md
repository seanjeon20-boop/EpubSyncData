# EPUB Reader GitHub Sync Workflow

## 1. 개요 (Overview)
개인 GitHub 레포지토리를 중앙 파일 저장소 및 데이터베이스로 활용하여 기기(iOS, Android) 간 독서 진행률, 책 파일(.epub), 주석(하이라이트, 메모) 데이터를 동기화합니다.

## 2. GitHub 저장소 구조 (Repository Structure)
- `/books/`: `.epub` 파일들이 보관되는 폴더.
- `/data/sync.json`: 마지막 읽은 위치, 메모, 책 메타데이터가 포함된 전체 설정/상태 파일. 별도의 백엔드 없이 이 JSON 파일의 읽기/쓰기로 모든 동기화를 관장합니다.

## 3. 동기화 워크플로우 (Synchronization Workflow)

### 가. 앱 초기 구동 (Pull & Init)
1. **GitHub Auth**: 사용자가 환경설정에서 입력한 Personal Access Token (PAT)을 기기의 안심 저장소(SecureStore/Keychain)에서 불러옵니다.
2. **Fetch Data**: GitHub REST API를 통해 `/data/sync.json`을 다운로드. 로컬 상태를 위해 반환된 파일의 `sha` 값을 함께 저장합니다.
3. **Local Merge & Render**: 
   - 기기에 오프라인 상태에서 변경된 데이터가 없다면, 다운로드한 통일 데이터를 로컬 환경(AsyncStorage, SQLite 등)에 반영합니다.
   - 마지막 읽던 위치 등은 `last_read_position` 값을 `epubjs` 렌더러의 `display(cfi)` 함수에 넘겨 이어서 렌더링합니다.

### 나. 읽기 완료 / 주석 추가 시 (Push Update)
1. **데이터 변경**: 사용자가 책을 읽다 뒤로 가기를 누르거나(Background 진입 시) 메모를 추가하면, 변경이 필요한 사항들만 로컬에서 임시 갱신합니다.
2. **Update Request**: 최신 전체 JSON 데이터를 base64로 인코딩하여 페이로드 준비.
3. **Commit to GitHub**: 
   - `PUT /repos/{owner}/{repo}/contents/data/sync.json` 호출.
   - 이때 반드시 다운로드 시 저장해 두었던 **`sha`** 값을 같이 패이로드에 포함하여 요청합니다.

### 다. 충돌 방지 전략 및 병합 (Conflict Prevention & Resolution)
GitHub API가 제공하는 Blob `sha`를 활용하여 **낙관적 동시성 제어(Optimistic Concurrency Control, OCC)**를 설계합니다.

- **충돌 발생 원리**: 
  - A 기기(iOS)와 B 기기(Android)가 모두 `sha: abc`인 오리지널 파일을 받아 읽기 시작했습니다.
  - A 기기가 먼저 읽기를 종료하여 JSON을 푸시합니다. 저장소의 `sha` 가 `def`로 바뀝니다.
  - 뒤늦게 B 기기가 자신이 가지고 있는 과거의 `sha: abc` 값으로 푸시를 시도합니다. 저장소는 `sha`가 불일치하므로 **409 Conflict** (혹은 422 Error)를 반환하고 요청을 차단합니다.
- **해결 로직 (병합)**:
  1. 409 오류를 감지하면 예외 코드가 아닌 데이터 병합 상태로 진입합니다.
  2. A 기기가 올렸던 최신 `sync.json` (sha: def)을 다시 Fetch 합니다.
  3. **병합 규칙 (Last-Write-Wins)**: `sync.json` 안의 각 책 데이터 객체 내 `position_updated_at` (위치 갱신 시점)와 각 주석의 `updated_at` (주석 갱신 시점)을 비교하여, **더 늦게 기록된(최신) 값 기준**으로 두 JSON을 합칩니다.
  4. 합쳐진 새로운 JSON 코드를 받아온 새로운 `sha: def`를 첨부하여 다시 Push 하여 오버라이트합니다.

## 4. 모바일 고려사항 및 API 최적화
- GitHub API는 시간당 5,000회 제한이 있습니다. 페이지를 넘길 때마다 푸시(Push) 하는 것은 위험하므로 주기적 갱신(Auto-save), 혹은 화면 이탈 시점(AppState 변환)에 큐(Queue)를 소모하는 방식으로 구현해야 합니다.
- 오프라인 상태에서 책을 읽었을 경우, 네트워크가 돌아오면 쌓여있는 `Offline 갱신 큐`를 한 번에 푸시합니다.
