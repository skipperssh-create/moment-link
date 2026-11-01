# MOMENT LINK v4.1

기존 Apple 스타일의 미니멀 UI를 보존한 비상업용 공개 상담 앱입니다. styles.css 원본 SHA256은 085D0FB9930A1A1B6FBBDFD9690BB7D256867C8EC894F922D087B49D9BBB2B6F입니다.

- 공개 주소: https://link.teamboatn.com
- 관리자: https://link.teamboatn.com/#admin
- 공개 소스: https://github.com/skipperssh-create/moment-link
- GitHub main → 기존 Vercel moment-link-preview 자동 배포
- Vercel Hobby / 독립 Neon Free / Singapore. 유료 구매 없음.

## 구현 및 활성화

실제 상담 접수, 서버 저장·중복 방지, 가격·옵션·동의 스냅샷, 관리자/상담자 권한, HttpOnly 세션·CSRF·속도 제한, 접수함·배정·상태·메모·감사 이력, 직원 생성/중지, 카탈로그 초안/게시·패키지·순서·판매중지, WebP 사진 관리, 주중/주말/특정일 가격, 선택 옵션의 서버 합산, 장소 안내를 구현했습니다.

2026-11-01 사용자의 비상업용 공개 지시에 따라 접수를 열었습니다. 처리 주체는 모먼트링크 운영팀, 문의는 1833-8047, 보유기간은 접수 후 30일입니다. 신규 운영 정책이며 법률 검토 인증을 의미하지 않습니다. 관리자에서 수정 가능하고 정책 수정 시 동의 버전 변경이 필요합니다. 만료 즉시 조회 차단, 매일 정리, 본인 삭제 요청의 관리자 처리를 지원합니다. 기존 접수는 동의 당시 보유기한을 유지합니다.

알림 outbox·안전 재시도·SOLAPI 결과 조회·웹 푸시 구독·접수 상세 이동을 구현했습니다. 무료 VAPID 키 및 서버 푸시는 ON, 실제 기기의 알림 권한/수신은 미검증입니다. SMS 실발송과 OPS 자동 쓰기는 OFF입니다.

## 아직 완료되지 않은 항목

BOATN/KHT/설렘의 실제 예약 등록·변경·취소 연동은 운영 API 계약과 전용 인증이 확보되지 않아 미완료입니다. 로컬 BOATN 개발 계약은 예약 권한이 false이며 기존 PWA의 설렘 연결도 로컬 검증 기록입니다. 이를 운영 연결로 승격하지 않았습니다. 기존 운영 코드·DB·예약은 변경하지 않았습니다.

실제 상품 사진, 미확정 가격/주소는 임의 생성하지 않았습니다. 물리 iOS/Android의 설치·푸시·문자 앱 전달은 미검증입니다. 문자 실발송은 사용자 보류 조건과 공급자 설정이 남아 있습니다.

## 실행

Node.js 24, pnpm 11.25.0. pnpm install --frozen-lockfile, pnpm run check, pnpm test, pnpm run build.

PowerShell에서 $env:LOCAL_SYNTHETIC='true' 후 pnpm dev. http://127.0.0.1:4173 의 local-admin / Local-synthetic-test-2026! 는 메모리 합성 DB 전용입니다. Vercel에서는 이 모드를 사용하지 않습니다.

전용 운영 DB 초기화: MOMENT_LINK_DATABASE=true로 scripts/migrate.mjs 실행. 현재 스키마 2까지 적용됐고 RUN_DB_MIGRATIONS=false입니다. 실제 키는 Git에 올리지 않습니다.

최초 관리자 정보는 작업 PC .local/owner-credentials.json에만 있으며 Git/공개 정적 출력에서 제외됩니다. 비밀번호 변경 시 기존 자기 세션은 회수됩니다.

- [현재 배포 상태](deployment/DEPLOYMENT.md)
- [API 계약](docs/API_CONTRACT.md)
- [검증 결과](tests/TEST_REPORT.md)

원본 v2/v3 지시서의 미리보기/배포 상태는 역사 기록이며 최신 사용자 지시와 현재 배포 보고서가 우선합니다.
