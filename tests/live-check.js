// 공개 사이트 점검: 페이지 로드, 시작, 버튼 이동. 온라인 설정이 있으면 두 명 접속과 말하기까지 확인한다.
// 실행: node tests/live-check.js <사이트 주소>
const { chromium } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');
const URL_ = process.argv[2];
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'escape-live-'));
console.log('OUT', OUT);
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  const open = async (nick) => {
    const c = await b.newContext({ viewport: { width: 1280, height: 760 } });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text()); });
    p.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
    await p.goto(URL_, { waitUntil: 'load' });
    await p.waitForTimeout(3500);
    await p.fill('#nick', nick); await p.click('#go'); await p.waitForTimeout(2500);
    return p;
  };
  const check = (n, ok, x) => { console.log(ok ? 'OK  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)); if (!ok) errors.push(n); };
  const a = await open('점검A');
  check('제목', (await a.title()) === '6학년 3반 탈출');
  check('이동 버튼 표시', await a.isVisible('#pad'));
  check('실제 Supabase 라이브러리', await a.evaluate(() => typeof (window.supabase && window.supabase.createClient) === 'function'));
  const online = await a.evaluate(() => !!(window.ESCAPE_CONFIG && window.ESCAPE_CONFIG.url));
  console.log('온라인 설정', online, '명단 상태:', await a.textContent('#rank-status'));
  const box = await a.locator('#pad [data-dir="up"]').boundingBox();
  const before = await a.screenshot({ path: OUT + '/a1.png' });
  await a.mouse.move(box.x + 20, box.y + 20); await a.mouse.down(); await a.waitForTimeout(900); await a.mouse.up();
  await a.waitForTimeout(150);
  const after = await a.screenshot({ path: OUT + '/a2.png' });
  check('앞 버튼을 누르면 화면이 바뀜', !before.equals(after));
  if (online) {
    const c = await open('점검B');
    await c.waitForTimeout(3000);
    check('A 화면 인원', /2명/.test(await a.textContent('#online')), await a.textContent('#online'));
    check('B 화면 인원', /2명/.test(await c.textContent('#online')), await c.textContent('#online'));
    await a.keyboard.press('t'); await a.keyboard.type('점검 메시지'); await a.keyboard.press('Enter');
    await c.waitForTimeout(1500);
    check('B가 A의 말을 받음', (await c.textContent('#chatlog')).includes('점검 메시지'), await c.textContent('#chatlog'));
    await c.screenshot({ path: OUT + '/b.png' });
  }
  console.log('ERRORS', errors.length ? errors : 'none');
  await b.close();
})().catch((e) => { console.error('crash', e); process.exit(1); });
