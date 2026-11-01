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
