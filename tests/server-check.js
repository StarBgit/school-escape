// 실제 Supabase 서버 점검: 공개 키로 할 수 있는 일과 막혀야 하는 일을 확인한다. 기록은 남기지 않는다.
// 실행: node tests/server-check.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
const url = src.match(/url: '([^']+)'/)[1], key = src.match(/anonKey: '([^']+)'/)[1];
const H = { apikey: key, 'Content-Type': 'application/json' };
const rpc = (n, b) => fetch(`${url}/rest/v1/rpc/${n}`, { method: 'POST', headers: H, body: JSON.stringify(b || {}) });
const line = async (name, r, wantOk) => { const t = await r.text(); const ok = r.ok === wantOk; console.log(ok ? 'OK  ' : 'FAIL', name, r.status, t.slice(0, 120)); return t; };
(async () => {
  await line('명단 읽기', await rpc('get_scores', { p_player: '00000000-0000-4000-8000-000000000000' }), true);
  const run = JSON.parse(await line('게임 시작 기록', await rpc('start_run'), true));
  await line('너무 빠른 탈출은 거부', await rpc('finish_run', { p_run: run, p_player: '00000000-0000-4000-8000-000000000000', p_nick: '점검', p_hints: 0 }), false);
  await line('표 직접 읽기는 거부', await fetch(`${url}/rest/v1/scores?select=*`, { headers: H }), false);
  await line('표 직접 쓰기는 거부', await fetch(`${url}/rest/v1/scores`, { method: 'POST', headers: H, body: JSON.stringify({ player_id: '00000000-0000-4000-8000-000000000000', nick: 'x', ms: 20000 }) }), false);
  await line('시작 기록 직접 읽기는 거부', await fetch(`${url}/rest/v1/runs?select=*`, { headers: H }), false);
})().catch((e) => { console.error('crash', e); process.exit(1); });
