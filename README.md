# 6학년 3반 탈출

1988년 토요일 오후의 교실에 갇힌 친구들이 자물쇠를 풀고 탈출하는 3인칭 3D 방탈출 게임입니다.

- 화면: Three.js (`index.html`)
- 호스팅: GitHub Pages
- 같은 교실 접속·말풍선: Supabase Realtime
- 탈출 명단: Supabase Postgres (`supabase/schema.sql`), 시간은 서버가 계산

## 온라인 기능 켜기
1. Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/schema.sql`을 실행합니다.
2. `config.js`에 프로젝트 URL과 공개용 키(anon / publishable)를 넣습니다.

`service_role` / `secret` 키는 절대 이 저장소에 넣지 마세요.

## 점검
`npm i --no-save playwright-core@1.48.2` 후 `node tests/play-through.js` (Chrome 필요)
