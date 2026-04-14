# MallBook (쇼핑몰 자산관리) -- 프로젝트 스펙

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> 이 문서를 AI에게 항상 함께 공유하세요.

---

## 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | **Tauri 2 + React + TypeScript** | 데스크톱 앱 더블클릭 실행 가능. Electron보다 번들 10배 가벼움 (수 MB). |
| 로컬 DB | **SQLite** (tauri-plugin-sql 경유) | 설치 불필요, 파일 1개로 백업 쉬움. 1인 사용에 충분. |
| UI 라이브러리 | **shadcn/ui + Tailwind CSS** | 깔끔한 기본 컴포넌트, AI 코딩 도구와 궁합 최상. |
| 상태관리 | **Zustand** | Redux보다 단순, 1인 앱에 과하지 않음. |
| 인증 | **Google OAuth 2.0** (PKCE 플로우) | 구글시트 연동이 핵심이라 자연스러움. 로컬 앱용 PKCE 사용. |
| 구글시트 연동 | **Google Sheets API v4** | 공식 API, 무료 할당량 하루 300 req/min 충분. |
| 빌드/배포 | **Tauri CLI** | `tauri build`로 Windows(.msi/.exe), macOS(.dmg) 자동 생성. |
| 아이콘/로고 | **Tauri 기본 아이콘 템플릿** | Phase 1에선 기본값, Phase 3에서 커스텀 디자인. |

---

## 프로젝트 구조

```
mallbook/
├── src/                      # React 프론트엔드
│   ├── app/
│   │   ├── routes/           # 페이지 (대시보드, 거래목록, 설정 등)
│   │   └── main.tsx          # 진입점
│   ├── components/           # 재사용 UI (TransactionForm, SheetPicker 등)
│   ├── lib/
│   │   ├── db.ts             # SQLite 쿼리 래퍼
│   │   ├── google.ts         # Google OAuth + Sheets API
│   │   └── tax.ts            # 부가세 계산 로직
│   ├── stores/               # Zustand 스토어
│   └── types/                # 데이터 타입 (Transaction, Counterparty 등)
├── src-tauri/                # Rust 백엔드 (Tauri)
│   ├── src/
│   │   ├── main.rs           # Tauri 진입점
│   │   └── commands.rs       # 프론트엔드에서 호출하는 Rust 커맨드
│   ├── migrations/           # SQLite 스키마 마이그레이션
│   ├── tauri.conf.json       # 앱 설정 (이름, 아이콘, 빌드 타겟)
│   └── icons/                # 앱 아이콘
├── public/                   # 정적 리소스
├── .env.local                # OAuth 클라이언트 ID 등 (git 제외)
└── package.json
```

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- [ ] Google OAuth Client Secret/API 키를 코드에 직접 쓰지 마 (.env.local 사용, PKCE 플로우라 secret 없음이 원칙)
- [ ] 사용자 Google 토큰을 평문으로 저장하지 마 (OS 키체인 / Tauri Secure Storage 사용)
- [ ] SQLite 스키마를 마이그레이션 없이 바꾸지 마 (src-tauri/migrations/ 에 순서대로 작성)
- [ ] 목업/더미 데이터로 "완성"이라고 하지 마 (실제 거래 입력→시트 반영까지 확인)
- [ ] 부가세 계산을 프론트엔드에서만 하지 마 (Rust 커맨드에서 검증 로직 1차, 프론트는 표시만)
- [ ] package.json / Cargo.toml의 기존 의존성 버전을 임의로 변경하지 마
- [ ] `any` 타입 남발하지 마 (Transaction 등 핵심 엔티티는 zod 스키마로 런타임 검증)
- [ ] 구글시트 동기화 실패를 조용히 삼키지 마 (실패 시 재시도 큐에 쌓고 UI에 경고)
- [ ] 금액을 Float로 다루지 마 (소수점 오차 위험 — 원화는 정수 KRW로 통일)
- [ ] 사용자 데이터를 외부 서버로 전송하지 마 (Google Sheets API 외에는 네트워크 호출 금지)

---

## 항상 해 (ALWAYS DO)

- [ ] 변경 전에 "뭘 어떻게 바꿀지" 계획 먼저 보여주고 확인받기
- [ ] OAuth 클라이언트 ID 등 환경변수는 .env.local에 저장, .gitignore 확인
- [ ] 에러 발생 시 사용자에게 친절한 한국어 메시지 표시 (스택 트레이스 노출 X)
- [ ] 거래 저장 후 구글시트 동기화는 비동기 큐 (앱 반응성 우선)
- [ ] 금액 입력 UI는 천단위 콤마 자동 포맷
- [ ] 테스트: 거래 10건 입력 → 시트 반영 → 대시보드 합계 일치 확인
- [ ] macOS/Windows 양쪽 빌드 산출물 모두 테스트 (CI에서)
- [ ] SQLite 파일 위치를 OS 표준 app data 디렉토리에 저장 (Tauri path API 사용)
- [ ] 최초 실행 시 샘플 Category 4종(상품매입/임대/운송/기타) 자동 시드

---

## 테스트 방법

```bash
# 의존성 설치
npm install
cd src-tauri && cargo build && cd ..

# 개발 모드 실행 (핫리로드)
npm run tauri dev

# 타입 체크
npx tsc --noEmit

# 프로덕션 빌드 (현재 OS용 설치 파일 생성)
npm run tauri build
# 결과물: src-tauri/target/release/bundle/
#   Windows: .msi / .exe
#   macOS:   .dmg / .app
```

---

## 배포 방법

**Phase 1 배포 = 설치 파일 공유**

1. `npm run tauri build` 로 설치 파일 생성
2. GitHub Releases 또는 구글드라이브에 .dmg/.msi 업로드
3. 가족·지인에게 다운로드 링크 전달 → 더블클릭 설치
4. 최초 실행 시:
   - macOS: "확인되지 않은 개발자" 경고 → 우클릭 열기
   - Windows: SmartScreen 경고 → "추가 정보 → 실행"
   - (추후 코드 사이닝 인증서 구매 시 경고 제거 가능)

**자동 업데이트** (Phase 3)
- Tauri Updater 플러그인으로 백그라운드 업데이트 지원 가능

---

## 환경변수

| 변수명 | 설명 | 어디서 발급 |
|--------|------|------------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID (Desktop 앱 유형) | https://console.cloud.google.com/apis/credentials |
| `VITE_GOOGLE_OAUTH_REDIRECT` | OAuth 리다이렉트 URI (loopback) | `http://127.0.0.1:0` 형식 |

> .env.local 파일에 저장. 절대 GitHub에 올리지 마세요.
> PKCE 플로우이므로 Client Secret은 필요 없음.

---

## [NEEDS CLARIFICATION]

- [ ] Google Cloud Console 프로젝트 생성 주체 (개인 계정 vs 사업자 계정)
- [ ] 코드 사이닝 인증서 구매 여부 (연 $100~$400, SmartScreen 경고 제거용)
- [ ] 앱 번들 ID / 패키지명 최종 (com.yukang.mallbook?)
- [ ] 한국어 고정 vs 다국어 지원(i18n) 초기 도입 여부
- [ ] 개발 저장소 위치 (GitHub private repo vs 로컬 only)
