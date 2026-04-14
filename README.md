# MallBook (Tauri + React + TypeScript)

쇼핑몰 자산관리 데스크톱 앱.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 구글시트 연동 설정

1. Google Cloud Console > **APIs & Services > Credentials** 에서 **OAuth 2.0 클라이언트 ID**를 발급합니다. (Application type: **Desktop app**)
2. 프로젝트 루트에 `.env` 파일을 만들고 발급받은 ID를 붙여넣습니다. `.env.example` 참고:
   ```
   VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   ```
3. 앱을 다시 빌드(`npm run tauri dev`)한 뒤 **설정 > 구글시트 연동**에서 "구글 계정 연결"을 눌러 OAuth 로그인 후 Sheet ID(또는 URL)와 탭 이름을 저장하세요.

## 배포 (윈도우/맥 자동 빌드)

- GitHub Actions가 `v*` 태그 푸시를 감지해 macOS(universal)와 Windows 설치 파일을 병렬로 빌드합니다.
- 결과물(.dmg, .app.tar.gz, .msi, .exe)은 **Draft Release**로 업로드되며, GitHub Releases 페이지에서 노트를 확인한 뒤 Publish 하면 됩니다.
- 최초 1회만 GitHub 저장소 **Settings > Secrets and variables > Actions** 에서 시크릿을 등록하세요:
  - `VITE_GOOGLE_CLIENT_ID` — 구글 OAuth 클라이언트 ID (없으면 구글시트 연동 기능만 비활성화됨)
- 릴리스 트리거 예시:
  ```bash
  git tag v0.1.0
  git push origin v0.1.0
  ```
- 진행 상황은 GitHub **Actions** 탭의 `Release` 워크플로에서 확인할 수 있습니다.
