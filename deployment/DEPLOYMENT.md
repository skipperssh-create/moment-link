# 공개 배포 및 운영 인계 · 2026-11-01

## 완료

- ZIP 해제 및 시작 문서 확인, 원본 미니멀 UI 보존.
- GitHub 공개 저장소 https://github.com/skipperssh-create/moment-link
- 기존 프로젝트 moment-link-preview에 main Git 자동 배포 연결. 프로젝트 ID prj_iXF9GTtMSqvGnAMctXDKRvPAEbMZ, 팀 team_87cJPIp6fEpRqArZ8VXppNZU.
- Vercel Hobby 및 별도 Neon Free moment-link-db 유지. 사용자가 비상업용임을 명시했습니다. 구매·업그레이드 없음.
- 공개 기능 배포 commit a773d71546938bdcff61164cf85d08a7b41db672, READY dpl_8JoyLiqV2JFhmD7KNwnAFFuWSPsX.
- Cloudflare CNAME link → 046d500a4d5af781.vercel-dns-017.com, DNS only, TTL Auto 추가. 기존 11개 root/mail/OPS 레코드는 유지했습니다. Vercel misconfigured=false, HTTPS 200 확인.
- 실제 상담 접수 accepting=true, 관리자 인증, 개인정보 고지, 추가 옵션, 30일 보유·파기 기능. 스키마 2 적용.
- VAPID/CRON_SECRET은 production 서버에만 설정. 푸시 서버 ON, SMS 및 OPS 쓰기 OFF. 초기 관리자 해시는 비웠고 마이그레이션 빌드 플래그는 다시 false.
- 공개 사이트의 noindex 해제, API에는 noindex/no-store 유지. 소스·비밀키·고객 데이터는 정적 공개 파일에서 제외.

## 최종 주소

고객: https://link.teamboatn.com

관리자: https://link.teamboatn.com/#admin

개인정보 안내: https://link.teamboatn.com/privacy.html

보조 주소: https://moment-link-preview.vercel.app

## 검증

운영 DB 합성 접수 ML-1965365CC4E845: 접수/중복 방지/관리자 조회/USB 포함 358,000원/30일 고지 저장/삭제 검증 완료. 테스트 데이터와 연결 알림 작업은 삭제했습니다. 문자 0건, OPS 쓰기 0건. 인증된 cron 수동 호출 성공, 일일 cron은 매일 18시 UTC(한국 03시) 설정입니다. 실제 30일 경과 검증이 아니라 만료 시점을 조정한 자동 테스트로 삭제를 검증했습니다.

루트 200, catalog 200, 비로그인 관리자 API 401, 비밀파일·소스 문서 404. 배포 오류 로그 검색 결과 없음. 추가 옵션 7개 화면 크기 검증 통과. 이전 140개 반응형 검증과 구분합니다.

## 미완료 / 보류

1. OPS 실예약 등록·변경·취소: 운영 API와 범위 제한 서비스 인증 미확보. 어댑터·중복/불명 상태 복구만 구현·합성 검증했습니다. 기존 운영 시스템은 변경하지 않았습니다.
2. SMS 실제 발송: 사용자의 보류 조건 유지. SOLAPI 키·확인된 발신 설정·실발송 승인도 남아 있습니다.
3. 관리자 기기의 푸시 수신: 서버 키·구독 코드·브라우저 JSON 호환은 완료. 실제 브라우저 알림 허용/수신과 iOS·Android 실기기 검수는 미완료. 확인 과정에서 컴퓨터 제어 도구가 Windows 브라우저 URL을 확실히 판별하지 못해 UI 제어를 종료했습니다.
4. CLASSIC·PREMIUM 이외 상품의 미제공 사진, 미확정 상품 가격·주소, 부하·침투 검증.

## 관리와 복구

소유자 자격증명: 로컬 .local/owner-credentials.json. 서버 비밀키: Vercel production 환경. Git이나 화면 보고서에 원문을 넣지 않습니다. 로컬 .local/public-launch-verification.json에 합성 검증 증거를 기록했습니다.

원격 main 이력을 로컬 개발 브랜치로 가져왔습니다. 이전 독립 로컬 이력은 codex/pre-public-local-history로 보존했습니다. 배포 실패 시 기존 READY를 유지하고 원인을 확인합니다. 스키마 2 이후 코드 롤백 시 expires_at 필수 컬럼 호환성을 검토해야 하며 DB를 DROP하지 않습니다.

개인정보 정리는 CRON_SECRET Bearer 인증을 요구하며 관리자 수동 정리도 가능합니다. 만료 레코드는 본문/동의/옵션/메모/연결 작업과 관련 감사 이력을 함께 삭제합니다. 공급자 백업 사본은 공급자의 수명 주기를 따릅니다.

## 요트 사진 추가 반영

CLASSIC 2장, PREMIUM 6장 보정 및 운영 DB 게시 완료(카탈로그 4). 대표사진 16:9, 상세사진 원래 비율 유지. 기존 상품 가격·구성과 운영 설정 보존 확인. 상세 산출물·검증: docs/YACHT_PHOTOS.md.

## 상담 단계 이동 및 비교표

브라우저 방문 기록 기반 이전 단계 이동, 첫 화면 이탈, 입력 유지, 새 상담 기록 정리, 상품별 제공사항 비교표를 추가했습니다. 운영 DB 상품·가격·사진·설정은 그대로 유지합니다. 검증: docs/NAVIGATION_COMPARISON.md.

## 헬기 사진 추가 반영

헬기.zip의 7장을 헬기 프로포즈에 등록했습니다(대표 1장·상세 6장, 카탈로그 5). JPEG 원본을 보존하고 방향 적용·웹용 WebP 변환을 했습니다. 기존 가격·제공사항·다른 상품·설정 보존 검증 완료. 서로 다른 원본 비율의 대표사진 프레임 맞춤 수정. 상세 docs/HELICOPTER_PHOTOS.md.

## 요트 상품 비교표

최신 사용자 첨부 이미지에 맞춰 각 요트의 라이트·올인원 포함 항목을 ✓ / –로 비교합니다. 기존 요트 3종 가격 종합표는 제거했습니다. 출항형 9개 항목은 첨부표 기준으로 반영하고 명시적 미포함 목록을 관리자에서 편집할 수 있습니다. 가격·사진·정박형 구성은 유지합니다. 검증: docs/YACHT_COMPARISON.md.
