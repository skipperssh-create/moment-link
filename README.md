# MOMENT LINK · Codex 통합 개발 패키지 v3

**소스 + 지시서 + 디자인 기준 + 상품 데이터 + 테스트 + Vercel 배포 기록을 한 폴더에 담았습니다.**

## 가장 먼저
`START_HERE_CODEX.txt` → `AGENTS.md` → `CODEX_MASTER.md` 순서로 읽으세요.

미리보기: https://moment-link-preview.vercel.app

현재는 실제로 배포된 정적 프런트엔드입니다. 운영 DB·인증·접수 API·푸시·SOLAPI·OPS 연동은 아직 없습니다. 관리자 데모는 운영 로그인 화면이 아니며, 입력한 고객 정보는 메모리에만 있습니다. 실제 고객에게 접수 링크로 발송하지 마세요.

## 완료 / 남은 작업
|항목|상태|
|---|---|
|고객/관리자 UI, 상품 편집·패키지 선택·일정·문자 작성 화면|프런트엔드 구현|
|Apple-inspired minimal, 좁은 폰/폴드/태블릿/PC 가로세로 레이아웃|구현 + 대표 화면 크기 검사|
|Vercel 프로젝트·공개 미리보기 주소|생성, READY 및 HTTP 응답 확인|
|GitHub 새 저장소 및 Vercel Git 자동배포 연결|미완료, Codex에서 인증 후 진행|
|실제 인증·DB·고객 접수·알림·예약 API|개발 필요|
|실기기/Safari/키보드/OS SMS/PWA 설치·푸시|검증 필요|

## 실행
Node.js 22 및 Python 3 권장. 프런트엔드 런타임 외부 패키지는 없습니다.
```bash
npm run check
npm run build
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```
Windows는 마지막 명령의 `python3` 대신 `py`를 사용할 수 있습니다. `http://127.0.0.1:4173`을 엽니다. `standalone-preview.html`은 파일로 열어 볼 수 있는 보조 UI이며 PWA 검증용이 아닙니다.

## 검수
- 기능 50개 통과, 반응형 20개 뷰포트의 161개 검사 통과.
- 실제 CSS/JS를 Chromium에 넣어 실행, localStorage만 메모리 어댑터 사용.
- 컨테이너 HTTP 탐색이 제한되어 라이브 서비스 E2E/실기기 시험은 미완료.
- 자세한 실행 범위는 `tests/TEST_REPORT.md`.

## 폴더 안내
- `app.js`, `styles.css`, `index.html`: 실제 프런트엔드 소스.
- `catalog.confirmed.json`: 확정 상품 초기 데이터.
- `CODEX_MASTER.md`: 배포 현황·구현 지시·디자인·상품·미확정·인수 기준 통합본.
- `docs/DESIGN_LOCK.md`: 지킬 UI/UX 기준.
- `scripts/build.mjs`, `vercel.json`: 공개 파일만 만드는 배포 구성.
- `scripts/publish-github.mjs`: 인증된 Codex 환경에서 새 비공개 저장소를 생성/푸시하는 보조 스크립트. 기존 저장소 덮어쓰기 금지.
- `deployment/`: 실제 Vercel ID/주소/검증 기록. 비밀키 없음.
- `tests/`, `previews/`: 테스트 및 실제 UI 캡처.

## 배포 보안 경계
`dist/`만 배포합니다. 지시서·테스트·환경 파일을 정적 루트로 공개하지 않습니다. 고객 정보는 localStorage에 저장하지 않고, 상품 설정은 해당 브라우저에만 보존합니다. 사진은 실제 상품 사진 등록 전 자리표시자입니다. 키·인증정보를 앱 코드에 넣지 마세요.

기존 서비스나 유료 요금제는 변경하지 않았습니다. 사용자 요청에 따라 독립 Vercel 미리보기만 배포했습니다.
