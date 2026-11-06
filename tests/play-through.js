// 버튼 이동 + 드래그 시점 + 3인칭 + (가짜) Supabase 전체 흐름을 실제 Chrome으로 점검한다.
// 실행: NODE_PATH=<playwright-core가 있는 node_modules> QA_DIR=<임시 폴더> node tests/play-through.js
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), os = require('os');
const SRC = path.join(__dirname, '..');
const QA = process.env.QA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'escape-qa-'));
console.log('QA_DIR', QA);
const SITE = path.join(QA, 'site'); fs.mkdirSync(SITE, { recursive: true });
fs.copyFileSync(SRC + '/index.html', SITE + '/index.html');
fs.writeFileSync(SITE + '/config.js', "window.ESCAPE_CONFIG={url:'https://mock.supabase.co',anonKey:'mock'};");
const OUT = path.join(QA, 'shots2'); fs.mkdirSync(OUT, { recursive: true });
const MOCK = `
window.__rpc=[];window.__sent=[];window.__tracked=[];
const handlers={};
const ch={on(t,f,cb){handlers[t+':'+f.event]=cb;return ch;},subscribe(cb){window.__ch=ch;setTimeout(()=>cb('SUBSCRIBED'),30);return ch;},
 track(s){window.__tracked.push(JSON.parse(JSON.stringify(s)));return Promise.resolve();},send(m){window.__sent.push(m);return Promise.resolve();},
 presenceState(){return window.__state||{};}};
window.__fire=(k,v)=>handlers[k]&&handlers[k](v);
window.supabase={createClient(){return{channel(){return ch;},rpc(n,a){window.__rpc.push([n,a]);
 if(n==='get_scores')return Promise.resolve({data:window.__rows||[{nick:'철수',ms:241000,hints:1,me:false},{nick:'bad',ms:'x'}],error:null});
 if(n==='start_run')return Promise.resolve({data:'run-1',error:null});
 if(n==='finish_run'){window.__rows=[{nick:a.p_nick,ms:60000,hints:a.p_hints,me:true},{nick:'철수',ms:241000,hints:1,me:false}];return Promise.resolve({data:{ms:60000,best:60000,improved:true},error:null});}
 return Promise.resolve({data:null,error:{message:'x'}});}};}};`;

(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  const page = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_FILE/.test(m.text())) errors.push('console: ' + m.text()); }); return p; };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } });
  await ctx.route('**/supabase-js@*/**', (r) => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  const p = await page(ctx);
  await p.goto('file://' + SITE + '/index.html'); await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/1-start.png' });
  await p.fill('#nick', '승현'); await p.click('#go'); await p.waitForTimeout(2000);
  await p.screenshot({ path: OUT + '/2-third.png' });
  const T = (fn, a) => p.evaluate(fn, a);
  const check = (name, ok, extra) => { console.log((ok ? 'OK  ' : 'FAIL'), name, extra === undefined ? '' : JSON.stringify(extra)); if (!ok) errors.push(name); };

  // 1) 이동 버튼: 누르는 동안만 걷고, 드래그는 위치를 바꾸지 않는다
  const pos0 = await T(() => [__t.me.x, __t.me.z]);
  const up = await p.locator('#pad [data-dir="up"]').boundingBox();
  await p.mouse.move(up.x + 20, up.y + 20); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
  const pos1 = await T(() => [__t.me.x, __t.me.z]);
  check('앞 버튼으로 전진', pos1[1] < pos0[1] - .3, [pos0, pos1]);
  await p.waitForTimeout(300);
  const pos2 = await T(() => [__t.me.x, __t.me.z]);
  check('손 떼면 정지', Math.abs(pos2[1] - pos1[1]) < .01);
  const yaw0 = await T(() => __t.me.yaw);
  await p.mouse.move(700, 300); await p.mouse.down(); await p.mouse.move(800, 330, { steps: 6 }); await p.mouse.up();
  const after = await T(() => [__t.me.yaw, __t.me.x, __t.me.z]);
  check('드래그는 시점만 회전', Math.abs(after[0] - yaw0) > .2 && after[1] === pos2[0] && after[2] === pos2[1], after);
  const yawNow = after[0];
  const left = await p.locator('#pad [data-dir="left"]').boundingBox();
  await p.mouse.move(left.x + 20, left.y + 20); await p.mouse.down(); await p.waitForTimeout(400); await p.mouse.up();
  check('왼쪽 버튼 후 캐릭터 방향 변경', await T((y) => Math.abs(__t.me.heading - (y + Math.PI / 2)) < .01, yawNow));
  check('내 캐릭터 보임', await T(() => __t.camD > .75));

  // 2) 퍼즐 전체
  const P = await T(() => ({ ...__t.P }));
  const aim = (x, z, yaw, pitch) => T(([x, z, yaw, pitch]) => { Object.assign(__t.me, { x, z, yaw, pitch, heading: yaw }); }, [x, z, yaw, pitch]);
  const lock = async (code) => { const w = await p.$$('.wheel'); for (let i = 0; i < code.length; i++) { const u = await w[i].$('button'); for (let k = 0; k < +code[i]; k++) await u.click(); } await p.click('.primary'); };
  const inspect = async (x, z, yaw, pitch, expect, how) => {
    await aim(x, z, yaw, pitch); await p.waitForTimeout(500);
    const got = await T(() => __t.target && __t.target.act);
    check('조사 대상 ' + expect, got === expect, got);
    if (how === 'button') await p.click('#act-btn'); else await p.keyboard.press('e');
    await p.waitForTimeout(250);
  };
  const closeP = async () => { if (await p.$('#panel:not([hidden]) .close')) await p.click('.close'); await p.waitForTimeout(150); };
  await inspect(0.2, -1.6, 0, -.05, 'board', 'button'); await p.screenshot({ path: OUT + '/3-board.png' }); await closeP();
  await inspect(3.1, -2.4, 0, -.05, 'abacus'); await closeP();
  await inspect(0, -1.7, 0, -.6, 'drawer');
  await lock(P.drawer); await p.waitForTimeout(800); check('서랍 열림', await T(() => __t.G.drawerOpen)); await closeP();
  await inspect(-3.65, 2.7, Math.PI, -.45, 'organ'); await p.screenshot({ path: OUT + '/4-organ.png' });
  for (const n of P.melody) await p.keyboard.press('Digit' + (n + 1));
  await p.waitForTimeout(1000); check('풍금 열림', await T(() => __t.G.organOpen));
  await inspect(3.7, 2.8, Math.PI, -.2, 'locker'); await p.waitForTimeout(700); check('손전등 획득', await T(() => __t.G.items.has('flash'))); await closeP();
  await inspect(.2, 3.1, Math.PI, 0.02, 'honor'); await closeP();
  await p.keyboard.press('f'); await p.waitForTimeout(200);
  const s0 = P.honors[0], dx = -1.9 + (s0 % 4) * 1.4, dz = -.9 + Math.floor(s0 / 4) * 1.1;
  // 오른쪽 통로에서 왼쪽을 보며 내려다봄
  await aim(dx + .72, dz, Math.PI / 2, -.5); await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '/5-desk-flash.png' });
  const dg = await T(() => __t.target);
  console.log('desk target', JSON.stringify(dg), 'want', s0);
  check('책상 번호 인식', dg && dg.act === 'desk' && dg.seat === s0, dg);

  // 3) 다른 플레이어 (HTML 넣기 시도 포함)
  await T(() => { window.__state = { me: [{ on: true }], o1: [{ on: true, n: '<b>철수</b>' }] }; __fire('presence:sync'); });
  await T(() => __fire('broadcast:pos', { payload: { id: 'o1', x: .2, z: .2 - 1.6, h: 0, f: 0, n: '<b>철수</b>' } }));
  await T(() => __fire('broadcast:say', { payload: { id: 'o1', n: 'x', m: '<img src=x onerror=alert(1)> 칠판 봤어?' } }));
  await T(() => __fire('broadcast:pos', { payload: { id: 'bad', x: 'NaN', z: null, h: 0 } }));
  await aim(1.6, 1.3, .3, -.2); await p.waitForTimeout(600);
  check('친구 1명 표시', await T(() => __t.avatars.size === 1));
  check('채팅 HTML 차단', await T(() => !document.querySelector('#chatlog img') && document.getElementById('chatlog').textContent.includes('칠판 봤어?')));
  await p.screenshot({ path: OUT + '/6-peer.png' });
  await p.waitForTimeout(600);
  check('친구가 있으면 내 위치 전송', await T(() => window.__sent.some((m) => m.event === 'pos')));
  await p.keyboard.press('t'); await p.keyboard.type('안녕'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  check('말하기 전송', await T(() => window.__sent.some((m) => m.event === 'say' && m.payload.m === '안녕')));
  await T(() => { window.__state = { me: [{ on: true }] }; __fire('presence:sync'); });
  await p.waitForTimeout(5300);
  check('나간 친구 제거', await T(() => __t.avatars.size === 0));

  // 4) 탈출과 랭킹
  await inspect(3.9, -2.65, -Math.PI / 2, -.03, 'door');
  await lock(P.door); await p.waitForTimeout(800); await p.screenshot({ path: OUT + '/7-door.png' });
  await p.waitForTimeout(1600); await p.screenshot({ path: OUT + '/8-win.png' });
  const rpc = await T(() => window.__rpc.map((x) => x[0]));
  check('서버 시작/종료 호출', rpc.includes('start_run') && rpc.includes('finish_run'), rpc);
  check('시간을 서버로 보내지 않음', await T(() => { const a = window.__rpc.find((x) => x[0] === 'finish_run')[1]; return !('ms' in a); }));
  check('내 기록 강조', await T(() => !!document.querySelector('#rank2 li.me')));
  await p.click('#again'); await p.waitForTimeout(500);
  check('다시 시작', await T(() => __t.G.started && !__t.G.escaped && __t.G.items.size === 0));

  // 5) 휴대폰: 실제 Supabase 라이브러리 + 빈 설정 = 혼자 모드
  const m = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const q = await page(m);
  fs.writeFileSync(SITE + '/config.js', "window.ESCAPE_CONFIG={url:'',anonKey:''};");
  await q.goto('file://' + SITE + '/index.html'); await q.waitForTimeout(3000);
  console.log('real supabase lib', await q.evaluate(() => typeof (window.supabase && window.supabase.createClient)));
  const ov = await q.evaluate(() => { const s = document.querySelector('.slate'); return [s.scrollWidth, s.clientWidth, document.documentElement.scrollWidth, innerWidth]; });
  check('폰 가로 넘침 없음', ov[0] <= ov[1] && ov[2] <= ov[3], ov);
  await q.screenshot({ path: OUT + '/9-m-start.png' });
  await q.tap('#go'); await q.waitForTimeout(1500);
  await q.screenshot({ path: OUT + '/10-m-play.png' });
  // 터치로 버튼 누르고 있기
  const cdp = await m.newCDPSession(q);
  const bb = await q.locator('#pad [data-dir="up"]').boundingBox();
  const z0 = await q.evaluate(() => __t.me.z);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x: bb.x + 20, y: bb.y + 20, id: 1 }]);
  await q.waitForTimeout(600);
  // 걷는 도중 다른 손가락으로 화면 드래그
  const y0 = await q.evaluate(() => __t.me.yaw);
  await touch('touchStart', [{ x: bb.x + 20, y: bb.y + 20, id: 1 }, { x: 300, y: 300, id: 2 }]);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: bb.x + 20, y: bb.y + 20, id: 1 }, { x: 300 - i * 12, y: 300, id: 2 }]); await q.waitForTimeout(30); }
  await touch('touchEnd', [{ x: bb.x + 20, y: bb.y + 20, id: 1 }]);
  await touch('touchEnd', []);
  await q.waitForTimeout(200);
  const r = await q.evaluate(() => [__t.me.z, __t.me.yaw]);
  check('폰: 터치로 전진', r[0] < z0 - .2, [z0, r[0]]);
  check('폰: 걸으면서 드래그 회전', Math.abs(r[1] - y0) > .1, [y0, r[1]]);
  console.log('ERRORS', errors.length ? errors : 'none');
  await b.close();
})().catch((e) => { console.error('QA crash', e); process.exit(1); });
