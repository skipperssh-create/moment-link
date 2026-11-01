# MOMENT LINK v3 실제 검증 결과

기준일: 2026-11-01. 사용자가 요청한 소스/지시서 통합 및 미리보기 배포를 위한 검증이다.

|검사|통과|실패|
|---|---:|---:|
|고객·관리자 흐름/상품 규칙|50|0|
|20개 뷰포트 주요 화면/런타임|161|0|

명령:
```bash
npm run check
npm run build
python tests/test_preview.py --isolated --chromium /usr/bin/chromium --phase flows
python tests/test_preview.py --isolated --chromium /usr/bin/chromium --phase responsive
```

- Chromium에서 실제 app.js/styles.css를 inline 렌더링했고 localStorage만 메모리 어댑터로 대체했다.
- 고객 선택/접수 시연, 상품·패키지 CRUD, 요금과 조건, 선택형 2순위, 개인정보 비보존, 반응형 가로 넘침 등을 검사했다.
- 로컬 HTTP 브라우저 실행은 `ERR_BLOCKED_BY_ADMINISTRATOR` 제한으로 실행하지 못했다. 네트워크 통합 테스트로 계산하지 않는다.
- 실제 폴드/아이폰/아이패드 하드웨어, Safari, OS SMS 전송, 클립보드/홈화면 설치/웹푸시는 검증하지 않았다.
- Vercel 실제 배포는 READY 및 빌드 로그를 확인. 연결 도구 HTTP 확인에서 `/` 200, `/manifest.webmanifest` 200, `/CODEX_HANDOFF.md` 404.
- 외부 DNS가 제한되어 컨테이너로 배포 파일 전체를 내려받아 해시 비교하는 테스트는 완료하지 못했다. 대신 배포 빌드 자체가 기대 SHA-256을 검사한 후 정적 파일을 생성했다.
- 사진은 실제 운영 사진이 아니라 등록 자리표시자이며, 운영 데이터베이스·인증·알림 서버는 없다.

`deployment/http-verification.json`은 실패한 컨테이너 네트워크 시도의 원인 기록이고, 성공한 connector HTTP 확인은 `deployment/REMOTE_STATUS.json`에 구분했다. 이전 v2 결과는 `tests/v2-evidence/`에 보존했다.
