# MOMENT LINK v4

기존 Apple 스타일 고객 UI를 유지한 독립 상담 접수 앱입니다. 정적 시연용 v3에서 Node.js API·PostgreSQL·관리자 인증을 추가했습니다. `styles.css`는 원본을 유지합니다.

- 현재 배포: https://moment-link-preview.vercel.app
- 요청 도메인: https://link.teamboatn.com — Vercel 등록 완료, Cloudflare DNS 연결 미완료
- 비공개 저장소: https://github.com/skipperssh-create/moment-link
- 배포 방식: main 변경 → 기존 Vercel `moment-link-preview` 자동 빌드
- Vercel Hobby / 별도 Neon Free `moment-link-db` / Singapore
- 상세 현재 상태: [deployment/DEPLOYMENT.md](deployment/DEPLOYMENT.md)

## 구현

로그인 없는 4단계 상담 신청, 서버 유효성 검사와 중복 방지, 상품·가격·동의 스냅샷, 관리자/상담자 권한, HttpOnly 세션·CSRF·속도 제한, 통합 접수함·담당자·상태·메모·감사 이력, 직원 생성/중지와 세션 회수, 카탈로그 초안/게시·상품/패키지 추가·보관·판매 중지·순서, WebP 사진 업로드/대표/순서/대체텍스트, 주중/주말/특정일 가격, 장소/지도/주차/현장 연락처/후보 상태, 개인정보 안내 설정을 구현했습니다.

알림 outbox와 응답 후 실행, SOLAPI 그룹 식별자 기반 결과 조회, 푸시 구독/해제·접수 상세 이동, OPS 최종 승인 작업·가용성 검사·외부참조 대조·중단 복구를 구현했습니다. 실발송 및 실 OPS 연결이 완료됐다는 뜻은 아닙니다.

## 현재 운영 보류 항목

실제 접수는 개인정보 처리 주체·연락처·보유기간·고지문이 미확정이므로 `accepting=false`입니다. 문자/푸시/OPS 쓰기도 OFF입니다. 도메인 DNS, 대상 OPS의 외부 API 계약·인증, SOLAPI 번호/잔액/키, 실기기 SMS·PWA 푸시 검증, 실제 상품 사진, 확정 고지에 따른 보유기간 만료 삭제 작업이 남았습니다. 부가 선택옵션의 독립 가격 계산과 OPS 예약 변경/취소 동기화는 아직 구현되지 않았습니다.

Hobby는 Vercel 공식 정책상 개인·비상업 용도입니다. 실제 사업용 공개에 적합한 요금제 또는 호스팅 결정이 필요합니다. 사용자 지시대로 유료 업그레이드/구매는 하지 않았습니다. https://vercel.com/docs/plans/hobby

## 개발 및 검증

Node.js 24, pnpm 11.25.0 사용.

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run build
```

운영 DB를 사용하지 않는 로컬 합성 검수:

```powershell
$env:LOCAL_SYNTHETIC='true'
pnpm dev
```

http://127.0.0.1:4173 / 관리자 `local-admin` / 암호 `Local-synthetic-test-2026!`는 **LOCAL_SYNTHETIC 전용**이며 메모리 DB 종료 시 사라집니다. Vercel에서는 이 모드가 허용되지 않습니다.

실제 전용 DB에 대한 초기 설치는 `.env.example`의 서버 변수를 채우고 `MOMENT_LINK_DATABASE=true pnpm db:migrate`를 실행합니다. 기존 OPS DB URL을 재사용하지 않습니다. 실제 연결 정보는 Git에 올리지 않습니다. 현재 배포 DB는 이미 초기화됐고 `RUN_DB_MIGRATIONS=false`, 초기 관리자 해시 환경변수도 비웠습니다.

초기 관리자 자격증명은 작업 PC의 `.local/owner-credentials.json`에만 저장했습니다. Git/정적 배포에서 제외됩니다. 관리자 화면에서 비밀번호를 변경하면 기존 로그인 세션을 모두 회수합니다.

- [API 계약](docs/API_CONTRACT.md)
- [검증 결과](tests/TEST_REPORT.md)
- [배포/운영 인계](deployment/DEPLOYMENT.md)
- 원본 지시서와 v2/v3 증거는 역사 자료입니다. 완료 여부는 현재 배포 보고서를 따릅니다.
