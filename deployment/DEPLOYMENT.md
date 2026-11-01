# MOMENT LINK 현재 배포·운영 인계 · 2026-11-01

## 완료

- ZIP 원본 해제 및 START_HERE_CODEX.txt, AGENTS.md, CODEX_MASTER.md/하위 문서 확인.
- 새 **비공개** GitHub 저장소: https://github.com/skipperssh-create/moment-link
- 기존 Vercel 프로젝트 `moment-link-preview` (`prj_iXF9GTtMSqvGnAMctXDKRvPAEbMZ`)에 GitHub main 자동 배포 연결.
- 팀 `skipperssh-7474s-projects` (`team_87cJPIp6fEpRqArZ8VXppNZU`), **Hobby 유지**. 새 Vercel 프로젝트 없음.
- 최초 Git 자동배포 READY commit `57b0bcc31e73270908eaf247c0f06df0a660dd2a`, deployment `dpl_4edgYSecX6vJUg83vDExKMcfWLwP`.
- 최초 실제 백엔드/DB READY commit `96c2d1cd6f5d756d1dc09882a69b4c156994549c`, deployment `dpl_BtigUB8TSFKHGRrAn8UpqUnPHeWb`. 이어서 본 저장소 main에 보강 코드·검증 보고서를 올립니다. 마지막 실행 증거는 작업 PC `.local/deployment-verification.json`에 기록합니다.
- 독립 **Neon Free** `moment-link-db` (Singapore, resource `raspy-band-60660746`). production에만 연결, 기존 DB와 분리. 프리뷰·로컬에는 운영 비밀키를 연결하지 않음.
- 전용 `moment_link` 스키마/초기 상품/관리자 생성 완료. idempotent migration, 기존 레코드 보존. 초기화 뒤 RUN_DB_MIGRATIONS=false, INITIAL_ADMIN_HASH 빈 값으로 전환.
- 관리자 인증/역할·실제 PostgreSQL 저장 API·상품 관리·알림 작업·OPS 어댑터 구현. `README.md`와 `docs/API_CONTRACT.md` 참조.
- `styles.css` 원본 보존. 검색엔진 noindex 유지. API/개인정보는 SW 캐시에서 제외.

## 접속 주소

현재 정상 주소: **https://moment-link-preview.vercel.app**
관리자: **https://moment-link-preview.vercel.app/#admin**
요청 주소: **https://link.teamboatn.com** — Vercel 프로젝트 등록·소유권 확인은 완료했으나 DNS misconfigured 상태입니다. 정상 최종 접속 주소로 보고하지 않습니다.

Cloudflare DNS 설정에 필요한 레코드:

| 유형 | 이름 | 대상 | 프록시 |
|---|---|---|---|
| CNAME | link | 046d500a4d5af781.vercel-dns-017.com | DNS only |

teamboatn.com 네임서버는 teresa.ns.cloudflare.com / garrett.ns.cloudflare.com입니다. Cloudflare 로그인 세션이 없고 로그인 입력 화면에서 더 진행할 인증정보가 없어 DNS를 변경하지 못했습니다. 기존 root/mail/OPS 레코드는 변경하지 않았습니다. 로그인 완료 후 이 한 레코드만 연결하고 Vercel DNS/TLS를 재검증해야 합니다. TTL은 Auto 사용 가능.

## 운영 활성화가 남은 항목

1. 개인정보 처리 주체, 문의 연락처, 보유기간, 고지문, 버전 확정. 현재 accepting=false이며 서버도 제출을 거절합니다. 관리자 ‘접수·개인정보’에서 확정 사항 저장 가능. 고지를 추정해 넣지 않았습니다.
2. Hobby는 개인·비상업 용도라는 Vercel 제한이 있으므로 실제 영업용 공개에는 요금제/호스팅 결정이 필요합니다. 유료 업그레이드·구매는 실행하지 않았습니다. https://vercel.com/docs/plans/hobby
3. SOLAPI 키/검증된 발신번호/관리자 수신번호/잔액/문구 및 실발송 승인. 서버 SMS_LIVE_ENABLED=false, 앱 전역·고객·관리자 토글 false. 실제 문자 0건.
4. VAPID 키·관리자 기기 동의·iOS/Android 실기기 수신 검증. PUSH_LIVE_ENABLED=false. 서버·SW·구독 코드는 있으나 실제 푸시 미검증.
5. BOATN/KHT/설렘의 독립 예약 API 계약·인증·가용성 원자성 검증. OPS_WRITES_ENABLED=false. 제안 어댑터를 기존 API라고 주장하지 않습니다. 기존 OPS는 읽기 확인만 했습니다.
6. 실제 상품 사진, 아직 확정되지 않은 가격/구성/장소. 판매 화면에 임의 데이터 추가 없음.
7. 확정 개인정보 정책에 따른 만료 삭제/보존 작업, 부가 선택옵션의 독립 금액 계산, OPS 예약 변경/취소 동기화 구현.
8. 물리 기기의 SMS/홈 화면/푸시, 부하·침투 검증.

## 관리와 복구

자격증명은 로컬 `.local/owner-credentials.json`에만 저장했습니다. Git/정적 배포에서 제외됩니다. 로그에 암호·고객 정보를 출력하지 않았습니다.

운영 DB는 production 환경에만 연결됩니다. 새 개발자에게 실제 키를 전달할 때는 Vercel 환경 권한을 사용합니다. `.env.example`에 실제 비밀값을 쓰지 않습니다. 운영 DB 접속 URL을 기존 OPS와 공유하지 않습니다.

Git main 변경은 자동 배포됩니다. 실패 시 기존 READY 배포를 유지하고 로그에서 원인을 확인합니다. DB 마이그레이션을 롤백한다고 데이터를 DROP하지 않습니다. 기존 검증된 배포로 되돌릴 수 있으나 스키마 호환 여부를 먼저 확인합니다.

문자/OPS uncertain은 결과 불명 상태입니다. 무조건 새 예약·새 문자 작업을 만들어 재시도하지 않습니다. 먼저 공급자 그룹 ID 또는 externalRef로 조회합니다. 관리자 상태 확인 작업은 이 원칙을 유지합니다.
