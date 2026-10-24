// Screenshot every CSS variant on the same routes (phone + desktop, light + dark) for the compare page.
// Usage: node variants.mjs mythos,quiet-study,argon,opus,sonnet55
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8765/';
const OUT = 'C:/New folder/DiscoverCanada/site/design/shots';
const PORT = 9335;
mkdirSync(OUT, { recursive: true });
const variants = (process.argv[2] || 'mythos').split(',');
const routes = [
  { n: 'home', url: '#/', steps: [] },
  { n: 'learn', url: '#/learn/govern/2', steps: ['window.scrollTo(0, 380)'] },
  { n: 'cards', url: '#/cards/govern', steps: ['document.getElementById("fc").click()', 'await wait(600)'] },
  { n: 'quiz', url: '#/quiz/justice', steps: ['document.querySelectorAll(".choice")[0].click()', 'await wait(200)'] },
];
const sizes = [{ n: 'phone', w: 390, h: 844, mobile: true }, { n: 'desktop', w: 1280, h: 860, mobile: false }];

function wsSend(ws, id, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => { const m = JSON.parse(ev.data); if (m.id === id) { ws.removeEventListener('message', onMsg); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\dc-chrome-var`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const report = [];
try {
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 1;
  const send = (m, p, s) => wsSend(ws, id++, m, p, s);
  for (const v of variants) {
    for (const size of sizes) {
      for (const dark of [false, true]) {
        if (dark && size.n === 'desktop') continue;
        for (const rt of routes) {
          const errors = [];
          const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
          const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
          const onEvt = (ev) => { const m = JSON.parse(ev.data); if (m.sessionId !== sessionId) return; if (m.method === 'Runtime.exceptionThrown') errors.push('EXC'); if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text.slice(0, 80)); };
          ws.addEventListener('message', onEvt);
          await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId); await send('Log.enable', {}, sessionId);
          await send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.mobile }, sessionId);
          if (dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId);
          await send('Page.navigate', { url: `${BASE}?css=${v}${rt.url}` }, sessionId);
          await new Promise((r) => setTimeout(r, 1400));
          for (const step of rt.steps) await send('Runtime.evaluate', { expression: `(async()=>{ const wait=(ms)=>new Promise(r=>setTimeout(r,ms)); ${step}; })()`, awaitPromise: true }, sessionId).catch(() => errors.push('step'));
          await new Promise((r) => setTimeout(r, 300));
          const probe = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth + "x" + window.innerWidth' }, sessionId);
          const [sw, iw] = probe.result.value.split('x').map(Number);
          const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, sessionId);
          const name = `${v}-${rt.n}-${size.n}${dark ? '-dark' : ''}.jpg`;
          writeFileSync(join(OUT, name), Buffer.from(shot.data, 'base64'));
          report.push({ v, route: rt.n, size: size.n, dark, overflow: sw > iw, errors: errors.filter((e) => !/favicon|sw\.js|fonts\.g/.test(e)) });
          ws.removeEventListener('message', onEvt);
          await send('Target.closeTarget', { targetId });
        }
      }
    }
  }
  ws.close();
} finally { chrome.kill(); }
for (const r of report) if (r.overflow || r.errors.length) console.log(`${r.v} ${r.route} ${r.size}${r.dark ? ' dark' : ''}: ${r.overflow ? 'OVERFLOW ' : ''}${r.errors.join('; ')}`);
console.log(`${report.length} shots; ${report.filter((r) => r.overflow || r.errors.length).length} with issues`);
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
