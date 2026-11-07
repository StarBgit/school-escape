// 휴대폰 화면 확대 금지 점검: 두 손가락 확대, 두 번 누르기 후에도 배율이 1이고 조작이 살아 있는지 본다.
// 실행: node tests/zoom-check.js <사이트 주소 또는 file://경로>
const { chromium } = require('playwright-core');
const path = require('path');
const target = process.argv[2] || 'file://' + path.join(__dirname, '../index.html');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const c = await b.newContext({ viewport: { width: 390, height: 600 }, hasTouch: true, isMobile: true });
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const cdp = await c.newCDPSession(p);
  const scale = () => p.evaluate(() => window.visualViewport.scale);
  const check = (n, ok, x) => { console.log(ok ? 'OK  ' : 'FAIL', n, x === undefined ? '' : JSON.stringify(x)); if (!ok) errors.push(n); };
  const pinch = (x, y) => cdp.send('Input.synthesizePinchGesture', { x, y, scaleFactor: 3, gestureSourceType: 'touch' });
  const dbl = async (x, y) => { await p.touchscreen.tap(x, y); await p.waitForTimeout(80); await p.touchscreen.tap(x, y); await p.waitForTimeout(400); };
  await p.goto(target); await p.waitForTimeout(3000);

  check('시작 화면 배율 1', (await scale()) === 1);
  await pinch(195, 300); await p.waitForTimeout(400);
  check('시작 화면 두 손가락 확대 차단', (await scale()) === 1, await scale());
  await dbl(195, 120);
  check('시작 화면 두 번 누르기 차단', (await scale()) === 1, await scale());

  // 작은 화면에서 시작 화면 스크롤은 살아 있어야 한다
  const scroll = await p.evaluate(() => { const s = document.getElementById('start'); return [s.scrollHeight, s.clientHeight]; });
  await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 400, yDistance: -200, gestureSourceType: 'touch' });
  await p.waitForTimeout(300);
  const top = await p.evaluate(() => document.getElementById('start').scrollTop);
  check('시작 화면 위아래 스크롤 가능', scroll[0] <= scroll[1] || top > 0, { scroll, top });
  await p.evaluate(() => { document.getElementById('start').scrollTop = 0; });

  await p.tap('#go'); await p.waitForTimeout(1500);
  await pinch(250, 300); await p.waitForTimeout(400);
  check('게임 화면 두 손가락 확대 차단', (await scale()) === 1, await scale());
  await dbl(250, 300);
  check('게임 화면 두 번 누르기 차단', (await scale()) === 1, await scale());
  const box = await p.locator('#pad [data-dir="up"]').boundingBox();
  await dbl(box.x + 20, box.y + 20);
  check('이동 버튼 연타 차단', (await scale()) === 1, await scale());

  // 빠른 연타가 씹히지 않는지: 힌트 버튼을 연달아 두 번 누르면 두 번 다 처리되어야 한다
  const before = await p.textContent('#timer');
  await p.tap('#btn-hint'); await p.waitForTimeout(120); await p.tap('#btn-hint'); await p.waitForTimeout(250);
  const after = await p.textContent('#timer');
  const sec = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  check('버튼 빠른 연타 정상', sec(after) - sec(before) >= 60, [before, after]);

  // 이름 입력칸 글자 크기 16px 이상이어야 사파리가 자동 확대하지 않는다
  const small = await p.evaluate(() => [...document.querySelectorAll('input')].filter((i) => parseFloat(getComputedStyle(i).fontSize) < 16).map((i) => i.id));
  check('입력칸 글자 16px 이상', small.length === 0, small);
  console.log('ERRORS', errors.length ? errors : 'none');
  await b.close();
})().catch((e) => { console.error('crash', e); process.exit(1); });
