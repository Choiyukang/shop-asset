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
