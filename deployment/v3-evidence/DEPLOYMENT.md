# 실제 배포 상태 · 2026-11-01

## 접속 주소
https://moment-link-preview.vercel.app

- 팀: `skipperssh-7474s-projects` / `team_87cJPIp6fEpRqArZ8VXppNZU`
- 프로젝트: `moment-link-preview` / `prj_iXF9GTtMSqvGnAMctXDKRvPAEbMZ`
- 배포: `dpl_71WwKHodXzeFtEiQdfUDXTGoHJqB` / Vercel `READY`
- 환경: production 별칭에 올린 **개발 미리보기**. 운영 서비스 완성이 아니다.
- 배포 방식: Git 저장소가 아닌 Vercel API 직접 소스 업로드.
- GitHub 저장소 생성: **미완료**. GitHub 자동배포 연결도 **미완료**.
- 기존 BOATN·헬기·설렘 OPS, 고객 DB, DNS는 변경하지 않았다.

## 공개 범위
`dist/`의 HTML/CSS/JS, PWA 기본 파일, 아이콘, robots, 404 페이지만 배포한다. 소스에는 개인정보·키가 없다. 지시서·검수 자료·환경 파일은 공개 파일에 포함하지 않는다. 관리 화면은 누구나 볼 수 있는 **독립 시연 화면**이며 로그인된 운영 관리자 권한이 아니다. 편집은 해당 브라우저에만 적용된다.

## 확인한 결과
Vercel 빌드 로그에서 페이로드 SHA-256 무결성 검사와 정적 파일 8개 생성, READY를 확인했다. Vercel 연결 도구 HTTP 조회에서 루트와 manifest는 200, `/CODEX_HANDOFF.md`는 404였다. noindex 및 보안 헤더도 응답에 있었다.

이 환경은 컨테이너 외부 DNS와 브라우저 URL 탐색이 제한되어 원격 주소의 전체 브라우저·기기 E2E 검사는 하지 못했다. 로컬 기능/반응형 검사는 실제 소스를 inline 렌더링하여 별도로 수행했다.

## 다음 배포 작업
1. 이 폴더를 인증된 Codex 환경에서 실행하고 검수한다.
2. GitHub `skipperssh-create/moment-link`라는 새 비공개 저장소를 만들고 올린다. 이미 존재하면 읽기 확인/차이 검토 후 연결하며 강제 덮어쓰기하지 않는다.
3. 새 Vercel 프로젝트를 또 만들지 않는다. 위 프로젝트를 재사용하고 저장소를 Git 연결한다. 로컬 `vercel link`만으로 Git 자동배포 연결이 끝난 것으로 보고하지 않는다.
4. main 푸시가 위 프로젝트의 새 배포를 생성하는지 검증하고, 실제 연결된 commit SHA와 URL을 기록한다.
5. 운영 인증/DB 등을 붙이기 전까지 데모 표시·실고객 입력 금지·noindex를 유지한다. 문자/푸시/OPS 실발송은 승인 후 별도 활성화한다.

사용자 최종 요청은 새 독립 저장소/미리보기 배포를 승인한 것이다. 유료 업그레이드나 기존 서비스의 설정 변경까지 포괄하는 승인은 아니다.
