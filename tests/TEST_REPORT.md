# MOMENT LINK v4 검증 결과 · 2026-11-01

## 이번에 실행한 검사

- `pnpm run check`: app/admin/API/jobs/service worker 문법 검사 통과.
- `node --test tests/server.test.mjs`: **24/24 통과**. 실제 PGlite PostgreSQL과 서버 핸들러를 사용하며 모의 DB가 아닙니다. 외부 문자/OPS는 test double만 사용했습니다.
- `node scripts/build.mjs`: 정적 공개 파일 9개 생성. 서버 소스·문서·자격증명 제외.
- localhost 실제 브라우저 E2E: 헬기 원본+추억영상 1,090,000원 → 2026-12-15 오후 → 합성 연락처 → 접수 완료 `ML-DDA6C29FA7C045` → 다른 브라우저의 인증된 관리자 접수함에서 동일 접수번호 조회. 실제 개인정보·실발송 없음.
- 관리자 상품 폼의 초안 서버 저장 성공 확인.
- 내장 Chromium **20개 뷰포트 × 7개 화면 = 140개** 가로 넘침 검사 통과. 상품 화면 가격 너비 검사 포함. 매 회 실제 innerWidth/innerHeight가 요청값과 일치하는지 확인했습니다. 대상: 서비스 선택, 요트 출항형, 헬기, 일정, 연락처, 완료, 관리자 상품 편집. 원시 결과 `v4-responsive.json`.
- 브라우저 콘솔 error 0건.
- 실제 Vercel/Neon: DB 초기 스키마·시드 빌드 성공, 원격 catalog 200, 실제 관리자 로그인·접수함 조회 성공, Vercel Git 자동 배포 READY. 마지막 배포 증거는 작업 PC `.local/deployment-verification.json` 참조.

## 중요한 보안/장애 검증

비로그인 거절, CSRF/교차 Origin 거절, HttpOnly/Secure 쿠키, 상담자 배정 범위, 세션 회수, 중복 접수/동일 키 다른 내용 거절, 서버 가격 스냅샷, 과거·잘못된 날짜/중복 순위 거절, 상품/고지 버전 충돌, 초안과 게시 분리, 문자 OFF 무발송/소급 없음, 커밋 후 알림 처리, 중단된 SMS는 GET 대조만 수행, 중단/타임아웃 OPS 재생성 차단, 직원 중지·자기 관리자 중지 금지, 허용되지 않은 이미지 거절, 특정일 가격 중복/판매중지 검증.

## 실행하지 않았거나 통과로 계산하지 않은 것

실제 iPhone/iPad/Galaxy Fold/Safari, 홈 화면 설치·OS 푸시 수신, sms: URI 본문 전달과 실제 문자 발송, 실제 OPS 생성·가용성 경쟁, 개인정보 고지 확정 후 운영 접수, 외부 DNS 인증서 완료, 부하/침투 검사는 미실행입니다. 원격 DB에 고객 접수 테스트를 넣기 위해 개인정보 정책을 임의로 확정하지 않았습니다.

Chrome 확장의 viewport override가 실제 너비를 바꾸지 않은 초기 시도는 검증 수에서 제외했습니다. 내장 Chromium으로 다시 검사한 140개만 집계했습니다. 물리 기기 검수와 동일하지 않습니다.

v3의 50개 기능/161개 화면 검수는 이번 실행 결과가 아닙니다. 원본은 `v3-evidence/TEST_REPORT.md`에 보존했습니다. 기존 `test_preview.py`는 v3 관리자 데모 기반이므로 v4 서버 회귀 테스트로 사용하지 않았습니다. 사진은 운영 사진 등록 전 자리표시자입니다.
