/* Discover Canada — Study. Single-file app: router, data, learn / cards / quiz / book / settings. */
(function () {
  'use strict';

  // ---------- storage ----------
  const LS_PROGRESS = 'dc.progress.v1';
  const LS_FOCUS = 'dc.focus.v1';
  const LS_SETTINGS = 'dc.settings';
  const DAY = 86400000;
  const INTERVALS = [0, 1, 3, 7, 14, 30]; // days per level
  const SESSION_CAP = 20;   // cards per flash-card session
  const NEW_LIMIT = 20;     // new (never seen) cards per session
  const QUIZ_BATCH = 10;    // questions per chapter quiz run
  const SECTION_CHECK = 4;  // questions in a section quick check
  const BOOK_PAGES = 68;

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ } }

  const settings = Object.assign(
    { theme: 'auto', style: 'argon', size: 'normal', font: 'default', motion: 'on', readMode: 'step', splitBook: 'on', spreadBook: 'off' },
    load(LS_SETTINGS, {})
  );
  const progress = sanitizeProgress(load(LS_PROGRESS, {}));
  save(LS_PROGRESS, progress); // write back the sanitized shape
  const focusChecks = sanitizeFocus(load(LS_FOCUS, {}));
  save(LS_FOCUS, focusChecks);

  function saveProgress() { save(LS_PROGRESS, progress); updateTopProgress(); }
  function saveFocus() { save(LS_FOCUS, focusChecks); }
  function saveSettings() { save(LS_SETTINGS, settings); applySettings(); }
  function applySettings() {
    const r = document.documentElement;
    settings.theme === 'auto' ? r.removeAttribute('data-theme') : r.setAttribute('data-theme', settings.theme);
    !settings.style || settings.style === 'argon' ? r.removeAttribute('data-style') : r.setAttribute('data-style', settings.style);
    settings.size === 'normal' ? r.removeAttribute('data-size') : r.setAttribute('data-size', settings.size);
    settings.font === 'default' ? r.removeAttribute('data-font') : r.setAttribute('data-font', settings.font);
    settings.motion === 'off' ? r.setAttribute('data-motion', 'off') : r.removeAttribute('data-motion');
  }

  // Only known shapes survive a load or an import. Everything is coerced to numbers / plain ids.
  function sanitizeProgress(obj) {
    const out = { sections: {}, cards: {}, quiz: {}, mock: [], last: null };
    if (!obj || typeof obj !== 'object') return out;
    const idOk = (k) => typeof k === 'string' && /^[a-z0-9-]{1,80}$/.test(k);
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    if (obj.sections && typeof obj.sections === 'object') for (const k of Object.keys(obj.sections)) if (idOk(k)) out.sections[k] = num(obj.sections[k], 1);
    if (obj.cards && typeof obj.cards === 'object') for (const k of Object.keys(obj.cards)) { const s = obj.cards[k]; if (idOk(k) && s && typeof s === 'object') out.cards[k] = { box: Math.min(INTERVALS.length - 1, Math.max(0, num(s.box, 0))), due: num(s.due, 0), seen: num(s.seen, 0) }; }
    if (obj.quiz && typeof obj.quiz === 'object') for (const k of Object.keys(obj.quiz)) { const s = obj.quiz[k]; if (idOk(k) && s && typeof s === 'object') out.quiz[k] = { best: num(s.best, 0), total: num(s.total, 0), attempts: num(s.attempts, 0), last: num(s.last, 0) }; }
    if (Array.isArray(obj.mock)) out.mock = obj.mock.filter((m) => m && typeof m === 'object').map((m) => ({ score: num(m.score, 0), total: num(m.total, 0), at: num(m.at, 0) })).slice(-50);
    if (obj.last && typeof obj.last === 'object' && idOk(obj.last.chapter)) out.last = { chapter: obj.last.chapter, section: Math.max(0, Math.floor(num(obj.last.section, 0))) };
    return out;
  }

  function sanitizeFocus(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    const keyOk = (k) => typeof k === 'string' && /^[a-z0-9-]+:\d{1,3}$/.test(k);
    for (const k of Object.keys(obj)) if (keyOk(k) && obj[k]) out[k] = 1;
    return out;
  }

  // ---------- data ----------
  const data = { index: null, chapters: [], byId: {}, official: null, cards: [], quiz: [] };
  let dataPromise = null;
  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = (async () => {
      const idx = await (await fetch('data/index.json')).json();
      const files = await Promise.all(idx.chapters.map((c) => fetch('data/' + c.file).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      const chapters = files.filter(Boolean).sort((a, b) => a.order - b.order);
      chapters.forEach((ch) => {
        data.byId[ch.id] = ch;
        (ch.cards || []).forEach((c) => { c.chapter = ch.id; data.cards.push(c); });
        (ch.quiz || []).forEach((q) => { q.chapter = ch.id; data.quiz.push(q); });
      });
      data.chapters = chapters;
      try { data.official = await (await fetch('data/' + idx.official)).json(); } catch (e) { data.official = null; }
      data.index = idx;
      updateTopProgress();
      return data;
    })();
    return dataPromise;
  }

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = (n, d) => (d ? Math.min(100, Math.round((n / d) * 100)) : 0);
  const pageNum = (p) => Math.min(BOOK_PAGES, Math.max(1, parseInt(p, 10) || 1));
  const icon = {
    back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    learn: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    cards: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg>',
    quiz: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>',
    zoom: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>',
  };

  let toastTimer = null;
  function toast(msg) {
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1800);
  }
  // Booklet links open an overlay so the current card / quiz / section is not lost.
  function pageLink(page, label) {
    const p = pageNum(page);
    return `<a class="pagelink" href="#/book/${p}" data-page="${p}" title="Show booklet page ${p}">${icon.book} ${esc(label || 'Booklet p.' + p)}</a>`;
  }
  function sectionDone(sectionId) { return !!progress.sections[sectionId]; }
  function chapterStats(ch) {
    const total = ch.sections.length;
    const done = ch.sections.filter((s) => sectionDone(s.id)).length;
    const q = progress.quiz[ch.id];
    return { total, done, pct: pct(done, total), quizBest: q ? q.best : null, quizTotal: q ? q.total : null };
  }
  function updateTopProgress() {
    const el = $('#top-progress');
    if (!el || !data.chapters.length) return;
    const total = data.chapters.reduce((n, c) => n + c.sections.length, 0);
    const done = data.chapters.reduce((n, c) => n + chapterStats(c).done, 0);
    const p = pct(done, total);
    el.hidden = false;
    el.innerHTML = `<span class="tp-bar"><span style="width:${p}%"></span></span><span>${p}% read</span>`;
  }
  function cardState(id) { return progress.cards[id] || { box: 0, due: 0, seen: 0 }; }
  const isNew = (c) => !cardState(c.id).seen;
  function cardsDue(cards, now) { return cards.filter((c) => !isNew(c) && cardState(c.id).due <= now); }
  function cardsNew(cards) { return cards.filter(isNew); }
  function cardsLearned(cards) { return cards.filter((c) => cardState(c.id).box >= 3).length; }
  const bookLocal = () => !data.index.book || data.index.book.mode !== 'link';
  const chapterFor = (n) => data.chapters.find((c) => n >= c.pages[0] && n <= c.pages[c.pages.length - 1]) || null;

  // ---------- booklet overlay ----------
  function openOverlay(page) {
    let cur = pageNum(page);
    let zoomed = false;
    let ov = $('#overlay');
    if (!ov) { ov = document.createElement('div'); ov.id = 'overlay'; ov.className = 'overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Booklet page'); document.body.appendChild(ov); }
    const draw = () => {
      const ch = chapterFor(cur);
      ov.innerHTML = `
        <div class="overlay-bar">
          <button class="iconbtn" data-ov="prev" aria-label="Previous page" ${cur <= 1 ? 'disabled' : ''}>${icon.back}</button>
          <span class="overlay-title">Page ${cur}${ch ? ` · ${esc(ch.title)}` : ''}</span>
          <button class="iconbtn" data-ov="next" aria-label="Next page" ${cur >= BOOK_PAGES ? 'disabled' : ''}>${icon.next}</button>
          ${bookLocal() ? `<button class="btn small" data-ov="zoom" aria-pressed="${zoomed}" title="Toggle zoom">${zoomed ? '1×' : '1.75×'}</button>` : ''}
          <a class="btn small" href="#/book/${cur}" data-ov="go">Open in Booklet</a>
          <button class="iconbtn" data-ov="close" aria-label="Close">${icon.close}</button>
        </div>
        <div class="overlay-body ${zoomed ? 'zoomed' : ''}">${bookLocal() ? `<img src="book/p${String(cur).padStart(2, '0')}.jpg" alt="Booklet page ${cur}" width="1100" height="1430">` : `<div class="empty"><p>Page ${cur} of the printed booklet.</p><a class="btn primary" href="${esc(data.index.book.official)}" target="_blank" rel="noopener">Open the official online guide</a></div>`}</div>`;
      $('[data-ov="close"]', ov).focus();
    };
    const onClick = (e) => {
      const b = e.target.closest('[data-ov]'); if (!b) { if (e.target === ov) close(); return; }
      const k = b.getAttribute('data-ov');
      if (k === 'close') close();
      else if (k === 'prev') { cur = Math.max(1, cur - 1); draw(); }
      else if (k === 'next') { cur = Math.min(BOOK_PAGES, cur + 1); draw(); }
      else if (k === 'zoom') { zoomed = !zoomed; draw(); }
      else if (k === 'go') close();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') { cur = Math.max(1, cur - 1); draw(); } if (e.key === 'ArrowRight') { cur = Math.min(BOOK_PAGES, cur + 1); draw(); } };
    const close = () => { ov.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey, true); ov.remove(); document.body.classList.remove('no-scroll'); };
    ov.addEventListener('click', onClick); document.addEventListener('keydown', onKey, true); document.body.classList.add('no-scroll');
    draw();
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.pagelink[data-page]');
    if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openOverlay(a.getAttribute('data-page')); return; }
    if (e.target.closest('[data-reload]')) { e.preventDefault(); render(); }
  });

  // ---------- router ----------
  const app = $('#app');
  const routes = [];
  function route(pattern, handler) { routes.push({ pattern, handler }); }
  let cleanup = null;
  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    if (cleanup) { try { cleanup(); } catch (e) { /* noop */ } cleanup = null; }
    const ov = $('#overlay'); if (ov) ov.remove(); document.body.classList.remove('no-scroll');
    app.classList.remove('wide');
    const hash = location.hash.replace(/^#/, '') || '/';
    const top = hash.split('/').filter(Boolean)[0] || 'home';
    $$('.tabbar a, .topbar .navlink').forEach((a) => {
      const t = a.getAttribute('href').replace('#/', '');
      if (t === top) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    app.innerHTML = '<div class="empty">Loading…</div>';
    try {
      await loadData();
      if (seq !== renderSeq) return; // a newer navigation won
      for (const r of routes) {
        const m = r.pattern.exec(hash);
        if (m) { const out = await r.handler(...m.slice(1)); if (typeof out === 'function') cleanup = out; window.scrollTo({ top: 0 }); return; }
      }
      app.innerHTML = '<div class="empty">Page not found. <a href="#/">Go home</a></div>';
    } catch (err) {
      app.innerHTML = `<div class="empty">Something went wrong loading the study data.<br><span class="small">${esc(err.message)}</span></div>`;
    }
  }
  window.addEventListener('hashchange', render);

  // ---------- HOME ----------
  route(/^\/$/, () => {
    const chapters = data.chapters;
    const totalSections = chapters.reduce((n, c) => n + c.sections.length, 0);
    const doneSections = chapters.reduce((n, c) => n + chapterStats(c).done, 0);
    const learned = cardsLearned(data.cards);
    const due = cardsDue(data.cards, Date.now()).length;
    const bestMock = progress.mock.length ? Math.max(...progress.mock.map((m) => m.score)) : null;
    const t = data.index.test;
    const last = progress.last;
    const lastCh = last && data.byId[last.chapter];
    const lastIdx = lastCh ? Math.min(last.section, lastCh.sections.length - 1) : 0;
    const lastSec = lastCh && lastCh.sections[lastIdx];
    const lastStats = lastCh ? chapterStats(lastCh) : null;
    app.innerHTML = `
      <section class="fade-in">
        <div class="eyebrow">Official Study Guide · Interactive Companion</div>
        <h1 class="h1">Your path to the citizenship test</h1>
        <p class="lead">Everything on the test comes from the official <em>Discover Canada</em> booklet. Read a section, flip a few cards, check yourself. Small steps, every day.</p>
        ${lastCh ? `
        <a class="card link hero-card" href="#/learn/${lastCh.id}/${lastIdx}">
          <div class="hero-top">
            <div class="hero-num">${lastCh.order}</div>
            <div style="flex:1;min-width:0">
              <div class="small muted">Continue where you left off</div>
              <div style="font-weight:700;font-size:1.12rem;line-height:1.25">${esc(lastCh.title)}</div>
              <div class="small muted">Section ${lastIdx + 1} of ${lastCh.sections.length} · ${esc(lastSec ? lastSec.title : '')}</div>
            </div>
            <span class="btn primary">Continue ${icon.next}</span>
          </div>
          <div class="hero-bar">
            <div class="progress green"><span style="width:${lastStats.pct}%"></span></div>
            <span class="small muted" style="font-weight:700;white-space:nowrap">${lastStats.done} of ${lastStats.total} done</span>
          </div>
        </a>` : ''}
        <div class="card" style="margin-top:12px">
          <div class="stats">
            <div class="stat"><b>${pct(doneSections, totalSections)}%</b><span>sections read</span></div>
            <div class="stat"><b>${learned}<span class="muted" style="font-size:1rem">/${data.cards.length}</span></b><span>cards learned</span></div>
            <div class="stat"><b>${bestMock == null ? '—' : bestMock + '/' + t.questions}</b><span>best mock test</span></div>
          </div>
          <div class="progress" style="margin-top:14px"><span style="width:${pct(doneSections, totalSections)}%"></span></div>
        </div>
        <div class="grid two" style="margin-top:12px">
          <a class="card link hub-card" href="#/learn">
            <div class="hub-head"><span class="pill red">Learn</span><span class="hub-icon red">${icon.learn}</span></div>
            <div><div style="font-weight:700;font-size:1.1rem">Read the booklet, one section at a time</div><div class="small muted" style="margin-top:3px">${chapters.length} chapters · focus points · quick checks · tick off what you know</div></div>
          </a>
          <a class="card link hub-card" href="#/cards/due">
            <div class="hub-head"><div class="row" style="gap:6px"><span class="pill amber">Cards</span>${due ? `<span class="pill">${due} to review</span>` : ''}</div><span class="hub-icon amber">${icon.cards}</span></div>
            <div><div style="font-weight:700;font-size:1.1rem">Flash cards, ${SESSION_CAP} at a time</div><div class="small muted" style="margin-top:3px">Rate each card; the app brings back the hard ones</div></div>
          </a>
          <a class="card link hub-card" href="#/quiz">
            <div class="hub-head"><span class="pill green">Quiz</span><span class="hub-icon green">${icon.quiz}</span></div>
            <div><div style="font-weight:700;font-size:1.1rem">Chapter quizzes and a timed mock test</div><div class="small muted" style="margin-top:3px">${t.questions} questions · ${t.minutes} minutes · ${t.pass} to pass, like the real one</div></div>
          </a>
          <a class="card link hub-card" href="#/book">
            <div class="hub-head"><span class="pill blue">Booklet</span><span class="hub-icon blue">${icon.book}</span></div>
            <div><div style="font-weight:700;font-size:1.1rem">The full official booklet, page by page</div><div class="small muted" style="margin-top:3px">Every card and question links back to its page</div></div>
          </a>
        </div>
        <h2 class="h2">About the real test</h2>
        <div class="card flat">
          <div class="test-pillars">
            <div class="test-pillar"><b>${t.questions}</b><span>questions</span></div>
            <div class="test-pillar"><b>${t.minutes}</b><span>minutes</span></div>
            <div class="test-pillar"><b>${t.pass}/${t.questions}</b><span>to pass</span></div>
            <div class="test-pillar"><b>${t.chances}</b><span>chances</span></div>
          </div>
          <ul style="margin:0;padding-left:1.2em">
            <li><b>${t.questions} questions</b>, ${esc(t.format)}.</li>
            <li><b>${t.minutes} minutes</b>. You need <b>${t.pass} of ${t.questions}</b> correct to pass.</li>
            <li>You get <b>${t.chances} chances</b> to pass. Ages ${esc(t.ages)} take it, in ${esc(t.languages)}.</li>
            <li>All questions come from the <em>Discover Canada</em> guide. <a href="${esc(t.source)}" target="_blank" rel="noopener">Official page</a> (checked ${esc(t.verified)}).</li>
          </ul>
        </div>
        <div class="note" style="margin-top:16px"><b>One update since this booklet was printed:</b> since 8 September 2022 Canada's Sovereign is <b>King Charles III</b>. The booklet still says Queen Elizabeth II; the official online guide now says King Charles III, and the Oath names him. Where a question is about the role, think "the Sovereign (King or Queen)".</div>
        <p class="small muted">More help: <a href="#/resources">official links and practice tests</a> · <a href="#/settings">themes, text size, progress backup</a></p>
      </section>`;
  });

  // ---------- LEARN: chapter list ----------
  route(/^\/learn$/, () => {
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Learn</h1>
        <p class="lead">Each chapter is split into short sections. Read one, check off the focus points as you spot them, try the quick check, tick it off.</p>
        <div class="grid">
          ${data.chapters.map((ch) => {
            const s = chapterStats(ch);
            return `<a class="card link chapter-item" href="#/learn/${ch.id}">
              <div class="num">${ch.order}</div>
              <div class="grow"><div class="title">${esc(ch.title)}</div><div class="meta">${s.total} section${s.total === 1 ? '' : 's'} · pages ${ch.pages[0]}${ch.pages.length > 1 ? '–' + ch.pages[ch.pages.length - 1] : ''}${s.quizBest != null ? ` · quiz best ${s.quizBest}/${s.quizTotal}` : ''}</div>
              <div class="progress green" style="margin-top:8px"><span style="width:${s.pct}%"></span></div></div>
              <div class="ring" style="--p:${s.pct}"><span>${s.pct === 100 ? '✓' : s.pct + '%'}</span></div>
            </a>`;
          }).join('')}
        </div>
      </section>`;
  });

  // ---------- LEARN: chapter + section ----------
  function renderBlocks(blocks) {
    return (blocks || []).map((b) => {
      if (b.type === 'p') return `<p>${esc(b.text)}</p>`;
      if (b.type === 'list') return `<ul>${(b.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
      if (b.type === 'quote') return `<blockquote>${esc(b.text)}${b.who ? `<cite>— ${esc(b.who)}</cite>` : ''}</blockquote>`;
      if (b.type === 'caption') return `<div class="caption"><span>${esc(b.text)}</span></div>`;
      if (b.type === 'note') return `<div class="note">${esc(b.text)}</div>`;
      if (b.type === 'table') {
        const rows = b.rows || []; if (!rows.length) return '';
        return `<div class="tablewrap"><table><thead><tr>${rows[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      }
      if (b.type === 'h') return `<h3 class="h3">${esc(b.text)}</h3>`;
      return '';
    }).join('');
  }
  function sectionQuestions(ch, sec) { return (ch.quiz || []).filter((q) => q.section === sec.id); }
  function renderFocusBox(sec) {
    if (!sec.focus || !sec.focus.length) return '';
    const checkedCount = sec.focus.filter((_, idx) => !!focusChecks[`${sec.id}:${idx}`]).length;
    return `
      <div class="focusbox" data-focusbox="${esc(sec.id)}">
        <div class="focusbox-head">
          <h4>What to remember</h4>
          <span class="focus-hint" data-fcount="${esc(sec.id)}">${checkedCount ? `${checkedCount}/${sec.focus.length} ticked` : 'Tap to tick'}</span>
        </div>
        <ul>
          ${sec.focus.map((f, idx) => {
            const key = `${sec.id}:${idx}`;
            const ck = !!focusChecks[key];
            return `<li data-fitem="${esc(key)}" role="checkbox" aria-checked="${ck}" tabindex="0">${esc(f)}</li>`;
          }).join('')}
        </ul>
      </div>`;
  }
  function renderSection(ch, sec, i) {
    const done = sectionDone(sec.id);
    const nq = Math.min(sectionQuestions(ch, sec).length, SECTION_CHECK);
    return `
      <article class="reader" data-section="${esc(sec.id)}">
        <div class="section-head"><h2>${esc(sec.title)}</h2>${pageLink(sec.page)}</div>
        ${renderFocusBox(sec)}
        ${renderBlocks(sec.blocks)}
        <div class="grid" style="margin-top:18px">
          ${nq ? `<a class="btn" href="#/learn/${ch.id}/${i}/check">Quick check · ${nq} question${nq === 1 ? '' : 's'}</a>` : ''}
          <button class="done-toggle" data-done="${esc(sec.id)}" aria-pressed="${done}"><span class="box">${done ? icon.check : ''}</span><span>${done ? 'Done — I know this section' : 'Mark this section as done'}</span></button>
        </div>
      </article>`;
  }
  route(/^\/learn\/([a-z-]+)(?:\/(\d+))?$/, (chId, secIdx) => {
    const ch = data.byId[chId]; if (!ch) { app.innerHTML = '<div class="empty">Chapter not found.</div>'; return; }
    const stepMode = settings.readMode !== 'all';
    const withBook = stepMode && settings.splitBook !== 'off' && bookLocal();
    if (stepMode) app.classList.add('wide'); else app.classList.remove('wide');
    const i = Math.min(parseInt(secIdx || '0', 10) || 0, ch.sections.length - 1);
    const curSec = ch.sections[i];
    let companionPage = pageNum(curSec.page);
    let companionZoom = false;
    progress.last = { chapter: ch.id, section: i }; saveProgress();
    const s = chapterStats(ch);
    const nextCh = data.chapters.find((c) => c.order === ch.order + 1);
    const nextSec = stepMode && i < ch.sections.length - 1 ? ch.sections[i + 1] : null;
    const tocLinks = ch.sections.map((sec, k) => `<a href="#/learn/${ch.id}/${k}" class="${sectionDone(sec.id) ? 'done' : ''} ${stepMode && k === i ? 'current' : ''}" data-toc="${k}"><span class="check">${sectionDone(sec.id) ? '✓' : ''}</span><span style="flex:1;min-width:0">${esc(sec.title)}</span><span class="small muted">p.${sec.page}</span></a>`).join('');

    app.innerHTML = `
      <section class="fade-in">
        <div class="row" style="justify-content:space-between;margin-bottom:6px">
          <a class="btn ghost" href="#/learn">${icon.back} All chapters</a>
          <div class="row" style="gap:6px">
            ${stepMode && bookLocal() ? `<button class="btn ghost small studio-toggle-btn" data-splitbook aria-pressed="${withBook}">${icon.book} ${withBook ? 'Hide booklet pane' : 'Pin booklet pane'}</button>` : ''}
            <button class="btn ghost small" data-readmode>${stepMode ? 'Show whole chapter' : 'One section at a time'}</button>
          </div>
        </div>
        <div class="small muted">Chapter ${ch.order} · pages ${ch.pages[0]}–${ch.pages[ch.pages.length - 1]}${stepMode ? ` · Section ${i + 1} of ${ch.sections.length}` : ''}</div>
        <h1 class="h1">${esc(ch.title)}</h1>
        ${ch.summary ? `<p class="lead">${esc(ch.summary)}</p>` : ''}
        <div class="progress green" style="margin:0 0 8px"><span style="width:${s.pct}%"></span></div>
        ${stepMode ? `<div class="stepbar" aria-label="Chapter sections">${ch.sections.map((sec, k) => `<a href="#/learn/${ch.id}/${k}" class="seg-step ${sectionDone(sec.id) ? 'done' : ''} ${k === i ? 'current' : ''}" data-step="${k}" title="Section ${k + 1}: ${esc(sec.title)}"></a>`).join('')}</div>` : ''}

        <details class="tocwrap mobile-toc" ${stepMode ? '' : 'open'}><summary><span>${stepMode ? `Section ${i + 1} of ${ch.sections.length}` : 'Sections'}</span><span class="small muted" data-donecount>${s.done}/${s.total} done</span></summary>
        <nav class="toc" aria-label="Sections in this chapter">${tocLinks}</nav></details>

        <div class="learn-studio ${stepMode ? 'has-studio' : ''} ${withBook ? 'with-book' : ''}">
          <aside class="learn-sidebar-left" aria-label="Chapter navigation">
            <div class="row" style="justify-content:space-between;padding:0 4px 4px">
              <span class="eyebrow" style="margin:0">Sections</span>
              <span class="small muted" data-donecount-side>${s.done}/${s.total} done</span>
            </div>
            <nav class="toc" style="margin:0">${tocLinks}</nav>
            <div class="grid" style="margin-top:8px;gap:8px">
              <a class="btn small" href="#/quiz/${ch.id}">${icon.quiz} Quiz this chapter</a>
              <a class="btn small ghost" href="#/cards/${ch.id}">${icon.cards} Flash cards</a>
            </div>
          </aside>

          <div class="learn-main-card">
            <div id="sections">
              ${stepMode ? renderSection(ch, curSec, i) : ch.sections.map((sec, k) => renderSection(ch, sec, k)).join('<hr class="rule">')}
            </div>
            <div class="stepper">
              ${stepMode && i > 0 ? `<a class="btn" href="#/learn/${ch.id}/${i - 1}">${icon.back} Previous</a>` : '<span></span>'}
              ${nextSec ? `<a class="btn primary" href="#/learn/${ch.id}/${i + 1}">Next: ${esc(nextSec.title)} ${icon.next}</a>` : `<a class="btn primary" href="#/quiz/${ch.id}">Quiz this chapter ${icon.next}</a>`}
            </div>
            ${(!stepMode || i === ch.sections.length - 1) ? `<div class="row" style="margin-top:14px;justify-content:center"><a class="btn" href="#/cards/${ch.id}">Flash cards for this chapter</a>${nextCh ? `<a class="btn ghost" href="#/learn/${nextCh.id}">Next chapter: ${esc(nextCh.title)} ${icon.next}</a>` : ''}</div>` : ''}
          </div>

          <aside class="learn-sidebar-right" aria-label="Booklet page reference">
            <div class="book-companion-bar">
              <button class="iconbtn" data-cbook="prev" aria-label="Previous booklet page" style="width:36px;height:36px;min-width:36px;min-height:36px">${icon.back}</button>
              <span id="cbook-label">Booklet p.${companionPage}</span>
              <button class="iconbtn" data-cbook="next" aria-label="Next booklet page" style="width:36px;height:36px;min-width:36px;min-height:36px">${icon.next}</button>
              <button class="btn ghost small" data-cbook="zoom" style="min-height:34px;padding:4px 8px;font-size:0.78rem">1.8×</button>
              <a class="btn ghost small pagelink" href="#/book/${companionPage}" data-page="${companionPage}" id="cbook-expand" style="min-height:34px;padding:4px 8px;font-size:0.78rem">Expand</a>
            </div>
            <div class="book-companion-body" id="cbook-body">
              <img id="cbook-img" src="book/p${String(companionPage).padStart(2, '0')}.jpg" alt="Booklet page ${companionPage}" width="1100" height="1430">
            </div>
          </aside>
        </div>
      </section>`;

    const updateCompanion = () => {
      const img = $('#cbook-img');
      const lbl = $('#cbook-label');
      const exp = $('#cbook-expand');
      const body = $('#cbook-body');
      const zbtn = $('[data-cbook="zoom"]');
      if (img) { img.src = `book/p${String(companionPage).padStart(2, '0')}.jpg`; img.alt = `Booklet page ${companionPage}`; }
      if (lbl) lbl.textContent = `Booklet p.${companionPage}`;
      if (exp) { exp.setAttribute('href', `#/book/${companionPage}`); exp.setAttribute('data-page', String(companionPage)); }
      if (body) body.classList.toggle('zoomed', companionZoom);
      if (zbtn) zbtn.textContent = companionZoom ? '1×' : '1.8×';
    };

    const toggleFocusItem = (li) => {
      const key = li.getAttribute('data-fitem');
      if (!key) return;
      if (focusChecks[key]) delete focusChecks[key]; else focusChecks[key] = 1;
      saveFocus();
      const checked = !!focusChecks[key];
      li.setAttribute('aria-checked', String(checked));
      const secId = key.split(':')[0];
      const secObj = ch.sections.find((x) => x.id === secId);
      const cntEl = $(`[data-fcount="${secId}"]`);
      if (secObj && cntEl) {
        const c = secObj.focus.filter((_, idx) => !!focusChecks[`${secId}:${idx}`]).length;
        cntEl.textContent = c ? `${c}/${secObj.focus.length} ticked` : 'Tap to tick';
      }
    };

    const onClick = (e) => {
      const fi = e.target.closest('[data-fitem]');
      if (fi) { toggleFocusItem(fi); return; }
      const cb = e.target.closest('[data-cbook]');
      if (cb) {
        const act = cb.getAttribute('data-cbook');
        if (act === 'prev') companionPage = Math.max(1, companionPage - 1);
        else if (act === 'next') companionPage = Math.min(BOOK_PAGES, companionPage + 1);
        else if (act === 'zoom') companionZoom = !companionZoom;
        updateCompanion();
        return;
      }
      if (e.target.closest('[data-splitbook]')) {
        settings.splitBook = withBook ? 'off' : 'on';
        saveSettings();
        render();
        return;
      }
      const d = e.target.closest('[data-done]');
      if (d) {
        const id = d.getAttribute('data-done');
        if (progress.sections[id]) delete progress.sections[id]; else progress.sections[id] = Date.now();
        saveProgress();
        const done = sectionDone(id);
        d.setAttribute('aria-pressed', String(done));
        d.innerHTML = `<span class="box">${done ? icon.check : ''}</span><span>${done ? 'Done — I know this section' : 'Mark this section as done'}</span>`;
        const st = chapterStats(ch);
        const bar = $('.progress.green > span'); if (bar) bar.style.width = st.pct + '%';
        const dc = $('[data-donecount]'); if (dc) dc.textContent = `${st.done}/${st.total} done`;
        const dcs = $('[data-donecount-side]'); if (dcs) dcs.textContent = `${st.done}/${st.total} done`;
        const secIndex = ch.sections.findIndex((x) => x.id === id);
        $$(`[data-toc="${secIndex}"]`).forEach((toc) => {
          toc.classList.toggle('done', done);
          const chk = $('.check', toc); if (chk) chk.textContent = done ? '✓' : '';
        });
        const stepEl = $(`[data-step="${secIndex}"]`);
        if (stepEl) stepEl.classList.toggle('done', done);
        if (done) toast(st.done === st.total ? 'Chapter complete!' : 'Nice. Keep going.');
        return;
      }
      if (e.target.closest('[data-readmode]')) { settings.readMode = stepMode ? 'all' : 'step'; saveSettings(); render(); }
    };
    const onKey = (e) => {
      const fi = e.target.closest('[data-fitem]');
      if (fi && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggleFocusItem(fi); }
    };
    app.addEventListener('click', onClick);
    app.addEventListener('keydown', onKey);
    return () => { app.removeEventListener('click', onClick); app.removeEventListener('keydown', onKey); };
  });

  // Quick check at the end of a section
  route(/^\/learn\/([a-z-]+)\/(\d+)\/check$/, (chId, secIdx) => {
    const ch = data.byId[chId]; if (!ch) { app.innerHTML = '<div class="empty">Chapter not found.</div>'; return; }
    const i = Math.min(parseInt(secIdx, 10) || 0, ch.sections.length - 1);
    const sec = ch.sections[i];
    const qs = shuffle(sectionQuestions(ch, sec)).slice(0, SECTION_CHECK);
    if (!qs.length) { location.hash = `#/learn/${ch.id}/${i}`; return; }
    const next = i < ch.sections.length - 1 ? { href: `#/learn/${ch.id}/${i + 1}`, label: 'Next section' } : { href: `#/quiz/${ch.id}`, label: 'Quiz this chapter' };
    return runQuiz({ title: sec.title, questions: qs, backHref: `#/learn/${ch.id}/${i}`, backLabel: 'Back to the section', nextHref: next.href, nextLabel: next.label, onFinish: () => {} });
  });

  // ---------- CARDS: picker ----------
  route(/^\/cards$/, () => {
    const now = Date.now();
    const dueAll = cardsDue(data.cards, now).length;
    const newAll = cardsNew(data.cards).length;
    const todayCount = Math.min(SESSION_CAP, dueAll + Math.min(NEW_LIMIT, newAll));
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Flash cards</h1>
        <p class="lead">Tap a card to flip it, then rate yourself. <b>Again</b> brings it back this session, <b>Hard</b> tomorrow, <b>Good</b> in a few days. Sessions are ${SESSION_CAP} cards; stop whenever you like.</p>
        <a class="card link hero-card" href="#/cards/due"><div class="row" style="justify-content:space-between"><div><div style="font-weight:700;font-size:1.12rem">Today's session</div><div class="small muted">${dueAll ? `${dueAll} card${dueAll === 1 ? '' : 's'} to review` : 'Nothing to review yet'}${newAll ? ` · ${Math.min(NEW_LIMIT, newAll)} new` : ''}</div></div><span class="pill ${dueAll ? 'red' : 'blue'}">${todayCount} cards</span></div></a>
        <h2 class="h2">By chapter</h2>
        <div class="grid">
          ${data.chapters.map((ch) => {
            const cards = ch.cards || []; const learned = cardsLearned(cards); const due = cardsDue(cards, now).length; const fresh = cardsNew(cards).length;
            return `<a class="card link chapter-item" href="#/cards/${ch.id}"><div class="num">${ch.order}</div><div class="grow"><div class="title">${esc(ch.title)}</div><div class="meta">${cards.length} cards · ${learned} learned${due ? ` · ${due} to review` : ''}${fresh ? ` · ${fresh} new` : ''}</div><div class="progress green" style="margin-top:8px"><span style="width:${pct(learned, cards.length)}%"></span></div></div></a>`;
          }).join('')}
        </div>
        <div class="row" style="margin-top:16px"><a class="btn" href="#/cards/all">${icon.shuffle} Random mix of every card</a></div>
      </section>`;
  });

  // ---------- CARDS: session ----------
  route(/^\/cards\/([a-z-]+)$/, (scope) => {
    const now = Date.now();
    let pool, title;
    const backHref = '#/cards';
    if (scope === 'due') { pool = data.cards; title = "Today's session"; }
    else if (scope === 'all') { pool = data.cards; title = 'Random mix'; }
    else { const ch = data.byId[scope]; if (!ch) { app.innerHTML = '<div class="empty">Chapter not found.</div>'; return; } pool = ch.cards || []; title = ch.title; }
    // review cards first (shuffled), then new cards in booklet order, capped per session
    let session;
    if (scope === 'all') session = shuffle(pool).slice(0, SESSION_CAP);
    else {
      const due = shuffle(cardsDue(pool, now));
      const fresh = cardsNew(pool).slice(0, NEW_LIMIT);
      session = due.concat(fresh).slice(0, SESSION_CAP);
      if (!session.length && scope !== 'due') session = shuffle(pool).slice(0, SESSION_CAP); // everything learned: free practice
    }
    const remaining = scope === 'due' ? Math.max(0, cardsDue(pool, now).length + Math.min(NEW_LIMIT, cardsNew(pool).length) - session.length) : 0;
    if (!session.length) { app.innerHTML = `<section class="fade-in"><a class="btn ghost" href="${backHref}">${icon.back} Cards</a><div class="empty">Nothing to review right now. Come back tomorrow, pick a chapter, or <a href="#/cards/all">try a random mix</a>.</div></section>`; return; }
    const total = session.length;
    const queue = session.slice();
    const finished = new Set();      // card ids rated hard/good this session
    const repeating = new Set();     // card ids waiting to come back after "Again"
    let current = null, flipped = false, lastRating = null;
    const chOf = (c) => data.byId[c.chapter];
    function draw() {
      current = queue.shift(); flipped = false;
      if (!current) { finish(); return; }
      const st = cardState(current.id);
      const nextGap = INTERVALS[Math.min(st.box + 1, INTERVALS.length - 1)];
      const ch = chOf(current);
      app.innerHTML = `
        <section class="fade-in">
          <div class="row" style="justify-content:space-between"><a class="btn ghost" href="${backHref}">${icon.back} ${esc(title)}</a>${lastRating ? `<button class="btn ghost small" data-undo>${icon.undo} Undo</button>` : ''}</div>
          <div class="counter"><span>Card ${Math.min(finished.size + 1, total)} of ${total}${repeating.size ? ` · ${repeating.size} coming back` : ''}</span><span class="small">${esc(ch ? ch.title : '')}</span></div>
          <div class="progress"><span style="width:${pct(finished.size, total)}%"></span></div>
          <div class="deck" style="margin-top:16px">
            <button class="flashcard" id="fc" aria-label="${esc(current.front)} — press to reveal the answer" aria-pressed="false">
              <div class="face front">
                <div class="card-top"><span class="label">Question</span><span class="pill">p.${current.page}</span></div>
                <div class="text">${esc(current.front)}</div>
                <div class="foot"><span>Tap to reveal answer</span><span>${isNew(current) ? 'New card' : 'Level ' + (st.box + 1) + ' of ' + INTERVALS.length}</span></div>
              </div>
              <div class="face back" aria-hidden="true">
                <div class="q-echo">${esc(current.front)}</div>
                <div class="card-top"><span class="label">Answer</span><span class="pill">${isNew(current) ? 'New card' : 'Level ' + (st.box + 1) + ' of ' + INTERVALS.length}</span></div>
                <div class="text">${esc(current.back)}</div>
                <div class="foot"><span>Rate how well you knew it below</span><span>p.${current.page}</span></div>
              </div>
            </button>
          </div>
          <div class="rate" id="rate" hidden>
            <button class="btn warn" data-rate="again">Again<small>see it again soon</small></button>
            <button class="btn" data-rate="hard">Hard<small>tomorrow</small></button>
            <button class="btn good" data-rate="good">Good<small>in ${nextGap} day${nextGap === 1 ? '' : 's'}</small></button>
          </div>
          <div class="row" style="justify-content:center;margin-top:14px">${pageLink(current.page, 'See this in the booklet')}</div>
          <p class="small muted kbd-hint" style="text-align:center;margin-top:16px"><kbd>Space</kbd> flip · <kbd>1</kbd> again · <kbd>2</kbd> hard · <kbd>3</kbd> good</p>
        </section>`;
    }
    function flip() {
      const fc = $('#fc'); if (!fc) return; flipped = !flipped;
      fc.classList.toggle('flipped', flipped); fc.setAttribute('aria-pressed', String(flipped));
      $('.face.back', fc).setAttribute('aria-hidden', String(!flipped)); $('#rate').hidden = !flipped;
      if (flipped) $('[data-rate="good"]').focus();
    }
    function rate(kind) {
      if (!current || !flipped) return;
      const prev = Object.assign({}, cardState(current.id));
      const st = Object.assign({}, prev); st.seen = (st.seen || 0) + 1;
      lastRating = { card: current, prev, kind, wasRepeating: repeating.has(current.id) };
      if (kind === 'again') { st.box = 0; st.due = Date.now(); repeating.add(current.id); queue.splice(Math.min(3, queue.length), 0, current); }
      else {
        if (kind === 'hard') { st.box = Math.max(0, st.box - 1); st.due = Date.now() + DAY; }
        else { st.box = Math.min(INTERVALS.length - 1, st.box + 1); st.due = Date.now() + INTERVALS[st.box] * DAY; }
        repeating.delete(current.id); finished.add(current.id);
      }
      progress.cards[current.id] = st; saveProgress();
      draw();
    }
    function undo() {
      if (!lastRating) return;
      const { card, prev, kind, wasRepeating } = lastRating;
      if (prev.seen) progress.cards[card.id] = prev; else delete progress.cards[card.id];
      saveProgress();
      finished.delete(card.id); if (wasRepeating) repeating.add(card.id); else repeating.delete(card.id);
      if (kind === 'again') { const k = queue.indexOf(card); if (k >= 0) queue.splice(k, 1); }
      if (current && current !== card) queue.unshift(current);
      queue.unshift(card); lastRating = null; toast('Undone'); draw();
    }
    function finish() {
      const learnedNow = session.filter((c) => cardState(c.id).box >= 3).length;
      app.innerHTML = `
        <section class="fade-in">
          <a class="btn ghost" href="${backHref}">${icon.back} Cards</a>
          <div class="card" style="text-align:center;margin-top:12px"><div class="score">✓</div><div style="font-weight:700;font-size:1.2rem">Session complete</div><p class="muted">${total} cards reviewed · ${learnedNow} at level 4 or higher. The hard ones will come back sooner.</p>
          <div class="row" style="justify-content:center">${remaining ? `<button class="btn primary" data-reload>Another ${Math.min(SESSION_CAP, remaining)} (${remaining} left today)</button>` : `<button class="btn primary" data-reload>Go again</button>`}<a class="btn" href="#/quiz${scope !== 'due' && scope !== 'all' ? '/' + scope : ''}">Quiz</a><a class="btn ghost" href="#/">Done for now</a></div></div>
        </section>`;
    }
    const onClick = (e) => { if (e.target.closest('#fc')) flip(); const r = e.target.closest('[data-rate]'); if (r) rate(r.getAttribute('data-rate')); if (e.target.closest('[data-undo]')) undo(); };
    const onKey = (e) => {
      if ($('#overlay') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') { if (!e.target.closest('a,button') || e.target.id === 'fc') { e.preventDefault(); flip(); } }
      if (e.key === '1') rate('again'); if (e.key === '2') rate('hard'); if (e.key === '3') rate('good');
    };
    app.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    draw();
    return () => { app.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
  });

  // ---------- QUIZ: picker ----------
  route(/^\/quiz$/, () => {
    const t = data.index.test;
    const lastMock = progress.mock[progress.mock.length - 1];
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Quiz</h1>
        <p class="lead">Chapter quizzes are ${QUIZ_BATCH} questions at a time with the answer explained. The mock test feels like the real thing: ${t.questions} questions, ${t.minutes} minutes, ${t.pass} to pass, answers at the end.</p>
        <a class="card link hero-card" href="#/quiz/mock"><div class="row" style="justify-content:space-between"><div><div style="font-weight:700;font-size:1.12rem">Mock citizenship test</div><div class="small muted">${progress.mock.length ? `${progress.mock.length} attempt${progress.mock.length === 1 ? '' : 's'} · last ${lastMock.score}/${lastMock.total} (${lastMock.score >= t.pass ? 'pass' : 'not yet'})` : 'Random questions from every chapter, timed'}</div></div><span class="btn primary">Start</span></div></a>
        ${data.official ? `<a class="card link" href="#/quiz/official" style="margin-top:12px"><div style="font-weight:700;font-size:1.1rem">The booklet's own study questions</div><div class="small muted">${data.official.mcq.length} sample questions and ${data.official.short.length} questions to answer in your own words (pages 52–53)</div></a>` : ''}
        <h2 class="h2">By chapter</h2>
        <div class="grid">
          ${data.chapters.map((ch) => { const q = progress.quiz[ch.id]; const n = (ch.quiz || []).length; return `<a class="card link chapter-item" href="#/quiz/${ch.id}"><div class="num">${ch.order}</div><div class="grow"><div class="title">${esc(ch.title)}</div><div class="meta">${n} questions${q ? ` · best ${q.best}/${q.total} · ${q.attempts} run${q.attempts === 1 ? '' : 's'}` : ''}</div></div>${q ? `<span class="pill ${pct(q.best, q.total) >= 75 ? 'green' : 'amber'}">${pct(q.best, q.total)}%</span>` : ''}</a>`; }).join('')}
        </div>
      </section>`;
  });

  // ---------- QUIZ: run ----------
  // opts: {title, questions, backHref, backLabel?, nextHref?, nextLabel?, retryHref?, timed(minutes)?, passMark?, onFinish(score,total,answers), isRetry?}
  // Returns the teardown function; callers store it in `cleanup`.
  function runQuiz(opts) {
    const qs = opts.questions; let i = 0; let answered = null; const answers = []; let timer = null;
    const deadline = opts.timed ? Date.now() + opts.timed * 60000 : null;
    const letters = ['A', 'B', 'C', 'D', 'E'];
    const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const m = Math.floor(s / 60); const r = s % 60; return `${m}:${r < 10 ? '0' : ''}${r}`; };
    const backLabel = opts.backLabel || opts.title;
    function draw() {
      const q = qs[i]; const ch = data.byId[q.chapter];
      const stepSegs = qs.map((_, idx) => {
        let cls = '';
        if (idx < answers.length) cls = deadline ? 'done' : (answers[idx].correct ? 'done' : 'wrong');
        else if (idx === i) cls = 'current';
        return `<span class="seg-step ${cls}" data-qstep="${idx}"></span>`;
      }).join('');
      app.innerHTML = `
        <section class="fade-in">
          <div class="row" style="justify-content:space-between"><a class="btn ghost" href="${esc(opts.backHref)}">${icon.back} ${esc(backLabel)}</a>${deadline ? `<span class="timer" id="timer">${fmt(deadline - Date.now())}</span>` : `<span class="small muted">${ch ? esc(ch.title) : ''}</span>`}</div>
          <div class="counter"><span>Question ${i + 1} of ${qs.length}</span><span>${deadline ? '' : answers.filter((a) => a.correct).length + ' correct so far'}</span></div>
          <div class="progress" style="display:none"><span style="width:${pct(i, qs.length)}%"></span></div>
          <div class="stepbar" aria-hidden="true">${stepSegs}</div>
          <h2 class="h2" style="margin-top:18px">${esc(q.q)}</h2>
          <div class="choices">${q.choices.map((c, k) => `<button class="choice" data-choice="${k}"><span class="key">${letters[k]}</span><span>${esc(c)}</span></button>`).join('')}</div>
          <div id="explain"></div>
          <div class="stepper"><span></span><button class="btn primary" id="next" hidden>${i + 1 < qs.length ? 'Next question' : 'See results'} ${icon.next}</button></div>
          <p class="small muted kbd-hint" style="text-align:center;margin-top:12px"><kbd>1</kbd>–<kbd>${q.choices.length}</kbd> answer · <kbd>Enter</kbd> next</p>
        </section>`;
    }
    function choose(k) {
      if (answered != null) return; const q = qs[i]; answered = k; const correct = k === q.answer;
      answers.push({ id: q.id, q: q.q, chosen: q.choices[k], right: q.choices[q.answer], correct, why: q.why, page: q.page, chapter: q.chapter });
      $$('.choice').forEach((b, idx) => { b.disabled = true; if (deadline) { if (idx === k) b.dataset.state = 'picked'; } else if (idx === q.answer) b.dataset.state = 'correct'; else if (idx === k) b.dataset.state = 'wrong'; });
      const curSeg = $(`[data-qstep="${i}"]`);
      if (curSeg) { curSeg.classList.remove('current'); curSeg.classList.add(deadline ? 'done' : (correct ? 'done' : 'wrong')); }
      if (!deadline) $('#explain').innerHTML = `<div class="explain ${correct ? 'ok' : 'bad'}" role="status"><b>${correct ? 'Correct.' : 'Not quite — the answer is ' + esc(letters[q.answer]) + '.'}</b>${esc(q.why || '')} <div style="margin-top:8px">${pageLink(q.page)}</div></div>`;
      const nxt = $('#next');
      nxt.hidden = false;
      nxt.focus({ preventScroll: true });
      nxt.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function next() { if (answered == null) return; answered = null; i++; if (i >= qs.length) finish(false); else draw(); }
    function finish(timedOut) {
      if (timer) clearInterval(timer); timer = null;
      if (timedOut) { for (let k = (answered == null ? i : i + 1); k < qs.length; k++) { const q = qs[k]; answers.push({ id: q.id, q: q.q, chosen: '(no answer)', right: q.choices[q.answer], correct: false, why: q.why, page: q.page, chapter: q.chapter }); } }
      const score = answers.filter((a) => a.correct).length; const total = qs.length;
      if (!opts.isRetry) opts.onFinish(score, total, answers);
      const passed = opts.passMark != null ? score >= opts.passMark : pct(score, total) >= 75;
      const wrong = answers.filter((a) => !a.correct);
      const timeLeft = deadline ? deadline - Date.now() : null;
      app.innerHTML = `
        <section class="fade-in">
          <a class="btn ghost" href="${esc(opts.backHref)}">${icon.back} ${esc(backLabel)}</a>
          <div class="card" style="text-align:center;margin-top:12px">
            <div class="score" style="color:${passed ? 'var(--green)' : 'var(--amber)'}">${score}/${total}</div>
            <div style="font-weight:700;font-size:1.2rem">${timedOut ? 'Time is up.' : passed ? (opts.passMark != null ? 'That is a pass.' : 'Strong. You know this.') : (opts.passMark != null ? `Not yet — you need ${opts.passMark}.` : 'Keep going — review the ones you missed.')}</div>
            ${timeLeft != null && !timedOut ? `<div class="small muted">Finished with ${fmt(timeLeft)} left</div>` : ''}
            <div class="row" style="justify-content:center;margin-top:12px">
              ${wrong.length ? `<button class="btn primary" id="retry-wrong">Retry the ${wrong.length} missed</button>` : ''}
              ${opts.nextHref ? `<a class="btn ${wrong.length ? '' : 'primary'}" href="${esc(opts.nextHref)}">${esc(opts.nextLabel)} ${icon.next}</a>` : ''}
              ${opts.retryHref ? `<a class="btn" href="${esc(opts.retryHref)}">New set</a>` : `<button class="btn" data-reload>${opts.isRetry ? 'Back to the full quiz' : 'Try again'}</button>`}
            </div>
          </div>
          ${wrong.length ? `<h2 class="h2">Review</h2><div class="card flat">${wrong.map((a) => `<div class="review-item"><div class="q">${esc(a.q)}</div><div class="small" style="color:var(--red)">You chose: ${esc(a.chosen)}</div><div class="small" style="color:var(--green)">Answer: ${esc(a.right)}</div><div class="small muted" style="margin-top:4px">${esc(a.why || '')} ${pageLink(a.page)}</div></div>`).join('')}</div>` : '<p class="muted" style="text-align:center">Nothing missed. Well done.</p>'}
        </section>`;
      const rw = $('#retry-wrong');
      if (rw) rw.addEventListener('click', () => {
        const ids = new Set(wrong.map((a) => a.id));
        teardown();
        cleanup = runQuiz(Object.assign({}, opts, { questions: shuffle(qs.filter((q) => ids.has(q.id))), timed: null, passMark: null, isRetry: true, retryHref: null }));
      });
    }
    const onClick = (e) => { const c = e.target.closest('[data-choice]'); if (c) choose(parseInt(c.getAttribute('data-choice'), 10)); if (e.target.closest('#next')) next(); };
    const onKey = (e) => { if ($('#overlay') || e.target.tagName === 'INPUT') return; const n = parseInt(e.key, 10); if (n >= 1 && n <= (qs[i] ? qs[i].choices.length : 0) && answered == null) choose(n - 1); if (e.key === 'Enter' && answered != null) { e.preventDefault(); next(); } };
    app.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
    if (deadline) timer = setInterval(() => { const left = deadline - Date.now(); const t = $('#timer'); if (t) { t.textContent = fmt(left); t.classList.toggle('low', left <= 300000); } if (left <= 0) finish(true); }, 500);
    function teardown() { app.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); if (timer) clearInterval(timer); timer = null; }
    draw();
    return teardown;
  }
  route(/^\/quiz\/mock$/, () => {
    const t = data.index.test;
    app.innerHTML = `
      <section class="fade-in">
        <a class="btn ghost" href="#/quiz">${icon.back} Quiz</a>
        <h1 class="h1">Mock citizenship test</h1>
        <p class="lead">${t.questions} random questions from every chapter. ${t.minutes} minutes on the clock. You need ${t.pass} right to pass. Answers are shown at the end, like the real test.</p>
        ${progress.mock.length ? `<div class="card flat" style="margin-bottom:14px"><b>Your attempts</b><div class="row" style="margin-top:6px">${progress.mock.slice(-8).map((m) => `<span class="pill ${m.score >= t.pass ? 'green' : 'amber'}">${m.score}/${m.total}</span>`).join('')}</div></div>` : ''}
        <button class="btn primary block" id="start">Start the ${t.minutes}-minute test</button>
      </section>`;
    $('#start').addEventListener('click', () => {
      const perChapter = data.chapters.map((ch) => shuffle(ch.quiz || [])[0]).filter(Boolean);
      const rest = shuffle(data.quiz.filter((q) => !perChapter.includes(q))).slice(0, Math.max(0, t.questions - perChapter.length));
      const qs = shuffle(perChapter.concat(rest)).slice(0, t.questions);
      cleanup = runQuiz({ title: 'Mock test', questions: qs, backHref: '#/quiz', backLabel: 'Quiz', retryHref: '#/quiz/mock', timed: t.minutes, passMark: t.pass, onFinish: (score, total) => { progress.mock.push({ score, total, at: Date.now() }); saveProgress(); } });
    });
  });
  route(/^\/quiz\/official$/, () => {
    const o = data.official; if (!o) { app.innerHTML = '<div class="empty">Official questions not available.</div>'; return; }
    app.innerHTML = `
      <section class="fade-in">
        <a class="btn ghost" href="#/quiz">${icon.back} Quiz</a>
        <h1 class="h1">The booklet's study questions</h1>
        <p class="lead">${esc(o.intro || '')}</p>
        <button class="btn primary" id="start-mcq">Try the ${o.mcq.length} sample questions</button>
        <h2 class="h2">Answer these in your own words</h2>
        <p class="muted small">Say the answer out loud or write it down, then open it to compare with the booklet.</p>
        ${o.short.map((s) => `<details class="official"><summary>${esc(s.q)}</summary><div class="body">${esc(s.answer)}<div style="margin-top:8px">${pageLink(s.page)} ${s.chapter && data.byId[s.chapter] ? `<a class="pagelink" href="#/learn/${esc(s.chapter)}">Read: ${esc(data.byId[s.chapter].title)}</a>` : ''}</div></div></details>`).join('')}
      </section>`;
    $('#start-mcq').addEventListener('click', () => { cleanup = runQuiz({ title: 'Study questions', questions: o.mcq.map((q) => Object.assign({}, q, { chapter: q.chapter || 'rights' })), backHref: '#/quiz/official', backLabel: 'Study questions', onFinish: () => {} }); });
  });
  route(/^\/quiz\/([a-z-]+)(?:\/(all))?$/, (chId, all) => {
    const ch = data.byId[chId]; if (!ch) { app.innerHTML = '<div class="empty">Chapter not found.</div>'; return; }
    const pool = ch.quiz || [];
    if (!pool.length) { app.innerHTML = '<div class="empty">No questions for this chapter yet.</div>'; return; }
    const qs = all ? shuffle(pool) : shuffle(pool).slice(0, QUIZ_BATCH);
    return runQuiz({ title: ch.title, questions: qs, backHref: '#/quiz', backLabel: 'Quiz', nextHref: all || pool.length <= QUIZ_BATCH ? null : `#/quiz/${ch.id}/all`, nextLabel: `All ${pool.length} questions`, onFinish: (score, total) => { const p = progress.quiz[ch.id] || { best: 0, total: 0, attempts: 0, last: 0 }; p.attempts++; if (!p.total || pct(score, total) >= pct(p.best, p.total)) { p.best = score; p.total = total; } p.last = score; progress.quiz[ch.id] = p; saveProgress(); } });
  });

  // ---------- BOOK ----------
  route(/^\/book(?:\/(\d+))?$/, (p) => {
    let page = pageNum(p || 1);
    let zoomed = false;
    if (!bookLocal()) {
      app.innerHTML = `
        <section class="fade-in">
          <h1 class="h1">Booklet</h1>
          <p class="lead">The official <em>Discover Canada</em> guide is free to read online, download as a PDF or eBook, or listen to as audio.</p>
          <a class="btn primary" href="${esc(data.index.book.official)}" target="_blank" rel="noopener">Open the official online guide</a>
          <h2 class="h2">Chapters</h2>
          <div class="grid">${data.chapters.map((c) => `<a class="card link chapter-item" href="#/learn/${c.id}"><div class="num">${c.order}</div><div class="grow"><div class="title">${esc(c.title)}</div><div class="meta">printed pages ${c.pages[0]}–${c.pages[c.pages.length - 1]} · read it here in Learn</div></div></a>`).join('')}</div>
        </section>`;
      return;
    }
    function draw() {
      const spread = settings.spreadBook === 'on' && page < BOOK_PAGES;
      app.classList.toggle('wide', spread);
      const ch = chapterFor(page);
      app.innerHTML = `
        <section class="fade-in book">
          <div class="row" style="justify-content:space-between">
            <h1 class="h1" style="margin:0">Booklet</h1>
            <div class="row" style="gap:8px">
              <button class="btn small spread-btn" id="spread-toggle" aria-pressed="${spread}">${spread ? '1-page view' : '2-page spread'}</button>
              <button class="btn small" id="zoom-toggle" aria-pressed="${zoomed}">${zoomed ? 'Zoom: 1×' : 'Zoom: 1.75×'}</button>
              <a class="btn small ghost" href="discover.pdf#page=${page}" target="_blank" rel="noopener">Open PDF</a>
            </div>
          </div>
          <p class="muted small" style="margin:0">Official <em>Discover Canada</em> (2021 print). ${ch ? `This page is in <a href="#/learn/${ch.id}">${esc(ch.title)}</a>.` : page >= 52 && page <= 53 ? 'Study questions.' : page >= 54 ? 'Reference pages (not on the test).' : ''}</p>
          <div class="pair ${spread ? 'spread' : ''}">
            <div class="page ${zoomed ? 'zoomed' : ''}"><img id="pg" src="book/p${String(page).padStart(2, '0')}.jpg" alt="Booklet page ${page}" width="1100" height="1430"></div>
            ${spread ? `<div class="page ${zoomed ? 'zoomed' : ''}"><img src="book/p${String(page + 1).padStart(2, '0')}.jpg" alt="Booklet page ${page + 1}" width="1100" height="1430"></div>` : ''}
          </div>
          <div class="controls">
            <button class="btn" id="prev" ${page <= 1 ? 'disabled' : ''}>${icon.back} Prev</button>
            <input class="num" id="num" type="number" min="1" max="${BOOK_PAGES}" value="${page}" aria-label="Page number">
            <span class="small muted">of ${BOOK_PAGES}</span>
            <select id="jump" aria-label="Jump to chapter"><option value="">Jump to…</option>${data.chapters.map((c) => `<option value="${c.pages[0]}" ${ch && ch.id === c.id ? 'selected' : ''}>${esc(c.title)} (p.${c.pages[0]})</option>`).join('')}<option value="52">Study Questions (p.52)</option><option value="66">Memorable Quotes (p.66)</option></select>
            <button class="btn" id="next" ${page >= BOOK_PAGES ? 'disabled' : ''}>Next ${icon.next}</button>
          </div>
        </section>`;
      [page - 1, page + 1, page + 2].forEach((n) => { if (n >= 1 && n <= BOOK_PAGES) { const im = new Image(); im.src = `book/p${String(n).padStart(2, '0')}.jpg`; } });
      history.replaceState(null, '', '#/book/' + page);
    }
    function go(n) { page = pageNum(n); draw(); window.scrollTo({ top: 0 }); }
    const onClick = (e) => {
      const step = settings.spreadBook === 'on' && window.innerWidth >= 900 ? 2 : 1;
      if (e.target.closest('#prev')) go(page - step);
      if (e.target.closest('#next')) go(page + step);
      if (e.target.closest('#zoom-toggle')) { zoomed = !zoomed; draw(); }
      if (e.target.closest('#spread-toggle')) { settings.spreadBook = settings.spreadBook === 'on' ? 'off' : 'on'; saveSettings(); draw(); }
    };
    const onChange = (e) => { if (e.target.id === 'num') go(parseInt(e.target.value, 10) || page); if (e.target.id === 'jump' && e.target.value) go(parseInt(e.target.value, 10)); };
    const onKey = (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.key === 'ArrowLeft') go(page - 1); if (e.key === 'ArrowRight') go(page + 1); };
    app.addEventListener('click', onClick); app.addEventListener('change', onChange); document.addEventListener('keydown', onKey);
    draw();
    return () => { app.removeEventListener('click', onClick); app.removeEventListener('change', onChange); document.removeEventListener('keydown', onKey); };
  });

  // ---------- RESOURCES ----------
  route(/^\/resources$/, () => {
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Resources</h1>
        <p class="lead">The official sources first. Third-party practice tests can help with exam nerves, but the booklet is the only thing the real test is based on.</p>
        <h2 class="h2">Official (Government of Canada)</h2>
        <div class="card flat"><ul style="margin:0;padding-left:1.2em">
          <li><a href="https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/discover-canada.html" target="_blank" rel="noopener">Discover Canada — read online, PDF, eBook and audio</a></li>
          <li><a href="https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/discover-canada/read-online/study-questions.html" target="_blank" rel="noopener">Official practice questions</a> (the same ones as in this app's "booklet study questions")</li>
          <li><a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/test/study.html" target="_blank" rel="noopener">How to study for the test</a> · <a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/test/how-it-works.html" target="_blank" rel="noopener">How the test works</a> · <a href="https://www.canada.ca/en/immigration-refugees-citizenship/services/canadian-citizenship/test/online.html" target="_blank" rel="noopener">Taking the online test</a></li>
        </ul></div>
        <h2 class="h2">Free third-party practice tests</h2>
        <p class="small muted">Not checked by us for accuracy. If a question contradicts the booklet, the booklet wins.</p>
        <div class="card flat"><ul style="margin:0;padding-left:1.2em">
          <li><a href="https://canoo.ca/canadian-citizenship-practice-test" target="_blank" rel="noopener">Canoo — free 20-question practice test</a> (no sign-up, English or French)</li>
          <li><a href="https://www.citizentest.ca/free-tests" target="_blank" rel="noopener">CitizenTest.ca — free diagnostic test</a> (chapter tests are paid)</li>
        </ul></div>
      </section>`;
  });

  // ---------- SETTINGS ----------
  route(/^\/settings$/, () => {
    const seg = (key, options) => `<div class="seg" role="group">${options.map(([v, label]) => `<button data-set="${key}" data-val="${v}" aria-pressed="${settings[key] === v}">${label}</button>`).join('')}</div>`;
    const styles = [
      { id: 'argon', name: 'Civic Study', desc: 'Warm parchment, maple red CTA & civic blue progress', colors: ['#faf7f2', '#b81d33', '#1b4f9c', '#146940'] },
      { id: 'quiet-study', name: 'Quiet Study', desc: 'Cool stone ground with deep forest teal accents', colors: ['#f3f4f1', '#c8102e', '#0e6b62', '#8a4b00'] },
      { id: 'opus', name: 'Paper & Lake', desc: 'Top red ribbon, lake blue actions & highlighter notes', colors: ['#f7f5f0', '#1f4fbf', '#d52b1e', '#e8b923'] },
      { id: 'sonnet', name: 'Calm Paper', desc: 'Soft cream, crisp borders & gentle amber feedback', colors: ['#f8f4ed', '#1f4e9e', '#1b6b43', '#8a4604'] },
      { id: 'mythos', name: 'Classic Warm', desc: 'Original warm sand palette with maple red accents', colors: ['#fbf7f1', '#c8102e', '#1f7a4d', '#b4690e'] },
    ];
    const curStyle = settings.style || 'argon';
    app.innerHTML = `
      <section class="fade-in">
        <h1 class="h1">Settings</h1>
        <h2 class="h2" style="margin-top:12px">Color palette</h2>
        <p class="small muted" style="margin-top:0">Pick the look that feels calmest to your eyes. Every palette supports Light and Dark mode.</p>
        <div class="style-grid" role="group" aria-label="Color palette">
          ${styles.map((st) => `
            <button class="style-card" data-set="style" data-val="${st.id}" aria-pressed="${curStyle === st.id}">
              <div class="swatches">${st.colors.map((c) => `<span class="swatch" style="background:${c}"></span>`).join('')}</div>
              <div class="st-name">${esc(st.name)}</div>
              <div class="st-desc">${esc(st.desc)}</div>
            </button>`).join('')}
        </div>

        <h2 class="h2">Display & reading</h2>
        <div class="card flat">
          <div class="setting"><div><b>Theme</b><div class="small muted">Auto follows your device</div></div>${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
          <div class="setting"><div><b>Text size</b></div>${seg('size', [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large'], ['xl', 'XL']])}</div>
          <div class="setting"><div><b>Font</b><div class="small muted">Hyperlegible is easiest for most readers</div></div>${seg('font', [['default', 'Hyperlegible'], ['serif', 'Serif'], ['system', 'System']])}</div>
          <div class="setting"><div><b>Animations</b></div>${seg('motion', [['on', 'On'], ['off', 'Off']])}</div>
          <div class="setting"><div><b>Reading mode</b><div class="small muted">One section at a time keeps the page short</div></div>${seg('readMode', [['step', 'One section'], ['all', 'Whole chapter']])}</div>
        </div>
        <h2 class="h2">Your progress</h2>
        <div class="card flat">
          <p class="small muted" style="margin-top:0">Progress is saved on this device only. To move it to another phone or laptop, copy the code here and paste it there.</p>
          <div class="row"><button class="btn" id="export">Copy progress code</button><button class="btn" id="import">Paste progress code</button><button class="btn ghost" id="reset" style="color:var(--red)">Reset everything</button></div>
          <textarea id="code" class="sr-only" aria-label="Progress code"></textarea>
        </div>
        <p class="small muted" style="margin-top:20px">Content: <em>Discover Canada: The Rights and Responsibilities of Citizenship</em>, © His Majesty the King in Right of Canada, reproduced for personal study. Built with care for one learner, shared for anyone preparing for the test. <a href="#/resources">Resources</a> · <a href="design/" target="_blank">Design round gallery</a></p>
      </section>`;
    const encode = (obj) => btoa(Array.from(new TextEncoder().encode(JSON.stringify(obj)), (b) => String.fromCharCode(b)).join(''));
    const decode = (code) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code.trim()), (c) => c.charCodeAt(0))));
    const onClick = async (e) => {
      const b = e.target.closest('[data-set]');
      if (b) { settings[b.getAttribute('data-set')] = b.getAttribute('data-val'); saveSettings(); render(); return; }
      if (e.target.closest('#export')) {
        const code = encode(progress);
        try { await navigator.clipboard.writeText(code); toast('Progress code copied'); } catch (err) { const ta = $('#code'); ta.classList.remove('sr-only'); ta.value = code; ta.select(); toast('Copy the code from the box'); }
      }
      if (e.target.closest('#import')) {
        let code = '';
        try { code = await navigator.clipboard.readText(); } catch (err) { code = window.prompt('Paste your progress code') || ''; }
        try { const obj = sanitizeProgress(decode(code)); if (Object.keys(obj.sections).length || Object.keys(obj.cards).length || Object.keys(obj.quiz).length || obj.mock.length) { Object.assign(progress, obj); saveProgress(); toast('Progress restored'); render(); } else toast('That is not a progress code'); } catch (err) { toast('That is not a progress code'); }
      }
      if (e.target.closest('#reset')) {
        if (window.confirm('Reset all progress on this device? This cannot be undone.')) {
          Object.assign(progress, sanitizeProgress({}));
          for (const k of Object.keys(focusChecks)) delete focusChecks[k];
          saveProgress(); saveFocus(); toast('Progress reset'); render();
        }
      }
    };
    app.addEventListener('click', onClick);
    return () => app.removeEventListener('click', onClick);
  });

  // ---------- boot ----------
  applySettings();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
