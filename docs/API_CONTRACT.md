# MOMENT LINK API v4.1

모든 JSON 응답은 no-store입니다. 쓰기 요청은 `Content-Type: application/json`, 허용된 Origin이 필요합니다. 인증된 쓰기는 세션 쿠키와 `X-CSRF-Token`이 필요합니다. 세션/CSRF/고객 정보를 localStorage에 저장하지 않습니다. 금액은 정수 원, 미정은 null이며 0원과 구분합니다.

| API | 동작 / 권한 |
|---|---|
| GET /api/catalog | 최신 게시 버전, 노출 상품, 고객용 최소 설정 |
| POST /api/consultations | 원자적 접수 저장. Idempotency-Key 20~100자의 영숫자/하이픈 필수 |
| POST /api/auth/login | username/password → user/CSRF + Secure HttpOnly SameSite=Strict 쿠키 (8시간) |
| GET /api/auth/session | 세션 조회, 비로그인은 user:null |
| POST /api/auth/logout | 현재 서버 세션 회수 |
| POST /api/auth/password | current/password(12자 이상). 모든 자기 세션 회수 |
| GET /api/admin/consultations?q=&offset= | 관리자 전체 / 상담자 배정 건만. 최대 50개 |
| GET /api/admin/consultations/:id | 요청·스냅샷·메모·이력. 권한 없으면 404 |
| PATCH /api/admin/consultations/:id | version, status?, assignee?, contacted?, read?. 담당 변경은 관리자만 |
| POST /api/admin/consultations/:id/notes | body. 해당 건 조회 가능한 직원 |
| POST /api/admin/consultations/:id/confirm | 관리자 명시 승인과 최종 일정 입력 → 독립 OPS 작업. 아직 예약 확정 아님 |
| GET/PUT /api/admin/catalog | 관리자. version/products/publish. 초안과 게시 분리, 기존 상품 누락 시 보관 |
| GET/PUT /api/admin/settings | 관리자. version/data. 개인정보 고지 미확정 시 접수 활성화 거절 |
| POST /api/admin/media | 관리자. base64 data/alt. JPEG/PNG/WebP만, 1MB/20MP 제한, 최대 1600px WebP 변환 |
| GET /api/media/:id | 공개 상품 사진만 제공 |
| GET/POST /api/admin/users | 관리자. 직원 목록 / username/password/role 생성 |
| PATCH /api/admin/users/:id | 관리자. role/active. 자기 중지 금지, 마지막 관리자 보호, 세션 회수 |
| POST/DELETE /api/admin/push | 관리자 기기 구독 저장 / 자기 구독 해제. expirationTime:null 허용 |
| GET /api/admin/jobs | 관리자. 최근 알림·연동 작업 상태 |
| POST /api/admin/jobs/run | 관리자. kind(notification/integration), id. 상태 조회/안전 재시도 |

접수 body: `catalogVersion, productId, packageId, optionIds?:string[], category, person, phone, preferences:[{date,time}], place, notes, consent:true, consentVersion`. 선택적 website는 빈 값만 허용하는 스팸 필드입니다. 가격/상태/접수번호는 클라이언트가 지정할 수 없습니다. 시간은 Asia/Seoul, HH:mm 또는 오전/오후/저녁/시간 무관. 1~2순위, 과거 날짜와 완전히 동일한 순위 거절. 주중/주말과 관리자가 명시한 특정일 가격을 스냅샷에 보존하며 임의 휴일 규칙을 추정하지 않습니다.

저장 성공은 201 `{receipt,replayed:false}`, 같은 내용 재시도는 200 같은 receipt, 다른 내용으로 키 재사용은 409. 카탈로그/고지 버전 충돌 409, 입력 오류 400, 비로그인 401, 인가/CSRF 403, 속도 제한 429, 접수 보류 503. 실패는 `{error,message,requestId}`이며 로그에 원문 개인정보·비밀번호·DB 접속문자열을 기록하지 않습니다.

## 알림 계약과 한계

OFF일 때 outbox를 만들지 않습니다. 전역/개별/서버 게이트를 발송 직전 다시 확인합니다. ON으로 바꿔도 과거 건을 만들거나 blocked 작업을 소급 발송하지 않습니다. 저장 트랜잭션 커밋 뒤 `waitUntil`로 새 작업을 실행합니다. 실패해도 접수 저장은 유지됩니다. 플랫폼 중단으로 남은 작업은 관리자에서 확인할 수 있습니다. 상시 워커/유료 큐는 사용하지 않습니다.

SMS는 SOLAPI 그룹 생성→그룹 ID 영속 저장→메시지 등록 결과 검증→전송 요청 순서입니다. `sent`는 공급자 접수 상태입니다. 결과 조회에서만 SMS_DELIVERED/DELIVERY_FAILED를 구분합니다. sending 상태가 2분 이상 오래되면 uncertain으로 바꾸고 기존 그룹을 GET 조회합니다. 결과 불명 시 자동 재전송하지 않습니다. 발송 전 안전한 설정 실패만 failed 재시도 대상으로 삼습니다. 여러 푸시 대상 중 일부만 처리되고 중단된 경우도 uncertain으로 남기며 무조건 재발송하지 않습니다.

SOLAPI 공식 계약: https://solapi.com/developers/api/msg-groups-getGroupInfo · https://solapi.com/developers/api/msg-groups-addGroupMessages · https://solapi.com/developers/api/msg-groups-sendGroupMessage

푸시 잠금화면에는 일반 접수 알림만 표시합니다. 상세 링크는 다시 서버 인가를 거칩니다. 푸시 서버 키는 production에 설정하고 ON으로 전환했습니다. 기기 알림 허용 및 실제 수신은 미검증입니다.

## OPS 제안 계약 — 실제 시스템 계약으로 오인 금지

기존 BOATN/KHT/설렘 운영 DB·코드는 변경하지 않았습니다. 연결을 위해 대상별 BASE_URL/TOKEN/CONTRACT_VERIFIED와 전역 OPS_WRITES_ENABLED가 모두 필요합니다. 기존 로그인 세션이나 기존 DB 키를 재사용하지 않습니다.

1. `GET bookings/by-reference/:externalRef` → `{id}` 또는 404
2. `POST availability` → `{available:true,token}`
3. `POST bookings` + Idempotency-Key → `{id}`. body에 externalRef, availabilityToken, 최종 승인 일정/금액/장소/자원/상품/연락처. 대상 서비스는 가용성 토큰을 원자적으로 검사하고 externalRef 유일성을 보장해야 합니다.

이는 연동 어댑터가 요구하는 **제안 계약**입니다. 세 OPS가 이 경로를 제공한다고 확인된 것이 아닙니다. 대상 서비스의 실제 계약과 사용자 권한 검증이 완료될 때까지 호출을 차단합니다. 쓰기 타임아웃 후에는 externalRef 조회만 수행합니다. 결과를 알 수 없으면 uncertain을 유지합니다. API 조회 실패나 OFF 전환이 이 상태를 지우지 않습니다. booking ID 확인 후에만 상담을 confirmed로 변경합니다. 예약 변경·취소 자동 동기화는 미구현입니다.

## 보유기한 및 공개 고지

접수에 expires_at을 동의 당시 보유기간으로 계산합니다. 만료 접수는 조회에서 제외합니다. DELETE /api/admin/consultations/:id 는 관리자·CSRF 확인 후 즉시 만료 처리, POST /api/admin/retention은 만료 상담과 종속 메모/작업/감사 내용을 정리합니다. GET /api/admin/retention은 최근 정리 시각을 확인합니다. GET /api/cron/retention은 32자 이상 CRON_SECRET의 정확한 Bearer 인증이 필요합니다. 일일 스케줄과 관리자 수동 정리를 제공합니다.

패키지 options[{id,name,amount}]를 관리자에서 구성하고 고객은 optionIds만 제출합니다. 서버가 유효성과 중복을 검사하고 기본/특정일 가격에 합산하여 스냅샷에 저장합니다. 미정 가격(null)은 0원으로 바꾸지 않습니다. 개인정보 고지 변경에는 새 consentVersion이 필요합니다.
