/* =============================================================
   The board view's preload: runs the listener's userscripts on the
   board's pages, in the page itself (like Tampermonkey), with the
   usual GM_* calls. Nothing else of the app is reachable from here.
   ============================================================= */
'use strict';
const { ipcRenderer, webFrame, contextBridge } = require('electron');

// 4chan's "your IP range is blocked … verify your e-mail" message: tell the board window, so it can help.
(function watchForBlock() {
    let told = false;
    const look = () => {
        if (told || !document.body) return;
        if (/blocked due to abuse|verify your e-?mail/i.test(document.body.innerText || '')) { told = true; ipcRenderer.send('board-blocked'); }
    };
    const start = () => { look(); new MutationObserver(look).observe(document.body, { childList: true, subtree: true, characterData: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();

// 4chan's [Embed] buttons (YouTube, SoundCloud) read the link from the element right before them,
// and put the video in front of the element right after. Scripts that wrap a post's text in spans
// ([Better] [s4s]) put a span on both sides: the button says "Error", or the video lands inside
// the [ ]. So point it past those spans: back to the link, and on past the "]".
const EMBED_FIX = `(function () {
    var re = /youtube\\.com\\/watch|youtu\\.be\\/|soundcloud\\.com\\/|snd\\.sc\\//i;
    var M = window.Media;
    if (!M || M.__onair) return;
    M.__onair = true;
    var withLink = function (fn) {
        if (typeof fn !== 'function') return fn;
        return function (e) {
            if (!e) return fn.apply(this, arguments);
            var p = e.previousElementSibling, nx = e.nextElementSibling, set = [];
            if (p && !re.test(p.textContent)) {
                for (var n = p.previousElementSibling; n; n = n.previousElementSibling) {
                    if (re.test(n.textContent)) { Object.defineProperty(e, 'previousElementSibling', { value: n, configurable: true }); set.push('previousElementSibling'); break; }
                }
            }
            if (nx && !/\\bmedia-embed\\b/.test(nx.className) && /^\\s*\\]/.test(nx.textContent)) {
                Object.defineProperty(e, 'nextElementSibling', { value: nx.nextElementSibling, configurable: true });
                set.push('nextElementSibling');
            }
            try { return fn.apply(this, arguments); } finally { set.forEach(function (k) { delete e[k]; }); }
        };
    };
    M.toggleYouTube = withLink(M.toggleYouTube);
    M.toggleSoundCloud = withLink(M.toggleSoundCloud);
    M.showYTPreview = withLink(M.showYTPreview);
    if (M.map) { M.map.yt = M.toggleYouTube; M.map.sc = M.toggleSoundCloud; }
})();`;
if (/(^|\.)4chan(nel)?\.org$/i.test(location.hostname)) {
    const fix = () => webFrame.executeJavaScript(EMBED_FIX).catch(() => {});
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fix, { once: true }); else fix();
    window.addEventListener('load', fix, { once: true });
}

// Hidden threads and posts: 4chan's own hide lists ([–], ▶ → Hide thread / Hide post) kept in step
// with the app's, so what you hide here is hidden in the Interface too, and the other way round.
(function hiding() {
    const m = /^boards\.4chan(nel)?\.org$/i.test(location.hostname) && /^\/(\w{1,12})\//.exec(location.pathname);
    if (!m) return;
    const board = m[1];
    const shared = ipcRenderer.sendSync('board-hidden-get', board);
    if (!shared) return;
    const inThread = /\/thread\//.test(location.pathname);
    const key = { t: '4chan-hide-t-' + board, r: '4chan-hide-r-' + board };
    const read = (k) => { try { return JSON.parse(localStorage.getItem(key[k]) || '{}') || {}; } catch { return {}; } };
    const write = (k, o) => { try { if (Object.keys(o).length) localStorage.setItem(key[k], JSON.stringify(o)); else localStorage.removeItem(key[k]); } catch { /* storage off */ } };
    // Before 4chan's scripts start: the app's list goes into 4chan's (as fresh, so 4chan doesn't
    // tidy them away), and what 4chan had hidden before goes to the app.
    const seen = {}, first = [];
    for (const k of ['t', 'r']) {
        const own = read(k);
        for (const id of Object.keys(own)) if (!shared[k][id]) first.push({ k, id, on: true });
        for (const id of Object.keys(shared[k])) own[id] = Date.now();
        write(k, own);
        seen[k] = own;
    }
    if (first.length) ipcRenderer.send('board-hidden-set', board, first);
    // Unhidden here = gone from 4chan's list while it's on this page (4chan also drops dead
    // threads and old posts from its list by itself; those aren't the listener unhiding them).
    const onPage = (k, id) => k === 't' ? !inThread && !!document.getElementById('t' + id) : !!document.getElementById('pc' + id);
    const check = () => {
        const ops = [];
        for (const k of ['t', 'r']) {
            const now = read(k);
            for (const id of Object.keys(now)) if (!seen[k][id]) ops.push({ k, id, on: true });
            for (const id of Object.keys(seen[k])) if (!now[id] && onPage(k, id)) ops.push({ k, id, on: false });
            seen[k] = now;
        }
        if (ops.length) ipcRenderer.send('board-hidden-set', board, ops);
    };
    setInterval(check, 1500);
    window.addEventListener('pagehide', check);
    // Hidden or shown in the Interface while this page is open: 4chan does it, the way its own button would.
    ipcRenderer.on('board-hidden', (e, b, ops) => {
        if (b !== board || !Array.isArray(ops)) return;
        check();
        const js = `(function (ops, inThread) {
    var T = window.ThreadHiding, R = window.ReplyHiding;
    ops.forEach(function (o) {
        var H = o.k === 't' ? T : R, el = document.getElementById((o.k === 't' ? 't' : 'pc') + o.id);
        if (!H || !H.hidden) return;
        if (H.load) H.load();
        if (el && !(o.k === 't' && inThread)) { if (H.isHidden(o.id) !== o.on) H.toggle(o.id); return; }
        if (o.on) H.hidden[o.id] = Date.now(); else delete H.hidden[o.id];
        H.save();
    });
})(${JSON.stringify(ops)}, ${inThread})`;
        const after = () => {
            // 4chan wasn't running (or didn't take it): its lists directly, for next time.
            for (const o of ops) { const l = read(o.k); if (o.on && !l[o.id]) l[o.id] = Date.now(); if (!o.on) delete l[o.id]; write(o.k, l); }
            seen.t = read('t'); seen.r = read('r');
        };
        webFrame.executeJavaScript(js).then(after, after);
    });
})();

// Watched threads: 4chan's Thread Watcher ('4chan-watch': "<thread>-<board>" → [label, last reply, new])
// kept in step with the Interface's ★, the same way.
(function watching() {
    const m = /^boards\.4chan(nel)?\.org$/i.test(location.hostname) && /^\/(\w{1,12})\//.exec(location.pathname);
    if (!m) return;
    const board = m[1];
    const shared = ipcRenderer.sendSync('board-watched-get', board);
    if (!shared) return;
    const KEY = '4chan-watch', SEEN = 'onair-watch-' + board, tail = '-' + board;
    const readAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
    const writeAll = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage off */ } };
    const mine = () => { const all = readAll(), out = {}; for (const k of Object.keys(all)) if (k.endsWith(tail) && /^\d+$/.test(k.slice(0, -tail.length))) out[k.slice(0, -tail.length)] = all[k]; return out; };
    const label = (v) => String(Array.isArray(v) ? v[0] || '' : '').replace(/<[^>]*>/g, '').slice(0, 120);
    const entry = (id, title) => [title || 'No.' + id, id, 0];
    const remember = (ids) => { try { localStorage.setItem(SEEN, JSON.stringify(ids)); } catch { /* storage off */ } };
    // Before 4chan's scripts start, the lists meet. In 4chan's list but not the app's: new here (to the app),
    // or, if the app had it last time, unwatched in the Interface since (it goes). The app's go into 4chan's.
    let before = null;
    try { before = JSON.parse(localStorage.getItem(SEEN) || 'null'); } catch { /* none */ }
    const all = readAll(), add = [];
    for (const [id, v] of Object.entries(mine())) {
        if (shared[id]) continue;
        if (Array.isArray(before) && before.includes(id)) delete all[id + tail];
        else add.push({ id, on: true, title: label(v) });
    }
    for (const [id, w] of Object.entries(shared)) if (!all[id + tail]) all[id + tail] = entry(id, w.title);
    writeAll(all);
    if (add.length) ipcRenderer.send('board-watched-set', board, add);
    let seen = Object.keys(mine());
    remember(seen);
    // Watched or unwatched here (4chan's ★, or its watcher's ✕).
    const check = () => {
        const now = mine(), ops = [];
        for (const id of Object.keys(now)) if (!seen.includes(id)) ops.push({ id, on: true, title: label(now[id]) });
        for (const id of seen) if (!now[id]) ops.push({ id, on: false });
        seen = Object.keys(now);
        remember(seen);
        if (ops.length) ipcRenderer.send('board-watched-set', board, ops);
    };
    setInterval(check, 1500);
    window.addEventListener('pagehide', check);
    // Watched or unwatched in the Interface while this page is open: 4chan's watcher takes it (and redraws).
    ipcRenderer.on('board-watched', (e, b, ops) => {
        if (b !== board || !Array.isArray(ops)) return;
        check();
        const js = `(function (ops, tail) {
    var W = window.ThreadWatcher;
    if (!W || !W.watched || !W.save) return;
    if (W.load) W.load();
    ops.forEach(function (o) { var k = o.id + tail; if (o.on) { if (!W.watched[k]) W.watched[k] = [o.title || ('No.' + o.id), o.id, 0]; } else delete W.watched[k]; });
    W.save();
    if (W.build) W.build();
})(${JSON.stringify(ops)}, ${JSON.stringify(tail)})`;
        const after = () => {
            // 4chan's watcher wasn't running: its list directly, for next time.
            const l = readAll();
            for (const o of ops) { if (o.on && !l[o.id + tail]) l[o.id + tail] = entry(o.id, o.title); if (!o.on) delete l[o.id + tail]; }
            writeAll(l);
            seen = Object.keys(mine());
            remember(seen);
        };
        webFrame.executeJavaScript(js).then(after, after);
    });
})();

// Green threads: the Interface's own threads, pinned on top of the board's index and catalog (the
// station's board only; the app says which). They read like a text board (world4ch): numbered posts,
// "Name: Anonymous : date". Read here; a click opens one in the Interface to reply. [–] hides one,
// "Hide all" hides the lot (the app keeps both).
(function greenThreads() {
    if (!/^boards\.4chan(nel)?\.org$/i.test(location.hostname) || !/^\/\w{1,12}\/(\d{0,2}|catalog)$/.test(location.pathname)) return;
    const catalog = /\/catalog$/.test(location.pathname);
    const CLOVER = '<svg class="oa-clover" viewBox="0 0 16 16" aria-label="Green thread" role="img"><title>Green thread</title>' +
        '<path d="M8.6 8.6 Q11 12.5 14.5 15" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
        '<g fill="currentColor">' + [45, 135, 225, 315].map(a => '<path transform="rotate(' + a + ' 8 8)" d="M8 7.4 C6 6 4.5 4.6 5.4 2.9 C6.1 1.7 7.5 1.8 8 2.9 C8.5 1.8 9.9 1.7 10.6 2.9 C11.5 4.6 10 6 8 7.4Z"/>').join('') + '</g></svg>';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (text) => String(text || '').split('\n').map((line) => {
        const h = esc(line).replace(/&gt;&gt;([0-9a-zA-Z]{1,12})/g, '<span class="oa-ql">&gt;&gt;$1</span>');
        return /^&gt;(?!&gt;)/.test(esc(line)) ? '<span class="quote">' + h + '</span>' : h;
    }).join('<br>');
    const when = (ms) => { if (!ms) return ''; const d = new Date(ms), z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };
    const head = (p, n) => '<div class="oa-ph"><b>' + n + '</b> Name: <b class="oa-name">' + esc(p.name || 'Anonymous') + '</b>' + (p.trip ? ' <span class="oa-dim">' + esc(p.trip) + '</span>' : '') +
        (p.cap ? ' <b class="oa-cap">## ' + esc(p.cap) + '</b>' : '') + ' : ' + esc(when(p.time)) + ' <span class="oa-dim">No.' + esc(p.id) + '</span></div>';
    const title = (t) => t.sub || t.text.split('\n')[0].slice(0, 60) || 'No.' + t.id;
    const CSS = `
.oa-green { margin: 4px 0 0; }
.oa-bar { margin: 4px 0; font-size: 13px; }
.oa-bar a, .oa-x, .oa-stub a { cursor: pointer; text-decoration: underline; }
.oa-gt { position: relative; margin: 4px 0 8px; padding: 6px 34px 8px 10px; border: 1px solid #a9a9a9; border-left: 4px solid #35c46a; background: #efefef; color: #000; cursor: pointer; overflow-wrap: anywhere; display: flow-root;
    font-family: "Mona", "IPAMonaPGothic", "MS PGothic", Arial, sans-serif; font-size: 13px; }
.oa-gt:hover { background: #e6efe8; }
.oa-gt .oa-x { position: absolute; right: 6px; top: 28px; text-decoration: none; font-family: monospace; color: #555; }
.oa-title { margin: 0 0 6px; font-size: 1.2em; color: #cc1105; font-weight: bold; }
.oa-title span { color: #000; font-weight: normal; font-size: .8em; }
.oa-ph { font-size: .95em; }
.oa-name { color: #117743; }
.oa-cap { color: #c00; }
.oa-gt blockquote { margin: 3px 0 8px 2.2em; }
.oa-gt .quote { color: #789922; }
.oa-gt img.oa-pic { float: left; margin: 4px 12px 6px 2.2em; border: 0; max-width: 200px; max-height: 200px; width: auto; height: auto; }
.oa-gt img.oa-pic.small { max-width: 120px; max-height: 120px; }
.oa-gt blockquote + .oa-ph { clear: both; }
.oa-om { display: block; clear: both; margin: 0 0 6px; color: #555; font-size: .95em; }
.oa-gt .oa-clover, .oa-tile .oa-clover { position: absolute; top: 5px; right: 6px; width: 20px; height: 20px; color: #35c46a; filter: drop-shadow(0 0 1px rgba(0,0,0,.45)); }
.oa-tag { color: #fff; background: #35c46a; border-radius: 3px; padding: 0 4px; font-size: .85em; font-weight: bold; }
.oa-dim { opacity: .7; }
.oa-ql { color: #00e; text-decoration: underline; }
.oa-stub { margin: 2px 0; font-size: 13px; opacity: .8; }
.oa-tile { position: relative; cursor: pointer; }
.oa-tile .oa-box { display: grid; place-items: center; width: 150px; max-width: 100%; height: 100px; margin: 0 auto 4px; border-radius: 3px; background: rgba(53,196,106,.18); box-shadow: 0 0 0 1px #35c46a inset; font-size: 40px; position: relative; overflow: hidden; }
.oa-tile .oa-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
.oa-tile .oa-box .oa-clover { width: 40%; height: 40%; top: 4px; right: 4px; }
.oa-tile .oa-x { position: absolute; top: 2px; left: 4px; z-index: 1; font-family: monospace; text-decoration: none; opacity: 0; }
.oa-tile:hover .oa-x { opacity: 1; }
`;
    let last = '', state = { threads: [], off: false, hid: [] };
    const thread = (t) => '<div class="oa-gt" data-id="' + esc(t.id) + '" title="A green thread: open it in the Interface to read it all and reply">' + CLOVER +
        '<a class="oa-x" data-oa-hide="' + esc(t.id) + '" title="Hide this green thread">[–]</a>' +
        '<div class="oa-title">' + esc(title(t)) + ' <span>[' + (t.replies + 1) + ']</span></div>' +
        head(t, 1) + (t.img ? '<img class="oa-pic" alt="" loading="lazy" src="' + esc(t.img.thumb) + '">' : '') +
        '<blockquote>' + fmt(t.text) + '</blockquote>' +
        '<span class="oa-om">' + (t.replies > t.last.length ? (t.replies - t.last.length) + ' repl' + (t.replies - t.last.length === 1 ? 'y' : 'ies') + ' omitted. ' : '') + 'Click to read it all and reply in the Interface.</span>' +
        t.last.map((p, k) => head(p, t.replies - t.last.length + k + 2) + (p.img ? '<img class="oa-pic small" alt="" loading="lazy" src="' + esc(p.img.thumb) + '">' : '') + '<blockquote>' + fmt(p.text) + '</blockquote>').join('') +
        '</div>';
    const stub = (t) => '<div class="oa-stub"><a data-oa-hide="' + esc(t.id) + '" data-on="0" title="Show this green thread">[+]</a> Green thread No.' + esc(t.id) + ' hidden: ' + esc(title(t)) + '</div>';
    const tile = (t) => '<div class="thread oa-tile" data-oa-green data-id="' + esc(t.id) + '" title="A green thread: open it in the Interface">' +
        '<a class="oa-x" data-oa-hide="' + esc(t.id) + '" title="Hide this green thread">✕</a>' +
        '<div class="oa-box">' + (t.img ? '<img alt="" loading="lazy" src="' + esc(t.img.thumb) + '">' : '🟩') + CLOVER + '</div><div class="meta">R: <b>' + t.replies + '</b> <span class="oa-tag">green</span></div>' +
        '<div class="teaser">' + (t.sub ? '<b>' + esc(t.sub) + '</b>: ' : '') + esc(t.text.slice(0, 200)) + '</div></div>';
    function paint(force) {
        const sig = JSON.stringify(state);
        if (!force && sig === last && document.querySelector('[data-oa-green]')) return;
        last = sig;
        for (const el of document.querySelectorAll('[data-oa-green]')) el.remove();
        const all = state.threads, hid = new Set(state.hid), shown = all.filter(t => !hid.has(t.id));
        if (!all.length) return;
        const n = all.length - shown.length;
        const bar = state.off
            ? '<div class="oa-bar" data-oa-green>🟩 ' + all.length + ' green thread' + (all.length === 1 ? '' : 's') + ' hidden · <a data-oa-all="0">Show</a></div>'
            : '<div class="oa-bar" data-oa-green>🟩 <b>Green threads</b> <span class="oa-dim">· the Interface’s own threads' + (n ? ' · ' + n + ' hidden' : '') + '</span> · <a data-oa-all="1">Hide all</a></div>';
        if (catalog) {
            const grid = document.getElementById('threads');
            if (!grid) return;
            grid.insertAdjacentHTML('beforebegin', bar);
            if (!state.off) grid.insertAdjacentHTML('afterbegin', shown.map(tile).join(''));
            return;
        }
        const board = document.querySelector('.board');
        if (!board) return;
        board.insertAdjacentHTML('afterbegin', '<div class="oa-green" data-oa-green>' + bar.replace(' data-oa-green', '') + (state.off ? '' : all.map(t => hid.has(t.id) ? stub(t) : thread(t)).join('')) + '<hr></div>');
    }
    async function load() {
        const r = await ipcRenderer.invoke('board-green').catch(() => null);
        if (r && Array.isArray(r.threads)) { state = r; paint(); }
    }
    const start = () => {
        const st = document.createElement('style');
        st.textContent = CSS;
        document.head.appendChild(st);
        document.addEventListener('click', async (e) => {
            if (!e.target.closest) return;
            const h = e.target.closest('[data-oa-hide], [data-oa-all]');
            if (h) {
                e.preventDefault(); e.stopPropagation();
                const r = h.dataset.oaAll !== undefined ? await ipcRenderer.invoke('board-green-hide', '*', h.dataset.oaAll === '1').catch(() => null)
                    : await ipcRenderer.invoke('board-green-hide', h.dataset.oaHide, h.dataset.on !== '0').catch(() => null);
                if (r) { state = { ...state, ...r }; paint(true); }
                return;
            }
            const t = e.target.closest('.oa-gt[data-id], .oa-tile[data-id]');
            if (!t || e.target.closest('a')) return;
            e.preventDefault();
            ipcRenderer.send('board-green-open', t.dataset.id);
        }, true);
        // The catalog redraws its grid (sorting, searching): put them back on top.
        const grid = catalog && document.getElementById('threads');
        if (grid) new MutationObserver(() => { if (!state.off && state.threads.length && !grid.querySelector('[data-oa-green]')) paint(true); }).observe(grid, { childList: true });
        load();
        setInterval(() => { if (!document.hidden) load(); }, 60e3);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();

const scripts = ipcRenderer.sendSync('us-for', location.href) || [];
if (scripts.length) {
    const values = {};
    for (const s of scripts) values[s.id] = s.values || {};
    // The scripts reach the app only through this: their own saved values and @connect requests.
    contextBridge.exposeInMainWorld('__onairUS', {
        get: (id, k) => values[id] ? values[id][k] : undefined,
        keys: (id) => Object.keys(values[id] || {}),
        set: (id, k, v) => { if (!values[id]) return; v = v === undefined ? undefined : JSON.parse(JSON.stringify(v)); if (v === undefined) delete values[id][k]; else values[id][k] = v; ipcRenderer.send('us-value', id, k, v); },
        xhr: (id, d, done) => { ipcRenderer.invoke('us-xhr', id, d).then((r) => done(null, r), (e) => done(String(e && e.message || e).replace(/^Error invoking remote method 'us-xhr': (Error: )?/, ''))); }
    });

    const wrap = (s) => `(function () {
var __B = window.__onairUS, __ID = ${JSON.stringify(s.id)};
var GM_info = { script: { name: ${JSON.stringify(s.name)}, version: ${JSON.stringify(s.version)} }, scriptHandler: 'On Air', version: '1' };
var unsafeWindow = window;
function GM_getValue(k, d) { var v = __B.get(__ID, String(k)); return v === undefined ? d : v; }
function GM_setValue(k, v) { __B.set(__ID, String(k), v); }
function GM_deleteValue(k) { __B.set(__ID, String(k), undefined); }
function GM_listValues() { return __B.keys(__ID); }
function GM_addStyle(css) { var st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st); return st; }
function GM_openInTab(url) { return window.open(url, '_blank'); }
function GM_xmlhttpRequest(d) {
  d = d || {};
  var req = { method: d.method || 'GET', url: String(new URL(String(d.url || ''), location.href)), headers: d.headers || {}, data: null, timeout: d.timeout || 0 };
  var gone = false;
  // Files (an image upload) travel as bytes; everything else as text.
  var bytes = function (b) { return b.arrayBuffer().then(function (a) { return { name: b.name || 'blob', type: b.type || '', bytes: new Uint8Array(a) }; }); };
  var body = d.data;
  var ready = body == null ? Promise.resolve(null)
    : (typeof FormData != 'undefined' && body instanceof FormData) ? Promise.all(Array.from(body.entries()).map(function (kv) {
        return kv[1] instanceof Blob ? bytes(kv[1]).then(function (f) { return { k: kv[0], file: f }; }) : { k: kv[0], v: String(kv[1]) };
      })).then(function (parts) { return { form: parts }; })
    : (body instanceof Blob) ? bytes(body).then(function (f) { return { blob: f }; })
    : (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) ? Promise.resolve({ blob: { type: '', bytes: new Uint8Array(body.buffer || body) } })
    : Promise.resolve({ text: String(body) });
  ready.then(function (b) { req.data = b; if (!gone) send(); }, function (e) { if (d.onerror) d.onerror({ status: 0, statusText: String(e), responseText: '', readyState: 4 }); });
  function send() { __B.xhr(__ID, req, function (err, r) {
    if (gone) return;
    if (err) { console.warn('[' + GM_info.script.name + '] ' + err); var x = { status: 0, statusText: err, responseText: '', readyState: 4, error: err }; if (d.onerror) d.onerror(x); if (d.onloadend) d.onloadend(x); return; }
    r.readyState = 4; r.response = r.responseText;
    if (d.responseType === 'json') { try { r.response = JSON.parse(r.responseText); } catch (e) { r.response = null; } }
    if (d.onload) d.onload(r);
    if (d.onloadend) d.onloadend(r);
  }); }
  return { abort: function () { gone = true; if (d.onabort) d.onabort({}); } };
}
var GM = {
  info: GM_info,
  getValue: function (k, d) { return Promise.resolve(GM_getValue(k, d)); },
  setValue: function (k, v) { GM_setValue(k, v); return Promise.resolve(); },
  deleteValue: function (k) { GM_deleteValue(k); return Promise.resolve(); },
  listValues: function () { return Promise.resolve(GM_listValues()); },
  addStyle: function (c) { return Promise.resolve(GM_addStyle(c)); },
  openInTab: GM_openInTab,
  xmlHttpRequest: GM_xmlhttpRequest
};
(function () {
${s.code}
}).call(window);
})();
//# sourceURL=userscript:${encodeURIComponent(s.name)}.user.js`;

    const run = (s) => webFrame.executeJavaScript(wrap(s)).catch((e) => console.error('[' + s.name + ']', e));
    const start = scripts.filter(s => s.runAt === 'document-start');
    const later = scripts.filter(s => s.runAt !== 'document-start');
    start.forEach(run);
    if (later.length) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => later.forEach(run), { once: true });
        else later.forEach(run);
    }
}
