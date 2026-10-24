// Second scenario set: the council-fix behaviours. Reuses the CDP driver pattern from cdp.mjs.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8765/';
const OUT = 'C:/New folder/DiscoverCanada/work/shots-cdp';
const PORT = 9334;
mkdirSync(OUT, { recursive: true });

const scenarios = [
  // same-hash buttons: "Try again" on a chapter quiz must restart (data-reload)
  { name: 'fix-try-again', w: 390, h: 844, url: '#/quiz/economy', steps: ['for(let k=0;k<10;k++){ const c=document.querySelectorAll(".choice"); if(!c.length) break; c[0].click(); await wait(30); const n=document.getElementById("next"); if(n) n.click(); await wait(30);}', 'await wait(200)', 'document.querySelector("[data-reload]").click()', 'await wait(400)'], expect: 'Question 1 of 10' },
  // retry-missed must not change stored chapter stats
  { name: 'fix-retry-stats', w: 390, h: 844, url: '#/quiz/economy', steps: ['for(let k=0;k<10;k++){ const c=document.querySelectorAll(".choice"); if(!c.length) break; c[1].click(); await wait(30); const n=document.getElementById("next"); if(n) n.click(); await wait(30);}', 'await wait(200)', 'window.__before=JSON.stringify(JSON.parse(localStorage.getItem("dc.progress.v1")).quiz)', 'const rw=document.getElementById("retry-wrong"); if(rw){ rw.click(); await wait(300); for(let k=0;k<10;k++){ const c=document.querySelectorAll(".choice"); if(!c.length) break; c[2].click(); await wait(30); const n=document.getElementById("next"); if(n) n.click(); await wait(30);} }', 'await wait(200)', 'window.__after=JSON.stringify(JSON.parse(localStorage.getItem("dc.progress.v1")).quiz)', 'document.body.setAttribute("data-check", window.__before===window.__after ? "stats-unchanged" : "STATS CHANGED "+window.__before+" -> "+window.__after)'], expect: 'stats-unchanged', attr: true },
  // flash cards: 20-card cap, again counter, progress never > 100
  { name: 'fix-cards-session', w: 390, h: 844, url: '#/cards/history', steps: ['window.__maxw=0; for(let k=0;k<40;k++){ const fc=document.getElementById("fc"); if(!fc) break; fc.click(); await wait(20); const r=document.querySelector(k%5===0?"[data-rate=again]":"[data-rate=good]"); r.click(); await wait(20); const bar=document.querySelector(".progress > span"); if(bar) window.__maxw=Math.max(window.__maxw, parseFloat(bar.style.width)); }', 'document.body.setAttribute("data-check", (document.body.textContent.includes("Session complete")?"complete":"NOT COMPLETE") + " maxw=" + window.__maxw)'], expect: 'complete maxw=', attr: true },
  // hard demotes a level; undo restores
  { name: 'fix-undo', w: 390, h: 844, url: '#/cards/justice', steps: ['document.getElementById("fc").click(); await wait(20); document.querySelector("[data-rate=good]").click(); await wait(50)', 'const id=Object.keys(JSON.parse(localStorage.getItem("dc.progress.v1")).cards)[0]; window.__id=id; window.__hasUndo=!!document.querySelector("[data-undo]")', 'const u=document.querySelector("[data-undo]"); if(u) u.click(); await wait(100)', 'document.body.setAttribute("data-check", JSON.parse(localStorage.getItem("dc.progress.v1")).cards[window.__id] ? "NOT UNDONE hasUndo="+window.__hasUndo+" id="+window.__id+" keys="+Object.keys(JSON.parse(localStorage.getItem("dc.progress.v1")).cards).join(",") : "undone")'], expect: 'undone', attr: true },
  // mock: no reveal during test
  { name: 'fix-mock-no-reveal', w: 390, h: 844, url: '#/quiz/mock', steps: ['document.getElementById("start").click(); await wait(400)', 'document.querySelector(".choice").click(); await wait(100)', 'document.body.setAttribute("data-check", document.querySelector("[data-state=correct],[data-state=wrong]") ? "REVEALED" : "hidden-until-end")'], expect: 'hidden-until-end', attr: true },
  // booklet overlay from a card keeps the session
  { name: 'fix-overlay', w: 390, h: 844, url: '#/cards/govern', steps: ['document.querySelector("a.pagelink[data-page]").click(); await wait(500)'], expect: 'overlay' },
  { name: 'fix-overlay-close', w: 390, h: 844, url: '#/cards/govern', steps: ['document.querySelector("a.pagelink[data-page]").click(); await wait(300)', 'document.querySelector("[data-ov=close]").click(); await wait(200)', 'document.body.setAttribute("data-check", document.getElementById("fc") ? "session-kept" : "SESSION LOST")'], expect: 'session-kept', attr: true },
  // section quick check
  { name: 'fix-quick-check', w: 390, h: 844, url: '#/learn/rights/0/check', steps: ['await wait(200)'], expect: 'Question 1 of' },
  // book page 60 label is not Regions
  { name: 'fix-book-label', w: 390, h: 844, url: '#/book/60', steps: ['await wait(200)', 'document.body.setAttribute("data-check", document.body.textContent.includes("Reference pages") ? "label-ok" : "LABEL WRONG")'], expect: 'label-ok', attr: true },
  // XL text flashcard
  { name: 'fix-card-xl-dark', w: 390, h: 844, dark: true, url: '#/settings', steps: ['document.querySelector("[data-set=size][data-val=xl]").click(); await wait(200)', 'location.hash="#/cards/regions"; await wait(500)', 'document.getElementById("fc").click(); await wait(600)'] },
  // import of a malicious progress code is sanitized
  { name: 'fix-import-sanitize', w: 390, h: 844, url: '#/settings', steps: ['const bad={sections:{"<img src=x onerror=alert(1)>":1},cards:{"x":{box:"<b>",due:"nope"}},quiz:{},mock:[],last:{chapter:"<script>",section:"1"}}; localStorage.setItem("dc.progress.v1", JSON.stringify(bad))', 'RELOAD', 'document.body.setAttribute("data-check", JSON.stringify(JSON.parse(localStorage.getItem("dc.progress.v1"))))', 'location.hash="#/"; await wait(400)'], expect: 'sanitized', attr: true, check: (v) => (v.includes('onerror') || v.includes('<script>')) ? 'NOT SANITIZED ' + v : 'sanitized' },
];

function wsSend(ws, id, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => { const m = JSON.parse(ev.data); if (m.id === id) { ws.removeEventListener('message', onMsg); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\dc-chrome-cdp2`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
let ok = true;
try {
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 1;
  const send = (m, p, s) => wsSend(ws, id++, m, p, s);
  for (const sc of scenarios) {
    const errors = [];
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const onEvt = (ev) => { const m = JSON.parse(ev.data); if (m.sessionId !== sessionId) return; if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errors.push(m.params.type + ' ' + m.params.args.map((a) => a.value || a.description).join(' ')); };
    ws.addEventListener('message', onEvt);
    await send('Runtime.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: sc.w, height: sc.h, deviceScaleFactor: 1, mobile: sc.w < 700 }, sessionId);
    if (sc.dark) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId);
    await send('Page.navigate', { url: BASE + '#/' }, sessionId);
    await new Promise((r) => setTimeout(r, 600));
    await send('Runtime.evaluate', { expression: 'localStorage.clear()' }, sessionId).catch(() => {});
    await send('Page.navigate', { url: BASE + sc.url }, sessionId);
    await new Promise((r) => setTimeout(r, 800));
    await send('Runtime.evaluate', { expression: 'localStorage.clear()' }, sessionId).catch(() => {});
    await send('Page.reload', {}, sessionId);
    await new Promise((r) => setTimeout(r, 1200));
    for (const step of sc.steps) {
      if (step === 'RELOAD') { await send('Page.reload', {}, sessionId); await new Promise((r) => setTimeout(r, 1200)); continue; }
      const r = await send('Runtime.evaluate', { expression: `(async()=>{ const wait=(ms)=>new Promise(r=>setTimeout(r,ms)); ${step}; })()`, awaitPromise: true }, sessionId);
      if (r.exceptionDetails) errors.push('STEP ' + step.slice(0, 60) + ' -> ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    await new Promise((r) => setTimeout(r, 300));
    const probe = await send('Runtime.evaluate', { expression: 'JSON.stringify({sw: document.documentElement.scrollWidth, iw: window.innerWidth, attr: document.body.getAttribute("data-check") || "", text: document.body.innerText.slice(0, 4000), hasOverlay: !!document.getElementById("overlay")})' }, sessionId);
    const pr = JSON.parse(probe.result.value);
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(join(OUT, sc.name + '.png'), Buffer.from(shot.data, 'base64'));
    let verdict = 'ok';
    if (sc.expect) {
      if (sc.check) verdict = sc.check(pr.attr);
      else if (sc.attr) verdict = pr.attr.startsWith(sc.expect) ? 'ok ' + pr.attr : 'FAIL ' + pr.attr;
      else if (sc.expect === 'overlay') verdict = pr.hasOverlay ? 'ok' : 'FAIL no overlay';
      else verdict = pr.text.includes(sc.expect) ? 'ok' : 'FAIL expected "' + sc.expect + '"';
    }
    const overflow = pr.sw > pr.iw;
    console.log(`${sc.name.padEnd(24)} ${verdict}${overflow ? '  HORIZONTAL OVERFLOW' : ''}${errors.length ? '\n   ' + errors.join('\n   ') : ''}`);
    if (errors.length || overflow || verdict.startsWith('FAIL') || verdict.startsWith('NOT')) ok = false;
    ws.removeEventListener('message', onEvt);
    await send('Target.closeTarget', { targetId });
  }
  ws.close();
} finally { chrome.kill(); }
console.log(ok ? 'ALL CLEAN' : 'ISSUES FOUND');
