/* =============================================================
   USERSCRIPTS — Tampermonkey-style scripts for the board window.

   The listener adds a script by its link (a Greasy Fork page or a
   .user.js address), sees what it asks for, and says yes. It runs
   only in the board's own view (never in the app's windows), on the
   pages its @match / @include lines name. GM_xmlhttpRequest goes
   only to the sites its @connect lines name (and the board itself).

   Kept in <userData>/userscripts: one .user.js per script, list.json
   (what is installed, on or off) and values.json (GM_setValue).
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ipcMain, session } = require('electron');

const MAX_CODE = 2e6, MAX_UPLOAD = 25e6;

/** The ==UserScript== block: { name: ['…'], match: ['…', '…'], … } */
function parseMeta(code) {
    const block = /\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/.exec(code);
    if (!block) return null;
    const meta = {};
    for (const line of block[1].split(/\r?\n/)) {
        const m = /^\s*\/\/\s*@([\w:.-]+)\s*(.*?)\s*$/.exec(line);
        if (m) (meta[m[1]] = meta[m[1]] || []).push(m[2]);
    }
    return meta;
}

/** @match pattern → RegExp (scheme://host/path, * wildcards, *.host). */
function matchToRe(p) {
    if (p === '<all_urls>') return /^https?:\/\//;
    const m = /^(\*|https?):\/\/(\*|(?:\*\.)?[^/*]+)(\/.*)$/.exec(p);
    if (!m) return null;
    const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const scheme = m[1] === '*' ? 'https?' : m[1];
    const host = m[2] === '*' ? '[^/]+' : m[2].startsWith('*.') ? '(?:[^/]+\\.)?' + esc(m[2].slice(2)) : esc(m[2]);
    return new RegExp('^' + scheme + ':\\/\\/' + host + esc(m[3]).replace(/\\\*/g, '.*').replace(/\*/g, '.*') + '$');
}
/** @include / @exclude glob (or /regex/) → RegExp. */
function globToRe(p) {
    const r = /^\/(.+)\/([a-z]*)$/.exec(p);
    if (r) { try { return new RegExp(r[1], r[2].replace(/[^i]/g, '')); } catch { return null; } }
    if (p === '*') return /^https?:\/\//;
    return new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
}

function runsOn(s, url) {
    const hit = (list, f) => (list || []).some(p => { const re = f(p); return re && re.test(url); });
    if (hit(s.exclude, globToRe)) return false;
    return hit(s.match, matchToRe) || hit(s.include, globToRe);
}

/** A Greasy Fork / Sleazy Fork page → its code; a .user.js link as it is. */
async function codeUrl(input) {
    let u;
    try { u = new URL(String(input || '').trim()); } catch { throw new Error('Paste the script’s link.'); }
    if (u.protocol !== 'https:') throw new Error('Only https links.');
    const gf = /^(?:www\.)?(greasyfork|sleazyfork)\.org$/.exec(u.hostname);
    const id = gf && /\/scripts\/(\d+)/.exec(u.pathname);
    if (id && !/\.user\.js$/.test(u.pathname)) {
        const r = await fetch(`https://${gf[1]}.org/scripts/${id[1]}.json`, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`${gf[1]}.org answered ${r.status}.`);
        const j = await r.json();
        if (!j.code_url) throw new Error('That page has no script to install.');
        return { code: j.code_url, page: `https://${gf[1]}.org/scripts/${id[1]}` };
    }
    if (!/\.user\.js$/i.test(u.pathname)) throw new Error('That is not a userscript link (a Greasy Fork page or a .user.js address).');
    return { code: u.href, page: '' };
}

async function fetchScript(input) {
    const src = await codeUrl(input);
    const r = await fetch(src.code, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`The script’s site answered ${r.status}.`);
    const code = await r.text();
    if (code.length > MAX_CODE) throw new Error('That script is too big.');
    const meta = parseMeta(code);
    if (!meta || !meta.name) throw new Error('That file is not a userscript (no ==UserScript== header).');
    const one = (k) => (meta[k] && meta[k][0]) || '';
    return {
        code,
        info: {
            name: one('name').slice(0, 100), version: one('version').slice(0, 40), description: one('description').slice(0, 300),
            author: one('author').slice(0, 100), source: input, page: src.page || '', code: src.code,
            match: meta.match || [], include: meta.include || [], exclude: (meta.exclude || []).concat(meta['exclude-match'] || []),
            connect: meta.connect || [], grant: (meta.grant || []).filter(g => g !== 'none'), runAt: one('run-at') || 'document-idle',
            noframes: 'noframes' in meta
        }
    };
}

/**
 * opts: { dir, getView: () => the board WebContentsView or null, allowed: (url) => is it the board's site }
 */
function setup({ dir, getView, boardSite }) {
    fs.mkdirSync(dir, { recursive: true });
    const LIST = path.join(dir, 'list.json'), VALUES = path.join(dir, 'values.json');
    const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
    const write = (f, v) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); };
    let list = read(LIST, []), values = read(VALUES, {});
    let saveTimer = null;
    const saveValues = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => write(VALUES, values), 500); };
    const fileOf = (id) => path.join(dir, id + '.user.js');
    const pending = new Map();            // fetched, waiting for a yes
    const view = () => { const v = getView(); return v && !v.webContents.isDestroyed() ? v.webContents : null; };
    const reloadBoard = () => { const wc = view(); if (wc) wc.reload(); };
    const pub = () => list.map(s => ({ id: s.id, on: s.on, name: s.name, version: s.version, description: s.description, page: s.page, source: s.source, code: s.code, connect: s.connect, match: s.match, include: s.include }));

    // ---- from the board window (the app's own page) ----
    function handlers(isBoardWindow) {
        const h = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!isBoardWindow(e)) throw new Error('Not allowed.'); return fn(...a); });
        h('us-list', () => pub());
        h('us-fetch', async (url) => {
            const got = await fetchScript(url);
            const key = crypto.randomBytes(6).toString('hex');
            pending.set(key, got);
            setTimeout(() => pending.delete(key), 10 * 60e3);
            const same = list.find(s => s.name === got.info.name || s.source === got.info.source);
            return { key, info: got.info, replaces: same ? { id: same.id, version: same.version } : null };
        });
        h('us-install', (key) => {
            const got = pending.get(key);
            if (!got) throw new Error('That took too long — add it again.');
            pending.delete(key);
            const old = list.find(s => s.name === got.info.name || s.source === got.info.source);
            const id = old ? old.id : crypto.randomBytes(6).toString('hex');
            fs.writeFileSync(fileOf(id), got.code);
            const entry = { id, on: old ? old.on : true, ...got.info, added: old ? old.added : Date.now(), updated: Date.now() };
            list = old ? list.map(s => s.id === id ? entry : s) : list.concat(entry);
            write(LIST, list); reloadBoard();
            return pub();
        });
        h('us-set', (id, on) => {
            const s = list.find(x => x.id === id);
            if (!s) throw new Error('That script is gone.');
            s.on = !!on; write(LIST, list); reloadBoard();
            return pub();
        });
        h('us-remove', (id) => {
            list = list.filter(s => s.id !== id);
            try { fs.unlinkSync(fileOf(id)); } catch { /* already gone */ }
            delete values[id]; saveValues();
            write(LIST, list); reloadBoard();
            return pub();
        });
    }

    // ---- from the board's own view (its preload) ----
    const fromView = (e) => { const wc = view(); return !!wc && e.sender === wc && e.senderFrame === wc.mainFrame; };
    ipcMain.on('us-for', (e, url) => {
        if (!fromView(e)) { e.returnValue = []; return; }
        e.returnValue = list.filter(s => s.on && runsOn(s, String(url))).map(s => {
            let code = '';
            try { code = fs.readFileSync(fileOf(s.id), 'utf8'); } catch { return null; }
            return { id: s.id, name: s.name, version: s.version, runAt: s.runAt, code, values: values[s.id] || {} };
        }).filter(Boolean);
    });
    ipcMain.on('us-value', (e, id, k, v) => {
        if (!fromView(e) || !list.some(s => s.id === id) || typeof k !== 'string') return;
        const box = values[id] = values[id] || {};
        if (v === undefined) delete box[k]; else box[k] = v;
        if (JSON.stringify(box).length > 1e6) delete box[k];          // a runaway script can't fill the disk
        saveValues();
    });
    ipcMain.handle('us-xhr', async (e, id, d) => {
        if (!fromView(e)) throw new Error('Not allowed.');
        const s = list.find(x => x.id === id && x.on);
        if (!s) throw new Error('Script not running.');
        const u = new URL(String(d && d.url || ''), view().getURL());
        if (!/^https?:$/.test(u.protocol)) throw new Error('Only web addresses.');
        // Only the board itself and the sites the script said it talks to (@connect).
        const ok = boardSite(u.href) || (s.connect || []).some(c => c !== '*' && (u.hostname === c || u.hostname.endsWith('.' + c)));
        if (!ok) throw new Error(`${s.name} did not say it talks to ${u.hostname} (@connect).`);
        const method = String(d.method || 'GET').toUpperCase();
        const headers = {};
        for (const [k, v] of Object.entries(d.headers || {})) if (!/^(host|cookie|origin|content-length)$/i.test(k)) headers[k] = String(v);
        let body;
        const b = d.data;
        if (b && method !== 'GET' && method !== 'HEAD') {
            let size = 0;
            const blob = (f) => { size += f.bytes.length; if (size > MAX_UPLOAD) throw new Error('That file is too big.'); return new Blob([f.bytes], { type: String(f.type || '') }); };
            if (typeof b.text === 'string') body = b.text;
            else if (b.blob) body = Buffer.from(await blob(b.blob).arrayBuffer());
            else if (Array.isArray(b.form)) {
                // multipart/form-data, with its own boundary (a Content-Type the script set would lack it)
                const fd = new FormData();
                for (const p of b.form) if (p.file) fd.append(String(p.k), blob(p.file), String(p.file.name || 'blob')); else fd.append(String(p.k), String(p.v));
                const enc = new Response(fd);
                body = Buffer.from(await enc.arrayBuffer());
                for (const k of Object.keys(headers)) if (/^content-type$/i.test(k)) delete headers[k];
                headers['Content-Type'] = enc.headers.get('content-type');
            }
        }
        const r = await session.fromPartition('persist:board').fetch(u.href, {
            method, headers, body, credentials: 'include',
            signal: AbortSignal.timeout(Math.min(Number(d.timeout) || 60000, 120000))
        });
        const text = await r.text();
        return {
            status: r.status, statusText: r.statusText, finalUrl: r.url, responseText: text.slice(0, 5e6),
            responseHeaders: [...r.headers].map(([k, v]) => k + ': ' + v).join('\r\n')
        };
    });

    return { handlers, list: () => pub() };
}

module.exports = { setup, parseMeta, runsOn, matchToRe, globToRe, fetchScript };
