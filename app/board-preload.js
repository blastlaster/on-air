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
