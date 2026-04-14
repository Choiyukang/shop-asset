# MallBook (쇼핑몰 자산관리) -- 데이터 모델

> 이 문서는 앱에서 다루는 핵심 데이터의 구조를 정의합니다.
> 개발자가 아니어도 이해할 수 있는 "개념적 ERD"입니다.

---

## 전체 구조

```
[User] --1:N--> [Transaction] --N:1--> [Counterparty]
                      |                       (거래처: 삼촌, 공급사, 고객)
                      ├--N:1--> [Category]
                      |         (분류: 상품/임대료/운송비 등)
                      ├--1:1--> [TaxRecord]
                      |         (세금기록: 공급가액/부가세/환급여부)
                      ├--1:N--> [CashflowItem]
                      |         (예정 입출금: 외상/미수금)
                      └--1:N--> [Attachment]
                                (영수증 이미지, Phase 3)
```

---

## 엔티티 상세

### User (사용자)
앱을 쓰는 사장 본인. 로컬 DB에 1명만 저장.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 (자동 생성) | usr-001 | O |
| name | 이름 | 김유강 | O |
| business_number | 사업자등록번호 | 123-45-67890 | X |
| tax_type | 과세 유형 (일반/간이) | 일반과세자 | O |
| google_email | 구글 계정 (시트 연동용) | me@gmail.com | O |
| google_sheet_url | 동기화할 구글시트 URL | https://... | X |
| created_at | 만든 날짜 (자동) | 2026-04-14 | O |

### Transaction (거래)
모든 돈의 움직임. 핵심 엔티티.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | txn-001 | O |
| date | 거래일 | 2026-04-14 | O |
| type | 타입 (purchase/sale/expense) | purchase | O |
| amount | 총 금액 (부가세 포함) | 330000 | O |
| counterparty_id | 거래처 참조 | cp-삼촌 | X |
| category_id | 분류 참조 | cat-상품 | O |
| memo | 메모 | "봄 신상 10개" | X |
| payment_status | 지불 상태 (paid/pending) | paid | O |
| synced_to_sheet | 구글시트 동기화 여부 | true | O |
| created_at | 등록 시각 | 2026-04-14 09:15 | O |

### Counterparty (거래처)
상대방. 사업자일 수도, "삼촌" 같은 개인일 수도 있음.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | cp-001 | O |
| name | 이름/상호 | 삼촌 | O |
| type | 타입 (supplier/customer/personal) | personal | O |
| phone | 연락처 | 010-1234-5678 | X |
| business_number | 사업자번호 (세금계산서용) | 111-22-33333 | X |
| memo | 메모 | "상품 공급, 외상 OK" | X |
| created_at | 등록일 | 2026-04-10 | O |

### Category (분류)
거래 성격. 세금공제 여부 포함.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | cat-001 | O |
| name | 이름 | 상품매입 | O |
| type | 거래 타입 매칭 | purchase | O |
| tax_deductible | 세금공제 가능 여부 | true | O |
| default_tax_rate | 기본 부가세율 (%) | 10 | O |

### TaxRecord (세금기록)
거래 1건당 세금 세부. 자동 생성.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | tax-001 | O |
| transaction_id | 거래 참조 (1:1) | txn-001 | O |
| supply_amount | 공급가액 | 300000 | O |
| vat_amount | 부가세액 | 30000 | O |
| is_refundable | 환급 가능 여부 | true | O |
| tax_invoice_issued | 세금계산서 발행 여부 | false | O |

### CashflowItem (예정 입출금)
외상·미수금 등 "아직 안 끝난 돈". 달력뷰에 표시.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | cf-001 | O |
| transaction_id | 거래 참조 | txn-001 | O |
| expected_date | 예정일 | 2026-04-30 | O |
| amount | 금액 | 330000 | O |
| direction | 방향 (incoming/outgoing) | incoming | O |
| status | 상태 (pending/completed/overdue) | pending | O |

### Attachment (첨부파일, Phase 3)
영수증 이미지 등.

| 필드 | 설명 | 예시 | 필수 |
|------|------|------|------|
| id | 고유 식별자 | att-001 | O |
| transaction_id | 거래 참조 | txn-001 | O |
| file_path | 로컬 파일 경로 | ~/MallBook/receipts/xxx.jpg | O |
| file_type | 파일 타입 | image/jpeg | O |
| uploaded_at | 업로드 시각 | 2026-04-14 | O |

---

### 관계 요약
- User 1명이 여러 개의 Transaction을 가짐 (1:N)
- Transaction 1건은 1개의 Counterparty, 1개의 Category에 속함 (N:1)
- Transaction 1건은 정확히 1개의 TaxRecord와 짝 (1:1)
- Transaction 1건은 여러 CashflowItem을 가질 수 있음 — 분할 상환도 지원 (1:N)
- Transaction 1건에 여러 Attachment(영수증 사진) 첨부 가능 (1:N)

---

## 왜 이 구조인가

**Transaction 중심 설계**: 모든 돈의 움직임이 Transaction에 모이고, 세금/현금흐름/첨부 등 부가 정보는 별도 테이블로 분리. 이유:
- 부가세 계산 로직이 바뀌어도 Transaction은 건드리지 않음 (TaxRecord만 수정)
- 현금흐름 예측을 빼도 거래 기록은 그대로 남음 — 점진적 확장 가능
- 구글시트 동기화는 Transaction 테이블만 감시하면 됨 — 단순함

**Counterparty 분리**: "삼촌"처럼 사업자가 아닌 상대도 개인(personal)으로 등록 가능. 나중에 세금계산서 발행 업체로 승격돼도 같은 레코드 유지.

**Category에 tax_deductible 포함**: 분류만 고르면 세금 공제 여부가 자동 판단됨. 사용자가 매번 판단할 필요 없음.

- **확장성**: Phase 2에서 부가세 자동 계산은 TaxRecord, 현금흐름은 CashflowItem만 추가하면 됨. 기존 Transaction 변경 불필요.
- **단순성**: 재고/상품 테이블 제외. Phase 1에선 "얼마 썼나"만 추적. 추후 Product 테이블 추가 시 Transaction에 product_id 컬럼 하나만 붙이면 확장됨.

---

## [NEEDS CLARIFICATION]

- [ ] 간이과세자 환급 규칙 반영 방식 (Category.default_tax_rate를 유저 설정으로 override할지)
- [ ] 거래 한 건이 여러 분류에 걸치는 경우 (예: 상품+운송비 혼합) → 한 거래로 볼지, 분할할지
- [ ] 환율/외화 거래 지원 여부 (해외 사입 시 필요)
- [ ] 삭제된 거래 처리 (hard delete vs soft delete with is_deleted flag)
