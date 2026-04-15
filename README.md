# MallBook

쇼핑몰 사장님을 위한 자산관리 데스크톱 앱.
거래·재고·세금·현금흐름을 로컬 SQLite에 저장하고, 구글시트에 자동으로 동기화합니다.

Tauri 2 · React 19 · TypeScript · Vite · SQLite · Google Sheets API

---

## 주요 기능

- **거래 관리** — 구매/판매/지출 입력, 거래처·분류별 필터, 외상·미수금 추적
- **상품/재고** — 상품별 깔(컬러)·사입가·판매가 관리. 거래 입력 시 재고 자동 증감
- **거래처·수수료** — 거래처별 기본 수수료율, 건별 오버라이드. "오늘 삼촌에게 줄 돈" 대시보드
- **부가세 자동 계산** — 거래 저장 시 공급가/부가세 자동 분리, 환급 여부 판정
- **구글시트 양방향 동기화** — 거래 저장 시 자동 append, 시트 → 앱 복원, 전체 재동기화
- **로컬 우선** — 인터넷 없어도 모든 기능 동작. 시트 연동은 선택

---

## 설치 (최종 사용자)

1. [Releases 페이지](https://github.com/Choiyukang/shop-asset/releases)에서 본인 OS 파일 다운로드
   - **Windows**: `MallBook_x.y.z_x64_en-US.msi`
   - **macOS (Apple Silicon/Intel 공용)**: `MallBook_x.y.z_universal.dmg`
2. 더블클릭 설치 → 실행
3. **설정 > 구글시트 연동**에서 "구글 계정 연결" 클릭 → 구글 로그인 → 시트 URL/ID 저장

> macOS에서 "확인되지 않은 개발자" 경고가 뜨면 시스템 설정 > 개인정보 보호 및 보안에서 "그래도 열기"를 눌러 주세요.
> 윈도우에서 SmartScreen 경고가 뜨면 "추가 정보 > 실행"을 눌러 주세요.

---

## 개발 환경 셋업

### 요구사항
- **Node.js** 20+
- **Rust** (stable, rustup)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: Visual Studio Build Tools + WebView2
- **Linux**: `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libayatana-appindicator3-dev` 등 (Tauri 공식 문서 참고)

### 로컬 실행
```bash
git clone git@github.com:Choiyukang/shop-asset.git
cd shop-asset
npm install

# (선택) 구글시트 연동을 로컬에서도 테스트하려면
cp .env.example .env
# .env 파일을 열어 VITE_GOOGLE_CLIENT_ID / VITE_GOOGLE_CLIENT_SECRET 채우기

npm run tauri dev
```

첫 실행 시 Rust 의존성 컴파일로 5~10분 정도 걸릴 수 있습니다.

### 빌드 (로컬)
```bash
npm run tauri build
# 산출물: src-tauri/target/release/bundle/
```

---

## 구글시트 연동 설정

앱에서 시트 연동 기능을 쓰려면 Google OAuth Client ID가 필요합니다. 사장님(개발자)이 **1회만** 셋업하면 모든 사용자가 공유해서 씁니다.

### Google Cloud Console 셋업
1. https://console.cloud.google.com 접속 → 새 프로젝트 생성 (예: `MallBook`)
2. **APIs & Services > Library**에서 `Google Sheets API` 활성화
3. **APIs & Services > OAuth consent screen**에서:
   - User Type: **External**
   - 앱 이름·지원 이메일·개발자 연락처 입력
   - **Test users** 섹션에 사용자 Gmail 추가 (최대 100명까지 무료)
4. **APIs & Services > Credentials**에서 **OAuth 클라이언트 ID 생성**:
   - Application type: **Desktop app**
   - 생성 후 **Client ID**와 **Client Secret** 복사

### 시크릿 설정

**로컬 개발용** (`.env`):
```
VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
```

**배포 빌드용** (GitHub Actions):
- GitHub 저장소 > **Settings > Secrets and variables > Actions** 에서 동일한 이름으로 Repository secret 등록
- 시크릿 없이 빌드해도 앱은 정상 동작 (구글 연동 기능만 비활성화)

> `.env`는 `.gitignore`에 포함되어 있습니다. `VITE_GOOGLE_CLIENT_SECRET`은 절대 커밋하지 마세요.

---

## 자동 배포 (GitHub Actions)

`v*` 패턴의 태그를 푸시하면 macOS(universal)와 Windows 인스톨러가 병렬로 빌드되어 **Draft Release**에 자동 업로드됩니다.

```bash
git tag v0.1.0
git push origin v0.1.0
```

- 진행 상황: [Actions 탭](https://github.com/Choiyukang/shop-asset/actions)
- 빌드 소요 시간: macOS 8~12분, Windows 10~15분
- 완료 후 [Releases 페이지](https://github.com/Choiyukang/shop-asset/releases)에서 Draft 검토 → **Publish**

---

## 프로젝트 구조

```
shop-asset/
├── PRD/                      # 제품 기획 문서 (PRD, 데이터 모델, Phase 계획)
├── src/                      # React 프론트엔드
│   ├── pages/                # 화면 (Dashboard, Transactions, Products, Counterparties, Settings)
│   ├── components/           # UI 컴포넌트
│   ├── stores/               # Zustand 스토어
│   ├── lib/                  # db.ts, google.ts, tax.ts, utils.ts
│   └── types/                # TypeScript 타입 정의
├── src-tauri/                # Rust 백엔드 (Tauri)
│   ├── src/
│   │   ├── lib.rs            # Tauri 앱 엔트리, 플러그인 + 커맨드 등록
│   │   └── google.rs         # OAuth 루프백 + PKCE + 키체인 저장
│   └── migrations/           # SQLite 마이그레이션 (v1, v2, v3)
└── .github/workflows/        # GitHub Actions (release.yml)
```

자세한 도메인 설계는 `PRD/02_DATA_MODEL.md`를, 로드맵은 `PRD/03_PHASES.md`를 참고하세요.

---

## 로드맵

- ✅ **Phase 1 (MVP)** — 거래 CRUD, 부가세 자동 계산, 구글시트 쓰기, 대시보드
- ✅ **Phase 1.5** — 상품/재고, 거래처 수수료, "오늘 삼촌에게 줄 돈" 카드
- 🟡 **Phase 2** — 세금 리포트(분기별 CSV/PDF), 현금흐름 타임라인, 시트 양방향 충돌 처리
- ⚪ **Phase 3** — 월/분기 손익 리포트, 영수증 이미지 첨부, 드라이브 자동 백업

---

## 라이선스

Private. 외부 배포 전 라이선스 정책을 명시하세요.
