// Drive headless Chrome over the DevTools protocol (no dependencies) to run interaction scenarios,
// capture screenshots and report console errors. Usage: node cdp.mjs [scenarioNameFilter]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8765/';
const OUT = 'C:/New folder/DiscoverCanada/work/shots-cdp';
const PORT = 9333;
mkdirSync(OUT, { recursive: true });
const filter = process.argv[2] || '';

const scenarios = [
  { name: 'home-dark', w: 390, h: 844, dark: true, url: '#/', steps: [] },
  { name: 'chapter-step-phone', w: 390, h: 844, url: '#/learn/rights/0', steps: ['window.scrollTo(0,420)'] },
  { name: 'chapter-done-toggle', w: 390, h: 844, url: '#/learn/rights/0', steps: ['document.querySelector("[data-done]").scrollIntoView(); document.querySelector("[data-done]").click()'] },
  { name: 'card-flipped', w: 390, h: 844, url: '#/cards/govern', steps: ['document.getElementById("fc").click()', 'await wait(600)'] },
  { name: 'card-rated', w: 390, h: 844, url: '#/cards/govern', steps: ['document.getElementById("fc").click()', 'await wait(600)', 'document.querySelector("[data-rate=good]").click()', 'await wait(300)'] },
  { name: 'quiz-answered-wrong', w: 390, h: 844, url: '#/quiz/justice', steps: ['const q=document.querySelectorAll(".choice"); q[0].click(); await wait(200)'] },
  { name: 'quiz-finished', w: 390, h: 844, url: '#/quiz/economy', steps: ['for(let k=0;k<13;k++){ const c=document.querySelectorAll(".choice"); if(!c.length) break; c[k%4].click(); await wait(50); const n=document.getElementById("next"); if(n) n.click(); await wait(50);}', 'await wait(300)'] },
  { name: 'mock-running', w: 390, h: 844, url: '#/quiz/mock', steps: ['document.getElementById("start").click()', 'await wait(1500)'] },
  { name: 'book-next', w: 390, h: 844, url: '#/book/44', steps: ['document.getElementById("next").click()', 'await wait(800)'] },
  { name: 'book-desktop', w: 1280, h: 900, url: '#/book/45', steps: [] },
  { name: 'official-open', w: 390, h: 844, url: '#/quiz/official', steps: ['document.querySelector("details.official").open=true; document.querySelector("details.official").scrollIntoView()'] },
  { name: 'settings-dark-xl', w: 390, h: 844, url: '#/settings', steps: ['document.querySelector("[data-set=theme][data-val=dark]").click()', 'await wait(200)', 'document.querySelector("[data-set=size][data-val=xl]").click()', 'await wait(200)', 'location.hash="#/learn/govern/2"', 'await wait(400)'] },
  { name: 'whole-chapter-desktop', w: 1280, h: 900, url: '#/learn/justice/0', steps: ['document.querySelector("[data-readmode]").click()', 'await wait(400)', 'window.scrollTo(0,500)'] },
  { name: 'tablet-learn', w: 820, h: 1180, url: '#/learn', steps: [] },
];

function wsSend(ws, id, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => { const m = JSON.parse(ev.data); if (m.id === id) { ws.removeEventListener('message', onMsg); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\dc-chrome-cdp`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
let ok = true;
try {
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 1;
  const send = (m, p, s) => wsSend(ws, id++, m, p, s);
  for (const sc of scenarios) {
    if (filter && !sc.name.includes(filter)) continue;
    const errors = [];
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const onEvt = (ev) => { const m = JSON.parse(ev.data); if (m.sessionId !== sessionId) return; if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errors.push(m.params.type + ' ' + m.params.args.map((a) => a.value || a.description).join(' ')); };
    ws.addEventListener('message', onEvt);
    await send('Runtime.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: sc.w, height: sc.h, deviceScaleFactor: 1, mobile: sc.w < 700 }, sessionId);
    if (sc.dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId);
    await send('Runtime.evaluate', { expression: 'localStorage.clear()' }, sessionId).catch(() => {});
    await send('Page.navigate', { url: BASE + sc.url }, sessionId);
    await new Promise((r) => setTimeout(r, 1200));
    for (const step of sc.steps) {
      const r = await send('Runtime.evaluate', { expression: `(async()=>{ const wait=(ms)=>new Promise(r=>setTimeout(r,ms)); ${step}; })()`, awaitPromise: true }, sessionId);
      if (r.exceptionDetails) errors.push('STEP ' + step + ' -> ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    await new Promise((r) => setTimeout(r, 300));
    const sw = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth + "x" + window.innerWidth' }, sessionId);
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(join(OUT, sc.name + '.png'), Buffer.from(shot.data, 'base64'));
    const overflow = sw.result.value.split('x').map(Number)[0] > sw.result.value.split('x').map(Number)[1];
    console.log(`${sc.name.padEnd(26)} ${sw.result.value}${overflow ? '  HORIZONTAL OVERFLOW' : ''}${errors.length ? '\n   ' + errors.join('\n   ') : ''}`);
    if (errors.length || overflow) ok = false;
    ws.removeEventListener('message', onEvt);
    await send('Target.closeTarget', { targetId });
  }
  ws.close();
} finally {
  chrome.kill();
}
console.log(ok ? 'ALL CLEAN' : 'ISSUES FOUND');
