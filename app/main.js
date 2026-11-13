/* =============================================================
   ON AIR — the desktop app.

   The radio is the main window: what is playing, play/volume,
   votes, and a column of buttons. Every other part of the station
   — chat, requests, the playlist, the LED sign, call-in, albums,
   the board, the video, links, settings — is its own small window
   that can be moved, resized, rolled up to its title bar, tucked
   back into the radio, kept on top, and given its own look and
   text size. Each one can be switched off altogether.

   Light on purpose: every window is a page of the app's own
   (served from onair://app/), opened by the radio with
   window.open, so they all share the radio's one renderer process
   and its one connection to the station. A window that is not
   open costs nothing.

   Also, as before:
     - lives in the tray, keeps playing with the window closed
     - "the station is live" alerts, by watching the station itself
       (no push service, no accounts — see watch.js)
     - starts with the computer if you want, quietly in the tray
     - play/pause from the tray and the keyboard's media keys

   Safety: the app's pages run sandboxed with no Node access; the
   only things they can ask of this side are the calls below. Links
   to other sites open in your browser; the microphone is offered
   only to the app's own pages (call-in and voicemail).
   ============================================================= */
'use strict';
const { app, BrowserWindow, WebContentsView, Tray, Menu, Notification, ipcMain, shell, session, nativeImage, dialog, protocol, net, screen, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { resolveStation, Watcher } = require('./watch');

// A tapped alert should start the show without a second click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// The TV decodes in software on Windows: with several of our see-through windows open, the
// graphics chip's video decoder stalls (the stream "buffers" with seconds of video in hand).
// A small live stream is light work for any processor.
if (process.platform === 'win32') app.commandLine.appendSwitch('disable-accelerated-video-decode');
if (process.platform === 'win32') app.setAppUserModelId('org.onair.app');     // Windows needs it for notifications
if (process.env.ONAIR_USERDATA) app.setPath('userData', process.env.ONAIR_USERDATA);   // tests use their own

// The app's own pages: one origin, so its windows share one process.
protocol.registerSchemesAsPrivileged([{ scheme: 'onair', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const APP = 'onair://app/';
const UI_DIR = path.join(__dirname, 'ui');

if (!app.requestSingleInstanceLock()) { app.quit(); return; }

/* ---------- settings, kept in the app's own folder ---------- */
const CONFIG = path.join(app.getPath('userData'), 'config.json');
const UI_DEFAULTS = {
    skin: '', fx: 'simple', font: 'normal', side: 'right',
    off: [],                    // elements switched off
    hideWithRadio: true,        // minimising the radio tucks the other windows away too
    onTop: false,               // new windows start on top of other programs
    bannerInRadio: true,
    downloads: '', askWhere: false, lossless: false,
    boardOk: false,             // said yes to the board's 18+ warning
    boardTint: true,            // the board takes the look's tint
    chatSound: false,           // a chime for new chat messages (Settings → Alerts, or 🔔 in the Chat window)
    holidays: true,             // holiday looks on their day (Spooky, Crimbus…)
    holidaySkip: '', holidayTold: '',   // the day you picked your own look instead; the day the radio said so
    ifaceOn: false,             // the secret Interface window (type "interface" on the radio)
    travelOn: false,            // the Studio-on-a-server field in Settings → Station (type "mysterioustraveller" on the radio)
    layout: 'windows',          // 'windows': the radio and its own windows; 'one': one big window laid out like the station's site
    full: {},                   // the one window: which panels are showing ({ np, chat, tv, mid: the middle's arrangement, arr })
    ifaceServer: '',            // green threads server, if not the station's
    ifaceToken: '', ifaceTokenFor: ''   // the station's moderator token, and the server it is for (never sent to the pages)
};
const DEFAULTS = { stations: [], current: 0, alerts: true, openAtLogin: false, updates: true, seen: '', seenPing: '', toldTray: false, ui: {}, windows: {}, ifaceKey: '', studioSsh: '' };
let cfg = load();
function load() {
    let c;
    try { c = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8')) }; } catch { c = { ...DEFAULTS }; }
    c.ui = { ...UI_DEFAULTS, ...(c.ui || {}) };
    c.windows = c.windows || {};
    return c;
}
let saveT = null;
function save() {
    clearTimeout(saveT); saveT = null;
    fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
    fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 1));
}
const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 800); };
const station = () => cfg.stations[cfg.current] || null;
const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
const stationOrigin = () => (station() ? originOf(station().pageUrl) : '');

let win = null, tray = null, watcher = null, quitting = false, stationsWin = null;
let pageState = null, watchState = null;
const icon = (name) => nativeImage.createFromPath(path.join(__dirname, 'icons', name + '.png'));

/* =============================================================
   STATION ICONS — the app wears the station's face.

   When a station is added the app looks at the icons its page
   declares (<link rel="icon">, apple-touch-icon) and keeps the
   biggest; anyone can pick their own picture instead (Stations →
   Icon…). It is used for the window, the taskbar and alerts; in
   the tray it gets a small dot in the corner, red when live and
   cyan for AutoDJ.
   ============================================================= */
const ICON_DIR = () => path.join(app.getPath('userData'), 'icons');
const hashOf = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
const BUILTIN = path.join(__dirname, 'icons', 'icon.png');

async function fetchSmall(url, max) {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'follow' });
    if (!r.ok) throw new Error(String(r.status));
    if (Number(r.headers.get('content-length') || 0) > max) throw new Error('too big');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) throw new Error('too big');
    return { buf, type: r.headers.get('content-type') || '' };
}

/** The pictures a station's page offers as its icon. */
async function iconCandidates(st) {
    const out = [];
    try {
        const html = (await fetchSmall(st.pageUrl, 3e6)).buf.toString('utf8');
        for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
            const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(m[0]), href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]);
            if (rel && href && /\b(icon|apple-touch-icon)\b/i.test(rel[1])) { try { out.push(new URL(href[1], st.pageUrl).href); } catch { /* bad href */ } }
        }
    } catch { /* page unreachable */ }
    try { out.push(new URL('/favicon.ico', st.pageUrl).href); } catch { /* no */ }
    return [...new Set(out)].filter(u => /^https?:/i.test(u));
}

/** Fetch the station's own icon (the biggest it offers) and keep a copy. */
async function fetchStationIcon(st) {
    let best = null;
    for (const u of await iconCandidates(st)) {
        try {
            const { buf, type } = await fetchSmall(u, 4e6);
            if (type && !/^image\//i.test(type)) continue;
            const img = nativeImage.createFromBuffer(buf);
            if (img.isEmpty()) continue;
            const w = img.getSize().width;
            if (!best || w > best.w) best = { img, w };
        } catch { /* try the next */ }
    }
    if (!best || best.w < 16) return '';
    return keepIcon(best.img, hashOf(st.pageUrl) + '-auto.png');
}

function keepIcon(img, name) {
    fs.mkdirSync(ICON_DIR(), { recursive: true });
    const file = path.join(ICON_DIR(), name);
    const w = img.getSize().width;
    fs.writeFileSync(file, (w > 512 ? img.resize({ width: 512, quality: 'best' }) : img).toPNG());
    return file;
}

const iconPath = (st = station()) => (st && st.icon && fs.existsSync(st.icon) ? st.icon : BUILTIN);

/** Is the platform's raw bitmap blue-green-red-alpha? Asked of a red picture we know. */
let bgra = null;
function isBGRA() {
    if (bgra === null) {
        // The middle of the "live" icon is its red dot (255, 48, 72).
        const b = icon('tray-live').resize({ width: 64, height: 64 }).toBitmap();
        const i = (32 * 64 + 32) * 4;
        bgra = b[i + 2] > b[i];                                                  // red sits third in BGRA
    }
    return bgra;
}

/** The station's icon with a status dot in the corner: red live, cyan AutoDJ. */
const trayCache = new Map();
function stationTrayImage(file, rgb) {
    const key = file + '|' + rgb.join(',') + '|' + (fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0);
    if (trayCache.has(key)) return trayCache.get(key);
    const base = nativeImage.createFromPath(file);
    const at = (size) => {
        const img = base.resize({ width: size, height: size, quality: 'best' });
        const buf = Buffer.from(img.toBitmap()), order = isBGRA() ? [2, 1, 0] : [0, 1, 2];
        const R = size * 0.18, ring = Math.max(1.2, size * 0.06), cx = size - R - ring, cy = size - R - ring, S = 4;
        for (let y = Math.floor(cy - R - ring); y < size; y++) for (let x = Math.floor(cx - R - ring); x < size; x++) {
            let outer = 0, inner = 0;
            for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
                const d = Math.hypot(x + (sx + 0.5) / S - cx, y + (sy + 0.5) / S - cy);
                if (d < R + ring) outer++;
                if (d < R) inner++;
            }
            if (!outer) continue;
            const i = (y * size + x) * 4;
            const paint = (c, a) => {                // solid colour over what is there (premultiplied)
                for (let k = 0; k < 3; k++) buf[i + order[k]] = Math.round(c[k] * a + buf[i + order[k]] * (1 - a));
                buf[i + 3] = Math.round(255 * a + buf[i + 3] * (1 - a));
            };
            paint([26, 7, 51], outer / (S * S));     // a dark ring so the dot shows on any picture
            if (inner) paint(rgb, inner / (S * S));
        }
        return nativeImage.createFromBitmap(buf, { width: size, height: size });
    };
    const out = nativeImage.createFromBuffer(at(32).toPNG(), { scaleFactor: 1 });
    out.addRepresentation({ scaleFactor: 2, buffer: at(64).toPNG() });
    trayCache.set(key, out);
    return out;
}

function applyStationIcon() {
    const img = nativeImage.createFromPath(iconPath());
    for (const w of allWindows()) w.setIcon(img);
    refreshTray();
}

/** Stations added before icons existed, or whose icon went missing: fetch it now. */
async function ensureIcons() {
    for (const st of cfg.stations) {
        if (st.iconFrom === 'custom' && st.icon && fs.existsSync(st.icon)) continue;
        if (st.icon && fs.existsSync(st.icon)) continue;
        const f = await fetchStationIcon(st).catch(() => '');
        if (f) { st.icon = f; st.iconFrom = 'auto'; save(); if (st === station()) applyStationIcon(); }
    }
}

/* =============================================================
   WINDOWS
   ============================================================= */
// Sizes a window starts at; where it goes after that, it remembers.
const SIZES = {
    radio: [480, 250], chat: [360, 520], request: [430, 560], playlist: [360, 440], studio: [360, 400],
    banner: [760, 74], albums: [440, 560], board: [920, 720], tv: [640, 400], links: [380, 520], settings: [470, 620], interface: [940, 760], hall: [900, 640],
    full: [1280, 800]
};
const MIN = { radio: [300, 150], banner: [240, 44], full: [760, 480] };
const WEB_PREFS = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false };
const elWins = new Map();             // element id → BrowserWindow
let reloading = false, tuckedWithRadio = [], radioReady = false;

const prefs = (id) => (cfg.windows[id] = cfg.windows[id] || {});
const isOurs = (url) => typeof url === 'string' && url.startsWith(APP);
const allWindows = () => [win, ...elWins.values()].filter(w => w && !w.isDestroyed());
const oneWin = () => cfg.ui.layout === 'one';
/* One window: each panel is the same page as its own window would be (win.html?w=chat),
   in a frame of the main window. It asks, and is answered, as itself. */
const PANEL_URL = /\/win\.html\?(?:[^#]*&)?w=([a-z]+)/;
const ourFrames = (wc) => { try { return wc.mainFrame.framesInSubtree.filter(f => isOurs(f.url)); } catch { return []; } };
const frameOf = (id) => (win && !win.isDestroyed() ? ourFrames(win.webContents).find(f => f !== win.webContents.mainFrame && PANEL_URL.exec(f.url)?.[1] === id) : null) || null;
const panelOf = (e) => (win && !win.isDestroyed() && e.sender === win.webContents && e.senderFrame && e.senderFrame !== win.webContents.mainFrame ? PANEL_URL.exec(e.senderFrame.url || '')?.[1] || '' : '');
/** Send to a window by its id: its own window, or its panel in the one window. */
function sendTo(id, ch, ...a) {
    const w = elWins.get(id);
    if (w && !w.isDestroyed()) return w.webContents.send(ch, ...a);
    const f = frameOf(id);
    if (f) f.send(ch, ...a);
}
/** …and to every page in a window, panels included. */
const sendAll = (w, ch, ...a) => { for (const f of ourFrames(w.webContents)) f.send(ch, ...a); };

/** Somewhere on a screen that still exists (monitors come and go). */
function placed(id) {
    const p = prefs(id), [dw, dh] = SIZES[id] || [400, 400];
    const b = { width: Math.round(p.w || dw), height: Math.round(p.h || dh) };
    if (typeof p.x === 'number' && typeof p.y === 'number') {
        const area = screen.getDisplayMatching({ x: p.x, y: p.y, width: b.width, height: b.height }).workArea;
        const visible = p.x < area.x + area.width - 60 && p.x + b.width > area.x + 60 && p.y >= area.y - 10 && p.y < area.y + area.height - 30;
        if (visible) { b.x = p.x; b.y = p.y; }
    }
    if (b.x === undefined && id !== 'radio' && win && !win.isDestroyed()) {
        // First time: beside the radio, cascading.
        const r = win.getBounds(), area = screen.getDisplayMatching(r).workArea, n = elWins.size;
        b.x = r.x + r.width + 10 + n * 24; b.y = r.y + n * 24;
        if (b.x + b.width > area.x + area.width) b.x = Math.max(area.x, r.x - b.width - 10 - n * 24);
        if (b.y + b.height > area.y + area.height) b.y = Math.max(area.y, area.y + area.height - b.height);
    }
    return b;
}

function frameOptions(id) {
    const [mw, mh] = MIN[id] || [220, 120];
    return {
        ...placed(id), minWidth: mw, minHeight: mh,
        frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
        // Transparent windows cannot be resized from their edges; the page has its own grip.
        resizable: false, maximizable: false, fullscreenable: id === 'tv', minimizable: id === 'radio',
        skipTaskbar: id !== 'radio', show: false,
        alwaysOnTop: !!(prefs(id).onTop ?? cfg.ui.onTop),
        title: id === 'radio' ? ((station() && station().name) || 'On Air') : id,
        icon: iconPath(), autoHideMenuBar: true,
        webPreferences: WEB_PREFS
    };
}

/** Remember where a window is and how it is set, as it changes. */
function track(id, w) {
    const keep = () => {
        if (w.isDestroyed() || w.isMinimized() || prefs(id).rolled) return;
        const b = w.getBounds(), p = prefs(id);
        Object.assign(p, { x: b.x, y: b.y, w: b.width, h: b.height });
        saveSoon();
    };
    const keepPos = () => {
        if (w.isDestroyed() || w.isMinimized()) return;
        const b = w.getBounds(), p = prefs(id);
        Object.assign(p, { x: b.x, y: b.y });
        saveSoon();
    };
    w.on('moved', keepPos);
    w.on('resized', keep);
    const op = prefs(id).opacity;
    if (op && op < 1) w.setOpacity(op);
}

function createWindow(show = true) {
    if (!station()) return showStations();
    if (win) { if (show) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } return win; }
    const one = oneWin();
    const w = win = new BrowserWindow(one ? fullOptions() : frameOptions('radio'));
    win.removeMenu();
    track(one ? 'full' : 'radio', win);
    if (one && prefs('full').max) win.maximize();
    const wc = win.webContents;
    guard(wc, true);
    keys(wc);
    wc.on('did-create-window', (child, { frameName }) => adopt(child, frameName));
    // A reload starts the windows afresh: the new radio opens the ones that were open.
    wc.on('did-start-navigation', (d) => {
        if (!d.isMainFrame || d.isSameDocument) return;
        reloading = true;
        for (const w of elWins.values()) if (!w.isDestroyed()) w.destroy();
        elWins.clear();
        reloading = false;
    });
    radioReady = false;
    // (the main page starting again; the one window's panels load in frames of their own)
    wc.on('did-start-navigation', (d) => { if (d.isMainFrame && !d.isSameDocument) radioReady = false; });
    wc.on('did-finish-load', () => { radioReady = true; });
    win.loadURL(APP + 'radio.html');
    win.once('ready-to-show', () => { if (show) win.show(); });
    win.on('minimize', () => tuckAll());
    win.on('restore', () => untuckAll());
    win.on('hide', () => tuckAll());
    win.on('show', () => untuckAll());
    win.on('close', (e) => {
        if (quitting) return;
        e.preventDefault();
        win.hide();
        if (!cfg.toldTray) {
            cfg.toldTray = true; save();
            tip('On Air is still running', 'It keeps playing and watches for live shows. Quit from the tray icon.');
        }
    });
    if (one) {
        const max = () => { prefs('full').max = w.isMaximized(); saveSoon(); sendAll(w, 'win', winInfo('radio')); };
        w.on('maximize', max); w.on('unmaximize', max);
    }
    win.on('closed', () => { if (win === w) { win = null; pageState = null; refreshTray(); } });
    return win;
}

/** The one window: an ordinary window (its edges resize it), laid out like the station's site. */
function fullOptions() {
    const [mw, mh] = MIN.full;
    return {
        ...placed('full'), minWidth: mw, minHeight: mh,
        frame: false, backgroundColor: '#160530', resizable: true, maximizable: true, fullscreenable: true, minimizable: true,
        show: false, alwaysOnTop: !!(prefs('radio').onTop ?? cfg.ui.onTop),
        title: (station() && station().name) || 'On Air', icon: iconPath(), autoHideMenuBar: true,
        webPreferences: { ...WEB_PREFS, nodeIntegrationInSubFrames: true }
    };
}

/** Switching between the radio with its windows and the one window: the main window starts again. */
function relayout() {
    const old = win;
    if (!old || old.isDestroyed()) return;
    const wasPlaying = !!(pageState && pageState.playing), shown = old.isVisible();
    reloading = true;
    for (const x of elWins.values()) if (!x.isDestroyed()) x.destroy();
    elWins.clear();
    reloading = false;
    if (boardView) { try { boardView.webContents.close(); } catch { /* gone */ } boardView = null; }
    win = null;
    old.destroy();
    const nw = createWindow(shown);
    if (nw && wasPlaying) nw.webContents.once('did-finish-load', () => setTimeout(() => { if (win === nw) nw.webContents.send('play'); }, 1200));
}

/** The radio opened one of its windows (window.open, so it shares the radio's process). */
function adopt(child, frameName) {
    const id = /^el-([a-z]+)$/.exec(frameName || '')?.[1];
    if (!id || !SIZES[id]) { child.destroy(); return; }
    const old = elWins.get(id);
    if (old && !old.isDestroyed() && old !== child) old.destroy();
    elWins.set(id, child);
    if (process.env.ONAIR_SMOKE) console.log('[adopt]', id, JSON.stringify(child.getBounds()));
    child.removeMenu();
    track(id, child);
    guard(child.webContents, false);
    keys(child.webContents);
    const p = prefs(id);
    p.open = true; saveSoon();
    if (p.rolled) roll(child, id, true);
    child.once('ready-to-show', () => {
        if (p.hidden || (win && (!win.isVisible() || win.isMinimized()) && cfg.ui.hideWithRadio)) {
            if (!p.hidden) tuckedWithRadio.push(id);
        } else child.showInactive();
        elementState();
    });
    child.on('show', elementState);
    child.on('hide', elementState);
    child.on('system-context-menu', (e) => { e.preventDefault(); windowMenu(child, id); });
    child.on('closed', () => {
        if (elWins.get(id) === child) elWins.delete(id);
        if (!quitting && !reloading) { p.open = false; p.hidden = false; saveSoon(); }
        elementState();
    });
}

/** Tell the radio which windows are open, and which are tucked away. */
function elementState() {
    if (!win || win.isDestroyed()) return;
    const s = {};
    for (const [id, w] of elWins) if (!w.isDestroyed()) s[id] = w.isVisible() ? 'open' : 'tucked';
    win.webContents.send('elements', s);
}

/** The radio is minimised or hidden: take its windows with it, and bring them back after. */
function tuckAll() {
    if (!cfg.ui.hideWithRadio) return;
    for (const [id, w] of elWins) if (!w.isDestroyed() && w.isVisible()) { w.hide(); if (!tuckedWithRadio.includes(id)) tuckedWithRadio.push(id); }
}
function untuckAll() {
    const ids = tuckedWithRadio; tuckedWithRadio = [];
    for (const id of ids) { const w = elWins.get(id); if (w && !w.isDestroyed() && !prefs(id).hidden) w.showInactive(); }
}

/* The radio comes forward from behind other programs: its open windows come with it
   (without taking the focus from it). Moving between On Air's own windows changes nothing. */
let ourFocus = false;
app.on('browser-window-focus', (e, w) => {
    const wasOurs = ourFocus;
    ourFocus = true;
    if (w !== win || wasOurs) return;
    for (const [, x] of elWins) if (!x.isDestroyed() && x.isVisible() && !x.isMinimized()) x.moveTop();
    win.moveTop();
});
app.on('browser-window-blur', () => {
    setTimeout(() => { const f = BrowserWindow.getFocusedWindow(); ourFocus = !!f && allWindows().includes(f); }, 0);
});

const idOf = (wc) => {
    if (win && !win.isDestroyed() && wc === win.webContents) return 'radio';
    for (const [id, w] of elWins) if (!w.isDestroyed() && w.webContents === wc) return id;
    return '';
};
/** Who is asking: a window, or a panel of the one window. */
const who = (e) => panelOf(e) || idOf(e.sender);
const winOf = (id) => (id === 'radio' ? win : elWins.get(id));

/** Show or tuck a window (it keeps its place, and whatever it was doing). */
function setVisible(id, show) {
    const w = winOf(id);
    if (!w || w.isDestroyed()) return;
    if (id !== 'radio') { prefs(id).hidden = !show; saveSoon(); }
    if (show) { w.show(); w.focus(); } else w.hide();
}

function setWinPref(id, patch) {
    const w = winOf(id), p = prefs(id);
    if ('onTop' in patch) { p.onTop = !!patch.onTop; if (w) w.setAlwaysOnTop(p.onTop, 'floating'); }
    if ('opacity' in patch) { p.opacity = Math.max(0.3, Math.min(1, Number(patch.opacity) || 1)); if (w) w.setOpacity(p.opacity); }
    if ('skin' in patch) p.skin = patch.skin == null ? undefined : String(patch.skin);
    if ('font' in patch) p.font = patch.font == null ? undefined : String(patch.font);
    if ('rolled' in patch && w) { p.rolled = !!patch.rolled; roll(w, id, p.rolled); }
    saveSoon();
    if (w && !w.isDestroyed()) { if (id === 'radio') sendAll(w, 'win', winInfo(id)); else w.webContents.send('win', winInfo(id)); }
}
/** Rolled up: just the title bar (EverQuest-style); unrolled: back to its size. */
const BAR_H = 32;
function roll(w, id, up) {
    const b = w.getBounds(), [mw, mh] = MIN[id] || [220, 120];
    if (up) { w.setMinimumSize(mw, BAR_H); w.setBounds({ x: b.x, y: b.y, width: b.width, height: BAR_H }); }
    else { w.setBounds({ x: b.x, y: b.y, width: b.width, height: Math.round(prefs(id).h || (SIZES[id] || [0, 400])[1]) }); w.setMinimumSize(mw, mh); }
}
/** The video, full screen and back to the window exactly as it was. */
const wasBounds = new WeakMap();
function fullScreen(w, panel) {
    const tell = (on) => { if (panel) { sendTo(panel, 'fullscreen', on); w.webContents.send('panel-full', on ? panel : ''); } else w.webContents.send('fullscreen', on); };
    if (wasBounds.has(w)) {
        const b = wasBounds.get(w);
        wasBounds.delete(w);
        w.setFullScreen(false);
        if (!panel) w.setBounds(b);
        tell(false);
    } else {
        wasBounds.set(w, w.getBounds());
        w.setFullScreen(true);
        tell(true);
    }
}
/* =============================================================
   THE BOARD — a real browser view in the board window, not a frame
   in the app's page: to the site it is an ordinary visit, so its
   captcha, cookies and posting work. Its own cookie jar
   (persist:board), no access to the app, other sites open in the
   browser.
   ============================================================= */
let boardView = null, boardHome = '', boardTint = '';
const boardSite = (u) => { try { const h = new URL(u).hostname; const home = new URL(boardHome).hostname.split('.').slice(-2).join('.'); return h === home || h.endsWith('.' + home); } catch { return false; } };
/** 4chan sends links to other sites through its "Redirecting you…" page: skip that, straight to where it goes. */
const deref = (u) => {
    try { const x = new URL(u); if (/(^|\.)4chan(nel)?\.org$/i.test(x.hostname) && x.pathname === '/derefer' && x.searchParams.get('url')) return x.searchParams.get('url'); } catch { /* not a URL */ }
    return u;
};
let boardNext = '';                    // a thread the Interface asked for, before the board window was open
function openBoard(w, url) {
    if (!/^https:\/\//i.test(url)) return;
    boardHome = url;
    if (boardView && !boardView.webContents.isDestroyed()) return;
    if (boardNext && boardSite(boardNext)) { url = boardNext; }
    boardNext = '';
    // Its preload runs only the listener's own userscripts (Settings → Scripts in the board window).
    boardView = new WebContentsView({ webPreferences: { partition: 'persist:board', sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true, preload: path.join(__dirname, 'board-preload.js') } });
    const wc = boardView.webContents, ses = wc.session;
    if (!ses.__onair) {
        ses.__onair = true;
        ses.setPermissionRequestHandler((x, perm, cb) => cb(perm === 'clipboard-sanitized-write' || perm === 'fullscreen'));
        // Downloads from the board's own pages ask where to save, starting where pictures went last.
        ses.on('will-download', (e, item) => {
            const dir = cfg.ui.imageDir && fs.existsSync(cfg.ui.imageDir) ? cfg.ui.imageDir : app.getPath('downloads');
            item.setSaveDialogOptions({ title: 'Save', defaultPath: path.join(dir, safeName(item.getFilename()).replace(/^Album$/, 'file')) });
        });
        // Your replies, so the Interface can give XP for the repeats they check (read from 4chan afterwards).
        ses.webRequest.onBeforeRequest({ urls: ['https://sys.4chan.org/*/post'] }, (d, cb) => { cb({}); if (d.method === 'POST') boardPostSent(d); });
    }
    if (process.env.ONAIR_SMOKE) wc.setAudioMuted(true);
    // 4chan's own pages (and its captcha) stay here; links elsewhere go to the browser.
    wc.setWindowOpenHandler(({ url: u }) => {
        u = deref(u);
        if (boardSite(u)) { wc.loadURL(u); return { action: 'deny' }; }
        if (/^https?:/i.test(u)) shell.openExternal(u);
        return { action: 'deny' };
    });
    wc.on('will-navigate', (e, u) => {
        const to = deref(u);
        if (to !== u) { e.preventDefault(); if (boardSite(to)) wc.loadURL(to); else if (/^https?:/i.test(to)) shell.openExternal(to); return; }
        if (!boardSite(u)) { e.preventDefault(); if (/^https?:/i.test(u)) shell.openExternal(u); }
    });
    wc.on('dom-ready', () => applyBoardTint());
    w.contentView.addChildView(boardView);
    boardView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    wc.on('context-menu', (e, p) => boardMenu(w, wc, p));
    wc.loadURL(url);
    w.on('closed', () => { if (boardView) { try { boardView.webContents.close(); } catch { /* gone */ } boardView = null; } });
}
/** Right-click in the board: pictures (save, copy, search), links, and text editing. */
async function boardMenu(w, wc, p) {
    const items = [];
    const say = (m) => sendTo('board', 'toast', m);
    const save = (u, name) => saveImage(w, u, name, (x, o) => wc.session.fetch(x, o)).then((f) => f && say('Saved ' + f + '.'), (err) => say(err.message));
    if (p.mediaType === 'image' || p.mediaType === 'video') {
        // A 4chan thumbnail links to the full picture; save that, under the name it was posted with.
        const full = /^https:\/\/i\.4cdn\.org\/\w+\/\d+\.\w+$/.test(p.linkURL || '') ? p.linkURL : p.srcURL;
        let name = '';
        try { name = await wc.executeJavaScript(`(() => { const el = document.elementFromPoint(${Number(p.x) || 0}, ${Number(p.y) || 0}); const f = el && el.closest('.file, .fileThumb') && el.closest('.post, .postContainer'); const a = f && f.querySelector('.fileText a'); return a ? (a.title || a.textContent || '') : ''; })()`, true); } catch { /* no name: the file's own */ }
        if (/^https:\/\//.test(full || '')) {
            const pic = p.mediaType === 'image' ? 'picture' : 'video';
            items.push({ label: 'Save ' + pic + ' as…', click: () => save(full, name) },
                { label: 'Copy ' + pic + ' address', click: () => clipboard.writeText(full) });
            if (p.mediaType === 'image') items.push({ label: 'Copy picture', click: () => wc.copyImageAt(p.x, p.y) });
            items.push({ label: 'Open in your browser', click: () => shell.openExternal(full) });
            if (p.mediaType === 'image') items.push({ label: 'Search for this picture', submenu: [
                ['Google Lens', 'https://lens.google.com/uploadbyurl?url='], ['Yandex', 'https://yandex.com/images/search?rpt=imageview&url='],
                ['SauceNAO', 'https://saucenao.com/search.php?url='], ['TinEye', 'https://tineye.com/search?url='],
                ['IQDB', 'https://iqdb.org/?url='], ['trace.moe (anime scenes)', 'https://trace.moe/?url=']
            ].map(([label, base]) => ({ label, click: () => shell.openExternal(base + encodeURIComponent(full)) })) });
            items.push({ type: 'separator' });
        }
    }
    if (p.linkURL && !(p.mediaType === 'image' && /4cdn\.org/.test(p.linkURL))) {
        const link = deref(p.linkURL);
        if (/^https?:/i.test(link)) items.push({ label: 'Open link in your browser', click: () => shell.openExternal(link) });
        items.push({ label: 'Copy link address', click: () => clipboard.writeText(link) }, { type: 'separator' });
    }
    if (p.isEditable) {
        for (const sug of (p.dictionarySuggestions || []).slice(0, 5)) items.push({ label: sug, click: () => wc.replaceMisspelling(sug) });
        if (p.misspelledWord) items.push({ label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: 'separator' });
        items.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy }, { role: 'paste', enabled: p.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' });
    } else if (p.selectionText) items.push({ role: 'copy' });
    if (!items.length || items[items.length - 1].type === 'separator') {
        if (items.length) items.pop();
        if (!items.length) items.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() }, { label: 'Reload', click: () => wc.reload() });
    }
    Menu.buildFromTemplate(items).popup({ window: w });
}

/* ---------- your replies on 4chan, for the Interface's checks ----------
   The board window's reply form posts to sys.4chan.org. For every reply (its
   own number may be a get; it may check someone's repeats), find its number
   in the thread a little later (4chan's read-only data) and hand it to the Interface, which asks the
   station: the station reads the reply from 4chan itself before giving XP. */
const boardPosted = [];               // { board, thread, no, at }
function formField(text, name) {
    const m = new RegExp('name="' + name + '"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--').exec(text);
    return m ? m[1] : '';
}
function chanText(html) {
    return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
        .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
}
const quoteSet = (t) => [...new Set([...String(t).matchAll(/>>(\d+)/g)].map(m => m[1]))].sort().join(',');
function boardPostSent(d) {
    try {
        const board = (/^https:\/\/sys\.4chan\.org\/(\w+)\/post/.exec(d.url) || [])[1];
        const body = Buffer.concat((d.uploadData || []).filter(x => x.bytes).map(x => x.bytes)).toString('utf8');
        const thread = Number(formField(body, 'resto')), com = formField(body, 'com').replace(/\r/g, '');
        if (!board || !(thread > 0) || !com.trim()) return;
        const sent = Date.now(), want = com.replace(/\s+/g, ''), quotes = quoteSet(com);
        let tries = 0;
        const look = async () => {
            tries++;
            try {
                const r = await net.fetch('https://a.4cdn.org/' + board + '/thread/' + thread + '.json?t=' + Date.now(), { signal: AbortSignal.timeout(10000) });
                const posts = r.ok ? ((await r.json()).posts || []).filter(p => p.time * 1000 >= sent - 120e3) : [];
                // The same words; or, when the board's filters changed them, the one recent post quoting the same posts.
                let mine = posts.filter(p => chanText(p.com).replace(/\s+/g, '') === want);
                if (mine.length !== 1) { const q = posts.filter(p => quoteSet(chanText(p.com)) === quotes); mine = q.length === 1 ? q : []; }
                if (mine.length === 1) {
                    boardPosted.push({ board, thread, no: mine[0].no, at: Date.now() });
                    if (boardPosted.length > 20) boardPosted.shift();
                    sendTo('interface', 'board-posted');
                    return;
                }
            } catch { /* try again */ }
            if (tries < 4) setTimeout(look, tries * 15e3);
        };
        setTimeout(look, 12e3);
    } catch { /* not a reply we can read */ }
}

let tintKey = null;
async function applyBoardTint() {
    if (!boardView) return;
    const wc = boardView.webContents;
    if (tintKey) { await wc.removeInsertedCSS(tintKey).catch(() => {}); tintKey = null; }
    if (boardTint) tintKey = await wc.insertCSS('html { filter: ' + boardTint.replace(/[;{}<>]/g, '') + ' !important; }').catch(() => null);
}
ipcMain.on('board', (e, cmd, arg) => {
    if (!(e.senderFrame && isOurs(e.senderFrame.url)) || who(e) !== 'board') return;
    const w = oneWin() ? win : winOf('board');
    if (cmd === 'open') return openBoard(w, String(arg || ''));
    if (!boardView) return;
    const wc = boardView.webContents;
    if (cmd === 'bounds') { boardView.setVisible(!!arg); if (arg) boardView.setBounds(arg); }
    else if (cmd === 'back') { if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); }
    else if (cmd === 'home') wc.loadURL(boardHome);
    else if (cmd === 'reload') wc.reload();
    else if (cmd === 'out') shell.openExternal(wc.getURL() || boardHome);
    else if (cmd === 'go') { const u = String(arg || '').trim(); if (/^https:\/\//i.test(u) && boardSite(u)) wc.loadURL(u); }
    else if (cmd === 'tint') { boardTint = String(arg || ''); applyBoardTint(); }
});

// The listener's userscripts for the board (Tampermonkey-style).
app.whenReady().then(() => {
    require('./userscripts').setup({ dir: path.join(app.getPath('userData'), 'userscripts'), getView: () => boardView, boardSite })
        .handlers((e) => !!(e.senderFrame && isOurs(e.senderFrame.url)) && who(e) === 'board');
});

const winInfo = (id) => ({ id, ...prefs(id), onTop: !!(prefs(id).onTop ?? cfg.ui.onTop), ...(id === 'radio' && oneWin() ? { one: true, max: !!(win && !win.isDestroyed() && win.isMaximized()) } : {}) });

/** The window menu: right-click a title bar, or its ≡ button. */
const SKIN_NAMES = () => { try { return JSON.parse(fs.readFileSync(path.join(UI_DIR, 'look-data.js'), 'utf8').replace(/^[\s\S]*?window\.LOOKS = /, '').replace(/;\s*$/, '')).skins; } catch { return []; } };
function windowMenu(w, id) {
    const p = prefs(id), info = winInfo(id);
    const pct = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
    const fonts = [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large'], ['huge', 'Larger']];
    const items = [
        { label: 'Always on top', type: 'checkbox', checked: info.onTop, click: (i) => setWinPref(id, { onTop: i.checked }) },
        { label: 'See-through', submenu: pct.map(v => ({ label: Math.round(v * 100) + '%', type: 'radio', checked: Math.abs((p.opacity || 1) - v) < 0.01, click: () => setWinPref(id, { opacity: v }) })) },
        { label: 'Text size', submenu: [{ label: 'Same as the app', type: 'radio', checked: !p.font, click: () => setWinPref(id, { font: null }) }, { type: 'separator' },
            ...fonts.map(([v, l]) => ({ label: l, type: 'radio', checked: p.font === v, click: () => setWinPref(id, { font: v }) }))] },
        { label: 'Look', submenu: [{ label: 'Same as the app', type: 'radio', checked: p.skin === undefined, click: () => setWinPref(id, { skin: null }) }, { type: 'separator' },
            ...SKIN_NAMES().map(s => ({ label: s.name, type: 'radio', checked: p.skin === s.id, click: () => setWinPref(id, { skin: s.id }) })),
            { label: 'HUD (see-through, text only)', type: 'radio', checked: p.skin === 'hud', click: () => setWinPref(id, { skin: 'hud' }) }] },
        { type: 'separator' }
    ];
    if (id === 'radio') {
        items.push(
            { label: 'Settings…', click: () => win && win.webContents.send('open-element', 'settings') },
            { label: 'Stations…', click: showStations },
            { label: 'Reload', click: reloadPage },
            { type: 'separator' },
            { label: 'Minimise', click: () => win.minimize() },
            { label: 'Close to the tray', click: () => win.close() },
            { label: 'Quit On Air', click: () => { quitting = true; app.quit(); } });
    } else {
        items.push(
            { label: p.rolled ? 'Unroll' : 'Roll up to the title bar', click: () => setWinPref(id, { rolled: !p.rolled }) },
            { label: 'Tuck into the radio', click: () => setVisible(id, false) },
            { label: 'Close', click: () => w.close() });
    }
    Menu.buildFromTemplate(items).popup({ window: w });
}

/** The add-a-station screen: its own small, ordinary window. */
function showStations() {
    if (stationsWin && !stationsWin.isDestroyed()) { stationsWin.show(); stationsWin.focus(); return stationsWin; }
    stationsWin = new BrowserWindow({
        width: 560, height: 680, minWidth: 380, minHeight: 480, show: false, title: 'On Air — Stations',
        backgroundColor: '#1a0733', icon: iconPath(), autoHideMenuBar: true, webPreferences: WEB_PREFS
    });
    stationsWin.removeMenu();
    guard(stationsWin.webContents, false);
    stationsWin.loadURL(APP + 'add.html');
    stationsWin.once('ready-to-show', () => stationsWin.show());
    stationsWin.on('closed', () => { stationsWin = null; });
    return stationsWin;
}

/** F5 / Ctrl+R reload (the windows have no menu to offer it); F12 nothing. */
function keys(wc) {
    wc.on('before-input-event', (e, input) => {
        if (input.type !== 'keyDown') return;
        if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) { e.preventDefault(); reloadPage(); }
    });
}

/** Links to other sites go to the browser; the radio may open the app's own windows. */
function guard(wc, isRadio) {
    const outside = (url) => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };
    wc.setWindowOpenHandler(({ url, frameName }) => {
        const id = /^el-([a-z]+)$/.exec(frameName || '')?.[1];
        if (isRadio && id && SIZES[id] && url.startsWith(APP + 'win.html')) {
            if (cfg.ui.off.includes(id) && id !== 'settings') return { action: 'deny' };
            return { action: 'allow', overrideBrowserWindowOptions: frameOptions(id) };
        }
        outside(url);
        return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
        // The app's own pages (a window the radio opens starts out blank, then loads its page).
        const cur = wc.getURL();
        if (isOurs(url) && (isOurs(cur) || !cur || cur === 'about:blank')) return;
        e.preventDefault();
        outside(url);
    });
    textMenu(wc);
}

/** Right-click text: copy it, or cut and paste in a field (pictures have their own menu, from the page). */
function textMenu(wc) {
    wc.on('context-menu', (e, p) => {
        const f = p.editFlags || {}, items = [];
        if (p.isEditable) {
            items.push({ role: 'cut', label: 'Cut', enabled: !!f.canCut }, { role: 'copy', label: 'Copy', enabled: !!f.canCopy },
                { role: 'paste', label: 'Paste', enabled: !!f.canPaste }, { type: 'separator' }, { role: 'selectAll', label: 'Select all' });
        } else if (p.selectionText && p.selectionText.trim()) {
            items.push({ role: 'copy', label: 'Copy' });
        }
        if (!items.length) return;
        const w = BrowserWindow.fromWebContents(wc);
        Menu.buildFromTemplate(items).popup(w ? { window: w } : {});
    });
}

/** Lift a window above the others for a moment (Windows won't let a background start take the focus). */
function toFront(w) {
    if (!w || w.isDestroyed()) return;
    const was = w.isAlwaysOnTop();
    if (w.isMinimized()) w.restore();
    w.setAlwaysOnTop(true);
    w.show(); w.focus(); w.moveTop();
    if (process.platform === 'win32') w.flashFrame(true);
    setTimeout(() => { if (!w.isDestroyed()) { w.setAlwaysOnTop(was); w.flashFrame(false); } }, 2500);
}

function reloadPage() {
    if (!win) return createWindow(true);
    win.webContents.reloadIgnoringCache();
}

/* ---------- the app's pages, and what they may load ---------- */
function serveApp() {
    protocol.handle('onair', async (req) => {
        const u = new URL(req.url), p = decodeURIComponent(u.pathname);
        const dir = p.startsWith('/icons/') ? path.join(__dirname, 'icons') : UI_DIR;
        const file = path.normalize(path.join(dir, p.replace(/^\/icons\//, '/')));
        if (u.host !== 'app' || !file.startsWith(dir + path.sep)) return new Response('Not found', { status: 404 });
        return net.fetch(pathToFileURL(file).href);
    });
}

function webRules() {
    const s = session.defaultSession;
    const fresh = new Set(['mainFrame', 'subFrame', 'script', 'stylesheet', 'xhr']);
    const fromApp = (d) => { try { return !!(d.webContents && isOurs(d.webContents.getURL())); } catch { return false; } };
    // Only the requests these rules are for: every request through here waits on this
    // process, and a video's stream of chunks must never queue behind it (the TV buffered).
    const o = stationOrigin();
    const urls = ['https://www.youtube.com/embed/*', 'https://www.youtube-nocookie.com/embed/*'].concat(o ? [o + '/*'] : []);
    s.webRequest.onBeforeSendHeaders({ urls }, (d, cb) => {
        const h = d.requestHeaders;
        // The station's own files: always the current copy (static hosts send no caching rules).
        if (fresh.has(d.resourceType) && stationOrigin() && originOf(d.url) === stationOrigin()) h['Cache-Control'] = 'max-age=0';
        // YouTube's player will not start without a page to say it is on; the station's page is where it lives.
        if (d.resourceType === 'subFrame' && /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(d.url) && fromApp(d) && station()) {
            h.Referer = station().pageUrl;
        }
        cb({ requestHeaders: h });
    });
}

function permissions() {
    const s = session.defaultSession;
    s.setPermissionRequestHandler((wc, perm, cb, d) => {
        const ours = isOurs(d.requestingUrl);
        // The microphone, for calling in and voicemail: the app's own pages, audio only.
        if (perm === 'media') return cb(ours && (d.mediaTypes || ['audio']).every(t => t === 'audio'));
        if (perm === 'clipboard-sanitized-write') return cb(true);
        if (perm === 'fullscreen') return cb(true);  // the station's video, fullscreen
        cb(false);                                   // notifications come from the app itself
    });
    s.setPermissionCheckHandler((wc, perm, origin) =>
        perm === 'media' ? isOurs(origin + '/') : perm === 'clipboard-sanitized-write');
}

/* ---------- the Studio, when the station engine runs on this PC ----------
   The engine's Studio answers only here (127.0.0.1, by its own name), so being at
   this PC is the key: elsewhere there is no Studio to find, and nothing shows.
   The engine starts On Air with --studio=<its address>; otherwise On Air looks
   for one at the usual address now and then. Test runs look for none unless
   ONAIR_STUDIO names a scratch engine. */
const STUDIO_PART = 'persist:studio';
const localUrl = (u) => { try { const x = new URL(u); return x.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(x.hostname) ? x.origin : ''; } catch { return ''; } };
const studioArg = (argv) => { const a = (argv || []).find(x => String(x).startsWith('--studio=')); return a ? localUrl(a.slice(9)) : ''; };
let studioUrl = process.env.ONAIR_SMOKE ? localUrl(process.env.ONAIR_STUDIO || '') : (localUrl(cfg.studioUrl) || 'http://127.0.0.1:7700');
let studioHere = false, studioWin = null, quitAfterStudio = false;
const studioOpen = () => !!(studioWin && !studioWin.isDestroyed());

async function studioGet(p) {
    const r = await net.fetch(studioUrl + p, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}
async function studioCheck() {
    let ok = false;
    if (studioUrl) try { ok = (await studioGet('/api/me')).role === 'studio'; } catch { /* no engine here */ }
    if (ok !== studioHere) { studioHere = ok; refreshTray(); }
    return ok;
}
/** At start, or when the engine asks: open the Studio, unless a show is on in another Studio window. */
async function studioStart(argv) {
    const u = studioArg(argv), ssh = sshArg(argv);
    if (u && !process.env.ONAIR_SMOKE) { studioUrl = u; if (cfg.studioUrl !== u) { cfg.studioUrl = u; save(); } }
    if (ssh) { if (cfg.studioSsh !== ssh) { cfg.studioSsh = ssh; save(); refreshTray(); } return studioAnywhere(); }      // the station on a server: open it now
    if (studioOpen()) return toFront(studioWin);
    if (!(await studioCheck())) return;
    const live = await studioGet('/api/status').then(s => !!s.live).catch(() => false);
    if (live) return tip('The Studio is on air in another window', 'Open it here from the tray (Studio) when the show is over, or now if you mean to move it.');
    openStudio();
}

function studioSession() {
    const s = session.fromPartition(STUDIO_PART);
    const mine = (u) => !!studioUrl && originOf(u) === studioUrl;
    const ALLOW = ['media', 'speaker-selection', 'screen-wake-lock', 'wake-lock', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen'];
    // The mixer: microphones and lines in, outputs to choose, the screen kept awake. Audio only.
    s.setPermissionRequestHandler((wc, perm, cb, d) => cb(mine(d.requestingUrl || wc.getURL()) && ALLOW.includes(perm) && (perm !== 'media' || (d.mediaTypes || ['audio']).every(t => t === 'audio'))));
    s.setPermissionCheckHandler((wc, perm, origin) => mine(origin) && ALLOW.includes(perm));
}

function openStudio() {
    if (studioOpen()) return toFront(studioWin);
    if (!studioUrl) return;
    const b = cfg.studioBounds || {};
    const w = studioWin = new BrowserWindow({
        width: b.width || 1400, height: b.height || 900, x: b.x, y: b.y, minWidth: 720, minHeight: 480,
        title: 'Studio', icon: iconPath(), backgroundColor: '#14141a', show: false,
        // Never slowed down behind other windows or minimised: the show runs in here.
        webPreferences: { partition: STUDIO_PART, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false }
    });
    w.removeMenu();
    if (b.max) w.maximize();
    w.once('ready-to-show', () => toFront(w));
    const wc = w.webContents;
    const outside = (url) => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };
    wc.setWindowOpenHandler(({ url }) => { outside(url); return { action: 'deny' }; });
    wc.on('will-navigate', (e, url) => { if (originOf(url) !== studioUrl) { e.preventDefault(); outside(url); } });
    wc.on('will-attach-webview', (e) => e.preventDefault());
    wc.on('before-input-event', (e, input) => {
        if (input.type === 'keyDown' && (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r'))) { e.preventDefault(); wc.reload(); }
    });
    textMenu(wc);
    // The Studio holds a show on air: closing it (or quitting On Air) asks first.
    wc.on('will-prevent-unload', (e) => {
        const r = dialog.showMessageBoxSync(w, {
            type: 'warning', title: 'Studio', message: 'You are on air',
            detail: 'Closing the Studio ends the show and hands the station back to AutoDJ.',
            buttons: ['Keep the Studio open', 'Close it anyway'], defaultId: 0, cancelId: 0, noLink: true
        });
        if (r === 1) e.preventDefault(); else if (quitAfterStudio) { quitAfterStudio = false; quitting = false; }
    });
    const keep = () => { if (!w.isDestroyed()) { cfg.studioBounds = { ...w.getNormalBounds(), max: w.isMaximized() }; saveSoon(); } };
    w.on('resize', keep); w.on('move', keep); w.on('maximize', keep); w.on('unmaximize', keep);
    w.on('closed', () => {
        studioWin = null; refreshTray();
        if (fwd || fwdWanted) stopForward();             // a station on a server: let go of it (it keeps running there)
        if (quitAfterStudio) { quitAfterStudio = false; app.quit(); }
    });
    // No "Open the studio" click needed here: the app has already said yes to the microphone.
    wc.on('did-finish-load', () => wc.executeJavaScript("{ const b = document.getElementById('startBtn'); if (b && !b.disabled) b.click(); }").catch(() => {}));
    wc.loadURL(studioUrl + '/');
    refreshTray();
}

/* ---------- the Studio of a station on a server ----------
   Its engine answers only on the server itself, so On Air gets there the way you would
   by hand: an SSH port forward (Windows' own ssh, with your key from ssh-agent), hidden,
   for as long as the Studio is open. A station on this PC comes first: then nothing's
   forwarded. Set the address (you@server) in Settings → Station, or start On Air with
   --studio-ssh=you@server. */
const cleanSsh = (a) => { a = String(a || '').trim(); return /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(a) ? a : ''; };
let fwd = null, fwdWanted = false, fwdBusy = false;     // the ssh process; whether to keep it (the Studio is open on it)
const sshArg = (argv) => { const a = (argv || []).find(x => String(x).startsWith('--studio-ssh=')); return a ? cleanSsh(a.slice(13)) : ''; };
const studioPort = () => Number(new URL(studioUrl || 'http://127.0.0.1:7700').port) || 7700;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function sshCmd() {
    // (Test runs can stand something else in for ssh: ONAIR_SSH, a program, and ONAIR_SSH_ARG, its first argument.)
    if (process.env.ONAIR_SMOKE && process.env.ONAIR_SSH) return [process.env.ONAIR_SSH, process.env.ONAIR_SSH_ARG ? [process.env.ONAIR_SSH_ARG] : []];
    const w = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe');
    return [process.platform === 'win32' && fs.existsSync(w) ? w : 'ssh', []];
}
const portFree = (port) => new Promise((ok) => {
    const s = require('node:net').createServer();
    s.once('error', () => ok(false));
    s.listen(port, '127.0.0.1', () => s.close(() => ok(true)));
});
/** What went wrong, from what ssh said, in plain words. */
function sshWhy(err) {
    const e = String(err || '');
    if (/Permission denied/i.test(e)) return 'Your SSH key isn’t unlocked. Open a terminal, run ssh-add, type your passphrase there, then try the Studio again.';
    if (/ENOENT|not recognized|not found/i.test(e)) return 'Windows’ SSH client isn’t installed: Settings → Apps → Optional features → OpenSSH Client.';
    if (/Host key verification failed|IDENTIFICATION HAS CHANGED/i.test(e)) return 'The server’s key isn’t the one this PC knows. Check it in a terminal (ssh ' + cfg.studioSsh + ') before connecting.';
    if (/Could not resolve/i.test(e)) return 'Couldn’t find ' + cfg.studioSsh.split('@')[1] + '. Check the address in Settings → Station.';
    if (/timed out|refused|No route|unreachable/i.test(e)) return 'The server didn’t answer. Is it on, and is this PC online?';
    if (/forward|listen/i.test(e)) return 'Another program on this PC is using the Studio’s port.';
    return (e.trim().split(/\r?\n/).pop() || 'ssh stopped.').slice(0, 200);
}
function startForward() {
    const port = studioPort();
    const [exe, pre] = sshCmd();
    const p = spawn(exe, [...pre, '-N', '-T', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
        '-o', 'StrictHostKeyChecking=accept-new', '-L', `${port}:127.0.0.1:${port}`, '-L', `${port + 1}:127.0.0.1:${port + 1}`, cfg.studioSsh],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    p.err = ''; p.done = false;
    p.stderr.on('data', (d) => { p.err = (p.err + d).slice(-2000); });
    p.on('error', (e) => { p.err += ' ' + e.message; p.done = true; if (fwd === p) fwd = null; });
    p.on('exit', () => {
        p.done = true;
        if (fwd !== p) return;
        fwd = null;
        // Dropped while the Studio's open on it (the network blinked): connect again.
        if (fwdWanted && studioOpen()) { console.log('[studio] the server connection dropped:', p.err.trim().slice(-200)); setTimeout(() => { if (fwdWanted && studioOpen() && !fwd) startForward(); }, 3000); }
        else studioCheck();
    });
    fwd = p;
    return p;
}
function stopForward() {
    fwdWanted = false;
    const p = fwd;
    fwd = null;
    if (p && !p.done) try { p.kill(); } catch { /* gone */ }
    setTimeout(() => studioCheck(), 500);
}
/** The tray's Studio: this PC's station if it runs one, otherwise the one on the server. */
async function studioAnywhere() {
    if (studioOpen()) return toFront(studioWin);
    if (await studioCheck()) return openStudio();
    if (!cfg.studioSsh || fwdBusy) return;
    fwdBusy = true;
    try {
        const port = studioPort();
        if (!fwd) {
            if (!(await portFree(port)) || !(await portFree(port + 1))) return tip('Studio', `Another program on this PC is using port ${port} or ${port + 1}, and it isn’t a station. Close it and try again.`);
            startForward();
        }
        const p = fwd;
        for (let i = 0; i < 40; i++) {
            await wait(500);
            if (p.done && process.env.ONAIR_SMOKE) console.log('[studio] ssh stopped:', sshWhy(p.err));
            if (p.done) return tip('Couldn’t reach the station’s server', sshWhy(p.err));
            if (await studioCheck()) { fwdWanted = true; if (process.env.ONAIR_SMOKE) console.log('[studio] through', cfg.studioSsh); return openStudio(); }
        }
        stopForward();
        tip('Couldn’t reach the station’s server', 'It connected, but the station there didn’t answer. Is the engine running on the server?');
    } finally { fwdBusy = false; }
}

/* ---------- the tray ---------- */
function liveNow() { return !!((pageState && pageState.live) || (watchState && watchState.live)); }

function refreshTray() {
    if (!tray) return;
    const st = station(), live = liveNow();
    const name = (watchState && watchState.name) || (st && st.name) || 'On Air';
    const dj = (pageState && pageState.dj) || (watchState && watchState.dj) || '';
    const who = live ? 'Live' + (dj ? ' with ' + dj : '') : 'AutoDJ';
    const song = pageState && pageState.now ? [pageState.now, pageState.sub].filter(Boolean).join(' — ') : (watchState && watchState.song) || '';
    // The station's own icon with a status dot; the built-in one until it has one.
    const own = st && iconPath(st) !== BUILTIN;
    tray.setImage(own ? stationTrayImage(iconPath(st), live ? [255, 48, 72] : [43, 230, 255])
        : icon(!st ? 'tray-off' : live ? 'tray-live' : 'tray-auto'));
    tray.setToolTip(`${name} — ${st ? who : 'add a station'}${song ? '\n' + song : ''}`.slice(0, 127));    // Windows caps it
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: name, enabled: false },
        { label: st ? (live ? '● ' : '○ ') + who : 'No station yet', enabled: false },
        ...(song ? [{ label: '♪ ' + song.slice(0, 60), enabled: false }] : []),
        { type: 'separator' },
        { label: 'Open', click: () => createWindow(true) },
        { label: pageState && pageState.playing ? 'Pause' : 'Play', enabled: !!st, click: () => toPage('toggle-play') },
        { label: 'Reload', enabled: !!st, click: reloadPage },
        ...(studioHere || studioOpen() || cfg.studioSsh ? [{ label: 'Studio', click: () => studioAnywhere() }] : []),
        { type: 'separator' },
        { label: 'Live alerts', type: 'checkbox', checked: !!cfg.alerts, click: (i) => { cfg.alerts = i.checked; save(); broadcastUi(); } },
        { label: 'Start with the computer', type: 'checkbox', checked: !!cfg.openAtLogin, click: (i) => { cfg.openAtLogin = i.checked; save(); startWithComputer(); broadcastUi(); } },
        ...updateItems(),
        { label: 'Put the windows back on screen', click: resetPlaces },
        { label: 'Stations…', click: showStations },
        { type: 'separator' },
        { label: 'Quit On Air', click: () => { quitting = true; app.quit(); } }
    ]));
}

/* ---------- updates (GitHub releases) ---------- */
let updates = null;
function updateItems() {
    const s = updates ? updates.state : { status: 'idle' };
    if (s.status === 'ready' && studioOpen()) return [{ label: `Update ${s.version} waits for the Studio to close`, enabled: false }];
    if (s.status === 'ready') return [{ label: `Restart to update (${s.version})`, click: () => updates.install() }];
    if (s.status === 'downloading') return [{ label: `Downloading ${s.version}…`, enabled: false }];
    if (s.status === 'manual') return [{ label: `Download On Air ${s.version}…`, click: () => updates.page() }];
    return [{ label: 'Check for updates', type: 'checkbox', checked: cfg.updates !== false, click: (i) => { cfg.updates = i.checked; save(); broadcastUi(); if (i.checked && updates) updates.check(); } }];
}

/** Lost a window off a screen that is gone? Back beside the radio, everything. */
function resetPlaces() {
    for (const id of Object.keys(cfg.windows)) { const p = cfg.windows[id]; delete p.x; delete p.y; p.rolled = false; }
    save();
    if (win) { const a = screen.getPrimaryDisplay().workArea; win.setPosition(a.x + 60, a.y + 60); win.show(); }
    let n = 0;
    for (const [, w] of elWins) if (!w.isDestroyed() && win) { const r = win.getBounds(); w.setPosition(r.x + r.width + 10 + n * 24, r.y + n * 24); n++; }
}

/** Send to the radio; if there is no radio yet, open it (hidden) and send once it is ready. */
function toPage(channel, arg) {
    if (win && radioReady) return win.webContents.send(channel, arg);
    createWindow(false);
    if (win) win.webContents.once('did-finish-load', () => setTimeout(() => win && win.webContents.send(channel, arg), 1500));
}

function tip(title, body) {
    if (!Notification.isSupported()) return;
    new Notification({ title, body, icon: iconPath(), silent: true }).show();
}

/* ---------- watching for live shows ---------- */
function startWatch() {
    if (app.isReady()) webRules();       // the station's address is in the rules
    if (watcher) watcher.stop();
    watcher = null; watchState = null;
    const st = station();
    if (!st) return refreshTray();
    watcher = new Watcher(st, {
        seen: cfg.seen || '',
        remember: (k) => { cfg.seen = k; save(); },
        onState: (s) => { watchState = s; refreshTray(); if (s.ping) alertPing(s.ping); if (process.env.ONAIR_SMOKE) console.log('[watch]', JSON.stringify(s)); },
        onLive: (s) => { if (cfg.alerts) alertLive(s); }
    });
    watcher.start();
}

/** The one sound the app makes: the station going live. */
function alertLive(s) {
    if (process.env.ONAIR_SMOKE) console.log('[alert]', s.name, s.dj);
    if (!Notification.isSupported()) return;
    if (win && win.isVisible() && win.isFocused()) return;      // already looking at it
    const n = new Notification({
        title: `${s.name} is live`,
        body: `${s.dj ? s.dj + ' is on the air' : 'On the air now'}${s.show ? ' — ' + s.show : ''}. Click to listen.`,
        icon: iconPath()
    });
    n.on('click', () => { createWindow(true); toPage('play'); });
    n.show();
}

/**
 * The host's 📣 Ping, live or not. It arrives two ways: at once through
 * the radio's connection to the studio, or within half a minute through
 * the watch. Each ping once; one older than ten minutes (the app was off
 * when it went out) is not news any more.
 */
function alertPing(p) {
    if (!p || !p.id || p.id === cfg.seenPing) return;
    cfg.seenPing = p.id; save();
    if (p.at && Date.now() - p.at > 10 * 60e3) return;
    if (process.env.ONAIR_SMOKE) console.log('[ping]', p.title, p.body);
    if (!cfg.alerts || !Notification.isSupported()) return;
    const n = new Notification({ title: String(p.title || 'On Air').slice(0, 80), body: String(p.body || '').slice(0, 200), icon: iconPath() });
    n.on('click', () => { createWindow(true); toPage('play'); });
    n.show();
}

/* ---------- start with the computer, quietly in the tray ---------- */
function startWithComputer() {
    if (process.platform === 'linux') {
        const dir = path.join(os.homedir(), '.config', 'autostart'), file = path.join(dir, 'on-air.desktop');
        if (!cfg.openAtLogin) { try { fs.unlinkSync(file); } catch { /* not there */ } return; }
        const exe = process.env.APPIMAGE || process.execPath;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=On Air\nExec="${exe}" --hidden\nX-GNOME-Autostart-enabled=true\n`);
        return;
    }
    app.setLoginItemSettings({ openAtLogin: !!cfg.openAtLogin, args: ['--hidden'] });
}

/* =============================================================
   ALBUM DOWNLOADS — the station's albums, straight to a folder
   (Music\<station>\<album> unless you pick somewhere else).
   ============================================================= */
const safeName = (s) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/[. ]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Album';
const downloads = new Map();          // album key → { stop }
const madeFolders = new Set();

async function downloadAlbum(sender, job) {
    const files = (job.files || []).filter(f => f && /^https:\/\//i.test(f.url)).slice(0, 400);
    if (!files.length) throw new Error('Nothing to download for that album.');
    const st = station();
    let base = cfg.ui.downloads || path.join(app.getPath('music'), safeName(st ? st.name : 'On Air'));
    if (cfg.ui.askWhere) {
        const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(sender.wc), { title: 'Where should the album go?', defaultPath: base, properties: ['openDirectory', 'createDirectory'] });
        if (r.canceled || !r.filePaths[0]) return { cancelled: true };
        base = r.filePaths[0];
    }
    const dir = path.join(base, safeName(job.album));
    fs.mkdirSync(dir, { recursive: true });
    madeFolders.add(dir);
    const key = job.key || job.album;
    let stopped = false;
    downloads.set(key, { stop: () => { stopped = true; } });
    const say = (o) => { if (!sender.isDestroyed()) sender.send('download', { key, dir, ...o }); };
    let done = 0, bytes = 0;
    try {
        for (const f of files) {
            if (stopped) break;
            const name = safeName(f.name) || ('track-' + (done + 1));
            const out = path.join(dir, name);
            if (fs.existsSync(out) && (!f.size || fs.statSync(out).size === Number(f.size))) { done++; say({ done, total: files.length, file: name }); continue; }
            say({ done, total: files.length, file: name });
            const r = await fetch(f.url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60e3) });
            if (!r.ok || !r.body) throw new Error(`${r.status} for ${name}`);
            const tmp = out + '.part';
            const ws = fs.createWriteStream(tmp);
            for await (const chunk of r.body) {
                if (stopped) break;
                bytes += chunk.length;
                if (!ws.write(chunk)) await new Promise(res => ws.once('drain', res));
            }
            await new Promise(res => ws.end(res));
            if (stopped) { fs.rmSync(tmp, { force: true }); break; }
            fs.renameSync(tmp, out);
            done++;
            say({ done, total: files.length, file: name, bytes });
        }
        say({ finished: !stopped, stopped, done, total: files.length });
    } catch (e) {
        say({ error: e.message || String(e), done, total: files.length });
    } finally {
        downloads.delete(key);
    }
    return { dir };
}

/* =============================================================
   WHAT THE APP'S PAGES MAY ASK
   ============================================================= */
const fromApp = (e) => !!(e.senderFrame && isOurs(e.senderFrame.url));
/** Answer later to the page that asked (in the one window, a panel is a frame, not a window of its own). */
const replyTo = (e) => {
    const f = e.senderFrame, wc = e.sender;
    const gone = () => wc.isDestroyed() || !f || (typeof f.isDestroyed === 'function' ? f.isDestroyed() : !!f.detached);
    return { wc, isDestroyed: gone, send: (...a) => { if (!gone()) f.send(...a); } };
};
const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!fromApp(e)) throw new Error('Not allowed.'); return fn(e, ...a); });
const on = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (fromApp(e)) fn(e, ...a); });

/* ---------- the Interface window: green posts and green threads ---------- */
const FUNPOSTERS = 'https://funposters.club/interface/';
handle('iface-req', async (e, r) => {
    if (who(e) !== 'interface' || !r || typeof r !== 'object') throw new Error('Not allowed.');
    let url;
    const headers = {};
    if (r.to === 'fp') {
        if (!/^(get|post|watch)\.php(\?[\w=&.,%-]*)?$/.test(String(r.path))) throw new Error('Not allowed.');
        url = FUNPOSTERS + r.path;
    } else {
        const base = new URL(String(r.server || ''));
        if (!(base.protocol === 'https:' || (base.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(base.hostname)))) throw new Error('The green server must be an https address.');
        if (!/^\/api\/[\w/]*(\?[\w=&%-]*)?$/.test(String(r.path))) throw new Error('Not allowed.');
        url = base.origin + base.pathname.replace(/\/+$/, '') + r.path;
        // The moderator token goes only to the server it was given for: a server's own
        // address, or "station" = wherever the station's PC is today (its published address).
        if (r.admin && cfg.ui.ifaceToken) {
            const ok = cfg.ui.ifaceTokenFor === 'station' ? base.origin === await stationEngine() : cfg.ui.ifaceTokenFor === base.origin;
            if (ok) headers.Authorization = 'Bearer ' + cfg.ui.ifaceToken;
        }
    }
    // Green threads know a person by a private key this app made (so their level follows them);
    // it goes in the request body, never in a page or an address.
    if (r.to !== 'fp' && r.json) {
        if (!cfg.ifaceKey) { cfg.ifaceKey = crypto.randomBytes(24).toString('base64url'); save(); }
        r.json = { ...r.json, key: cfg.ifaceKey };
    }
    let body;
    if (r.form && r.file && r.to === 'fp' && r.path === 'post.php') {
        // A green post with a picture: sent the way the [s4s] interface script sends it (multipart, as "upfile").
        const f = r.file, bytes = f && f.bytes instanceof Uint8Array ? f.bytes : null;
        if (!bytes || bytes.length > 8 * 1024 * 1024 || !/^image\/[\w.+-]+$/.test(String(f.type))) throw new Error('That picture can’t be posted (images up to 8 MB).');
        body = new FormData();
        for (const [k, v] of Object.entries(r.form)) body.append(k, String(v));
        body.append('upfile', new Blob([bytes], { type: f.type }), safeName(f.name).replace(/^Album$/, 'image'));
    }
    else if (r.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(Object.entries(r.form).map(([k, v]) => [k, String(v)])).toString(); }
    else if (r.json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(r.json); }
    const res = await fetch(url, { method: body ? 'POST' : 'GET', headers, body, signal: AbortSignal.timeout(r.file || (r.json && r.json.image) ? 60000 : 15000) }).catch(() => null);
    if (!res) return { status: 0, json: null, text: 'Could not reach ' + new URL(url).host + '.' };
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* the funposters post answer is a page */ }
    return { status: res.status, json, text: json ? '' : text.slice(0, 4000) };
});
/** The station PC's address today, from the station's published pointer (cached a minute). */
let engineSeen = { at: 0, url: '' };
async function stationEngine() {
    const st = station();
    if (!st) return '';
    if (st.engineUrl) return new URL(st.engineUrl).origin;
    if (Date.now() - engineSeen.at < 60e3 && engineSeen.url) return engineSeen.url;
    try {
        const r = await fetch(st.pointerUrl + (st.pointerUrl.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: AbortSignal.timeout(8000) });
        const j = await r.json();
        engineSeen = { at: Date.now(), url: j.engine ? new URL(j.engine).origin : '' };
    } catch { /* unreachable: no token this time */ }
    return engineSeen.url;
}
handle('iface-token', (e, server, token, forStation) => {
    if (who(e) !== 'interface') throw new Error('Not allowed.');
    token = String(token || '').trim();
    cfg.ui.ifaceToken = token;
    cfg.ui.ifaceTokenFor = token ? (forStation ? 'station' : new URL(String(server)).origin) : '';
    save(); broadcastUi();
    return !!token;
});
/* ---------- a vote to skip the AutoDJ song, to the station's PC ---------- */
handle('skip-vote', async (e, musicId) => {
    const eng = await stationEngine();
    if (!eng) return { error: 'The station’s PC is off, so there’s no skipping right now.' };
    if (!cfg.ifaceKey) { cfg.ifaceKey = crypto.randomBytes(24).toString('base64url'); save(); }
    const voter = crypto.createHash('sha256').update(cfg.ifaceKey + '|skip').digest('base64url').slice(0, 32);
    const r = await fetch(eng + '/api/skip', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ voter, musicId: Number(musicId) || 0 }), signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r) return { error: 'Could not reach the station.' };
    try { return await r.json(); } catch { return { error: 'The station didn’t answer properly.' }; }
});

handle('board-posts', (e) => {
    if (who(e) !== 'interface') throw new Error('Not allowed.');
    const fresh = boardPosted.filter(p => Date.now() - p.at < 3600e3);
    boardPosted.length = 0;
    return fresh;
});

/* ---------- hidden threads and posts on the board ----------
   One list for the Interface and the board window: hide a 4chan thread or
   post in either and it's hidden in both. Per board, by number, with when
   it was hidden (4chan's own hide lists in the board window are kept in
   step by its preload). Green posts are the Interface's own business. */
const HIDE_KEEP = 60 * 864e5, HIDE_MAX = 5000;
function hiddenOf(board) {
    const all = cfg.hidden = cfg.hidden || {};
    const b = all[board] = all[board] || { t: {}, r: {} };
    const now = Date.now();
    for (const k of ['t', 'r']) for (const [id, at] of Object.entries(b[k])) if (now - at > HIDE_KEEP) delete b[k][id];
    return b;
}
/** ops: [{ k: 't' | 'r', id, on }]. `from` is who asked, so it isn't told again. */
function setHidden(board, ops, from) {
    if (!/^\w{1,12}$/.test(String(board)) || !Array.isArray(ops)) return;
    const b = hiddenOf(board), done = [];
    for (const o of ops.slice(0, 500)) {
        const id = String((o && o.id) || '');
        if ((o.k !== 't' && o.k !== 'r') || !/^\d{1,12}$/.test(id)) continue;
        if (o.on ? b[o.k][id] : !b[o.k][id]) continue;
        if (o.on) b[o.k][id] = Date.now(); else delete b[o.k][id];
        done.push({ k: o.k, id, on: !!o.on });
    }
    for (const k of ['t', 'r']) { const ids = Object.keys(b[k]); if (ids.length > HIDE_MAX) for (const id of ids.sort((x, y) => b[k][x] - b[k][y]).slice(0, ids.length - HIDE_MAX)) delete b[k][id]; }
    if (!done.length) return;
    saveSoon();
    if (from !== 'interface') sendTo('interface', 'board-hidden', board, b);
    if (boardView && !boardView.webContents.isDestroyed() && from !== 'board') boardView.webContents.send('board-hidden', board, done);
}
handle('board-hidden', (e, board, ops) => {
    if (who(e) !== 'interface') throw new Error('Not allowed.');
    if (ops) setHidden(String(board), ops, 'interface');
    return hiddenOf(String(board));
});
const fromBoardView = (e) => !!boardView && e.sender === boardView.webContents && e.senderFrame === boardView.webContents.mainFrame;
ipcMain.on('board-hidden-get', (e, board) => { e.returnValue = fromBoardView(e) && /^\w{1,12}$/.test(String(board)) ? hiddenOf(String(board)) : null; });
ipcMain.on('board-hidden-set', (e, board, ops) => { if (fromBoardView(e)) setHidden(String(board), ops, 'board'); });

/* ---------- watched threads on the board ----------
   The same for watching: ★ in the Interface and 4chan's own Thread Watcher in
   the board window are one list (per board: thread number → its title). */
const WATCH_MAX = 300;
function watchedOf(board) {
    const all = cfg.watched = cfg.watched || {};
    return (all[board] = all[board] || {});
}
/** ops: [{ id, on, title }]. */
function setWatched(board, ops, from) {
    if (!/^\w{1,12}$/.test(String(board)) || !Array.isArray(ops)) return;
    const w = watchedOf(board), done = [];
    for (const o of ops.slice(0, 300)) {
        const id = String((o && o.id) || '');
        if (!/^\d{1,12}$/.test(id) || !!w[id] === !!o.on) continue;
        if (o.on) w[id] = { title: String(o.title || '').slice(0, 120), at: Date.now() }; else delete w[id];
        done.push({ id, on: !!o.on, title: o.on ? w[id].title : '' });
    }
    const ids = Object.keys(w);
    if (ids.length > WATCH_MAX) for (const id of ids.sort((x, y) => w[x].at - w[y].at).slice(0, ids.length - WATCH_MAX)) delete w[id];
    if (!done.length) return;
    saveSoon();
    if (from !== 'interface') sendTo('interface', 'board-watched', board, w);
    if (boardView && !boardView.webContents.isDestroyed() && from !== 'board') boardView.webContents.send('board-watched', board, done);
}
handle('board-watched', (e, board, ops) => {
    if (who(e) !== 'interface') throw new Error('Not allowed.');
    if (ops) setWatched(String(board), ops, 'interface');
    return watchedOf(String(board));
});
ipcMain.on('board-watched-get', (e, board) => { e.returnValue = fromBoardView(e) && /^\w{1,12}$/.test(String(board)) ? watchedOf(String(board)) : null; });
ipcMain.on('board-watched-set', (e, board, ops) => { if (fromBoardView(e)) setWatched(String(board), ops, 'board'); });

/* ---------- green threads on the board ----------
   The board window pins the green threads on top of its index and catalog (only on the
   station's own board). The list comes from the green server the Interface uses (it says
   which), else the station's PC; a click opens the thread in the Interface, to read and reply.
   The listener can hide one (✕) or all of them (kept here: cfg.boardGreen { off, hid: id → when }). */
let greenServer = '', greenList = { at: 0, from: '', threads: [] }, ifaceNext = '';
on('iface-server', (e, s) => { if (who(e) === 'interface') greenServer = String(s || ''); });
async function boardGreen() {
    let base = greenServer || cfg.ui.ifaceServer || '';
    if (!base) { const eng = await stationEngine(); base = eng ? eng + '/green' : ''; }
    try { const u = new URL(base); if (!(u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)))) base = ''; } catch { base = ''; }
    base = base.replace(/\/+$/, '');
    if (!base) return [];
    if (greenList.from === base && Date.now() - greenList.at < 30e3) return greenList.threads;
    const r = await fetch(base + '/api/threads', { signal: AbortSignal.timeout(10000) }).catch(() => null);
    const j = r && r.ok ? await r.json().catch(() => null) : null;
    if (!j || !Array.isArray(j.threads)) return greenList.from === base ? greenList.threads : [];
    const pic = (p) => p.img && /^(jpg|png|gif|webp)$/.test(p.img.ext) ? { thumb: base + '/api/img/' + p.id + 's.jpg', tw: Number(p.img.tw) || 0, th: Number(p.img.th) || 0 } : null;
    const short = (p) => ({ id: String(p.id || ''), name: String(p.name || ''), trip: String(p.trip || ''), cap: String(p.cap || ''), time: Number(p.time) || 0, text: String(p.text || '').slice(0, 400), img: pic(p) });
    const threads = j.threads.filter(t => t && /^[0-9a-zA-Z]{1,12}$/.test(String(t.id))).slice(0, 50)
        .map(t => ({ ...short(t), sub: String(t.sub || '').slice(0, 120), replies: Number(t.replies) || 0, bumped: Number(t.bumped) || 0, last: (t.last || []).slice(-3).map(short) }));
    greenList = { at: Date.now(), from: base, threads };
    return threads;
}
const boardOf = (u) => { try { const m = /^\/(\w{1,12})\//.exec(new URL(u).pathname); return m ? m[1] : ''; } catch { return ''; } };
function greenHidden() {
    const g = cfg.boardGreen = cfg.boardGreen || { off: false, hid: {} };
    for (const [id, at] of Object.entries(g.hid)) if (Date.now() - at > HIDE_KEEP) delete g.hid[id];
    return g;
}
ipcMain.handle('board-green', async (e) => {
    if (!fromBoardView(e) || !boardOf(e.sender.getURL()) || boardOf(e.sender.getURL()) !== boardOf(boardHome)) return null;
    const g = greenHidden();
    return { threads: await boardGreen().catch(() => []), off: !!g.off, hid: Object.keys(g.hid) };
});
// id: one thread (on = hidden), or '*': all of them.
ipcMain.handle('board-green-hide', (e, id, on) => {
    if (!fromBoardView(e)) return null;
    const g = greenHidden();
    if (id === '*') g.off = !!on;
    else if (/^[0-9a-zA-Z]{1,12}$/.test(String(id))) { if (on) g.hid[id] = Date.now(); else delete g.hid[id]; }
    const ids = Object.keys(g.hid);
    if (ids.length > 500) for (const k of ids.sort((a, b) => g.hid[a] - g.hid[b]).slice(0, ids.length - 500)) delete g.hid[k];
    saveSoon();
    return { off: !!g.off, hid: Object.keys(g.hid) };
});
ipcMain.on('board-green-open', (e, id) => {
    if (!fromBoardView(e) || !/^[0-9a-zA-Z]{1,12}$/.test(String(id))) return;
    const key = 'g:' + id;
    if ((elWins.get('interface') && !elWins.get('interface').isDestroyed()) || frameOf('interface')) sendTo('interface', 'iface-open', key);
    else ifaceNext = key;                                         // it opens on that thread
    toPage('open-element', 'interface');
});
// The green threads changed (the Interface saw it): the board window looks again now.
on('green-changed', (e) => {
    if (who(e) !== 'interface') return;
    greenList.at = 0;
    if (boardView && !boardView.webContents.isDestroyed()) boardView.webContents.send('board-green-changed');
});
// The Interface's oekaki, in the one window: its panel takes the whole window while it's open.
on('panel-big', (e, big) => { if (panelOf(e) === 'interface' && win && !win.isDestroyed()) win.webContents.send('panel-full', big ? 'interface' : ''); });
handle('iface-next', (e) => { if (who(e) !== 'interface') return ''; const k = ifaceNext; ifaceNext = ''; return k; });

/* ---------- pictures from the Interface: save, copy the link, open ---------- */
const imageUrlOf = (u) => { const x = new URL(String(u || '')); if (x.protocol !== 'https:') throw new Error('Not a picture on the web.'); return x; };
async function saveImage(w, url, name, fetcher = net.fetch) {
    const u = imageUrlOf(url);
    const base = decodeURIComponent(u.pathname.split('/').pop() || '') || 'image';
    const ext = path.extname(base) || '.jpg';
    let file = String(name || '').trim() ? safeName(name) : safeName(base);
    if (!path.extname(file)) file += ext;
    const dir = cfg.ui.imageDir && fs.existsSync(cfg.ui.imageDir) ? cfg.ui.imageDir : app.getPath('pictures');
    const r = await dialog.showSaveDialog(w, { title: 'Save the picture', defaultPath: path.join(dir, file), filters: [{ name: ext.slice(1).toUpperCase(), extensions: [ext.slice(1)] }, { name: 'All files', extensions: ['*'] }] });
    if (r.canceled || !r.filePath) return '';
    const res = await fetcher(u.href, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error('The picture is gone (' + res.status + ').');
    fs.writeFileSync(r.filePath, Buffer.from(await res.arrayBuffer()));
    cfg.ui.imageDir = path.dirname(r.filePath); save();
    return path.basename(r.filePath);
}
handle('save-image', (e, url, name) => {
    if (who(e) !== 'interface') throw new Error('Not allowed.');
    return saveImage(BrowserWindow.fromWebContents(e.sender), url, name);
});
on('image-menu', (e, url, name) => {
    if (who(e) !== 'interface') return;
    let u; try { u = imageUrlOf(url); } catch { return; }
    const w = BrowserWindow.fromWebContents(e.sender);
    const r = replyTo(e), say = (m) => r.send('toast', m);
    Menu.buildFromTemplate([
        { label: 'Save picture as…', click: () => saveImage(w, u.href, name).then((f) => f && say('Saved ' + f + '.'), (err) => say(err.message)) },
        { label: 'Copy picture address', click: () => clipboard.writeText(u.href) },
        { label: 'Open in your browser', click: () => shell.openExternal(u.href) },
        { type: 'separator' },
        { label: 'Search for this picture', submenu: [
            ['Google Lens', 'https://lens.google.com/uploadbyurl?url='], ['Yandex', 'https://yandex.com/images/search?rpt=imageview&url='],
            ['SauceNAO', 'https://saucenao.com/search.php?url='], ['TinEye', 'https://tineye.com/search?url='],
            ['IQDB', 'https://iqdb.org/?url='], ['trace.moe (anime scenes)', 'https://trace.moe/?url=']
        ].map(([label, base]) => ({ label, click: () => shell.openExternal(base + encodeURIComponent(u.href)) })) }
    ]).popup({ window: w });
});

ipcMain.on('board-blocked', (e) => {
    if (!boardView || e.sender !== boardView.webContents) return;
    sendTo('board', 'board-blocked');
});
/** A 4chan link the listener copied (from 4chan's verification e-mail), or '' — nothing else is read out. */
handle('board-clip', (e, anyLink) => {
    if (who(e) !== 'board') throw new Error('Not allowed.');
    const t = String(clipboard.readText() || '').trim();
    if (t.length > 2000) return '';
    // Watching: only a 4chan link. The paste box (opened by the listener) also shows any other web link, so they see what they copied.
    return /^https:\/\/([\w-]+\.)*4chan(nel)?\.org\/\S+$/i.test(t) || (anyLink && /^https?:\/\/\S+$/i.test(t)) ? t : '';
});

on('board-goto', (e, url) => {
    if (who(e) !== 'interface') return;
    url = String(url || '');
    if (!/^https:\/\/boards\.4chan(nel)?\.org\//.test(url)) return;
    if (boardView && !boardView.webContents.isDestroyed()) {
        boardView.webContents.loadURL(url);
        // In the one window the board is a panel: bring it into the middle (the Interface steps aside for it).
        if (oneWin()) toPage('open-element', 'board'); else setVisible('board', true);
    } else { boardNext = url; toPage('open-element', 'board'); }
});

function uiInfo() {
    const st = station();
    return {
        ui: { ...cfg.ui, ifaceToken: undefined }, ifaceAdmin: cfg.ui.ifaceToken ? cfg.ui.ifaceTokenFor : '', updates: cfg.updates !== false, update: updates ? { ...updates.state } : null,
        alerts: !!cfg.alerts, openAtLogin: !!cfg.openAtLogin, version: app.getVersion(),
        studioSsh: cfg.studioSsh || '',             // a station's Studio on a server (its field shows once travelOn is typed)
        station: st ? { name: st.name, pageUrl: st.pageUrl, pointerUrl: st.pointerUrl, engineUrl: st.engineUrl } : null,
        downloads: cfg.ui.downloads || path.join(app.getPath('music'), safeName(st ? st.name : 'On Air'))
    };
}
function broadcastUi() { const u = uiInfo(); for (const w of allWindows()) sendAll(w, 'ui', u); }

handle('ui', (e) => ({ ...uiInfo(), win: panelOf(e) ? { ...winInfo('radio'), id: panelOf(e), panel: true, rolled: false } : winInfo(who(e) || 'radio'), windows: Object.fromEntries(Object.entries(cfg.windows).map(([k, v]) => [k, { open: !!v.open, hidden: !!v.hidden }])) }));
handle('ui-set', (e, patch) => {
    for (const k of Object.keys(patch || {})) {
        if (k === 'alerts') cfg.alerts = !!patch.alerts;
        else if (k === 'openAtLogin') { cfg.openAtLogin = !!patch.openAtLogin; startWithComputer(); }
        else if (k === 'updates') { cfg.updates = !!patch.updates; if (cfg.updates && updates) updates.check(); }
        else if (k === 'ifaceToken' || k === 'ifaceTokenFor') continue;          // only through iface-token
        else if (k === 'studioSsh') cfg.studioSsh = cleanSsh(patch.studioSsh);
        else if (k === 'layout') { const l = patch.layout === 'one' ? 'one' : 'windows'; if (l !== cfg.ui.layout) { cfg.ui.layout = l; setTimeout(relayout, 60); } }
        else if (k === 'full') {
            // mid: the middle's arrangement ('hall', 'board/interface+hall' …); under: the part under Now Playing; arr: the one last picked for each mix of parts.
            const f = patch.full || {}, ok = (a) => typeof a === 'string' && /^[a-z+/]{0,40}$/.test(a);
            const arr = {};
            for (const [key, a] of Object.entries(f.arr && typeof f.arr === 'object' ? f.arr : {}).slice(0, 12)) if (/^[a-z,]{1,30}$/.test(key) && ok(a)) arr[key] = a;
            cfg.ui.full = { np: f.np !== false, chat: f.chat !== false, tv: !!f.tv, mid: ok(f.mid) ? f.mid : '', under: ['board', 'interface', 'hall'].includes(f.under) ? f.under : '', arr };
        }
        else if (k in UI_DEFAULTS) cfg.ui[k] = patch[k];
    }
    if ('onTop' in patch) for (const w of allWindows()) { const id = idOf(w.webContents); if (prefs(id).onTop === undefined) w.setAlwaysOnTop(!!cfg.ui.onTop, 'floating'); }
    if ('off' in patch) for (const id of cfg.ui.off) { const w = elWins.get(id); if (w && !w.isDestroyed()) w.close(); }
    save(); refreshTray(); broadcastUi();
    return uiInfo();
});
handle('update-cmd', (e, cmd) => { if (!updates) return null; if (cmd === 'install') updates.install(); else if (cmd === 'check') updates.check(); else if (cmd === 'page') updates.page(); return { ...updates.state }; });
handle('pick-folder', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Where should albums go?', defaultPath: uiInfo().downloads, properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return uiInfo();
    cfg.ui.downloads = r.filePaths[0]; save(); broadcastUi();
    return uiInfo();
});
on('win-set', (e, patch) => { const id = who(e); if (id && !panelOf(e)) setWinPref(id, patch || {}); });
on('win-cmd', (e, cmd, arg) => {
    const panel = panelOf(e);
    if (panel) {
        // A panel of the one window: its menu is the window's; the TV takes the window full screen.
        if (cmd === 'menu') windowMenu(win, 'radio');
        else if (cmd === 'fullscreen' && panel === 'tv') fullScreen(win, 'tv');
        return;
    }
    const id = who(e), w = winOf(id);
    if (!id || !w || w.isDestroyed()) return;
    if (cmd === 'menu') windowMenu(w, id);
    else if (cmd === 'tuck') { if (id === 'radio') w.minimize(); else setVisible(id, false); }
    else if (cmd === 'close') w.close();
    else if (cmd === 'max' && id === 'radio' && oneWin()) { if (w.isMaximized()) w.unmaximize(); else w.maximize(); }
    else if (cmd === 'resize' && arg) {
        const [mw, mh] = MIN[id] || [220, 120];
        const b = w.getBounds();
        const p = prefs(id);
        w.setBounds({ x: b.x, y: b.y, width: Math.max(mw, Math.round(arg.w)), height: p.rolled ? BAR_H : Math.max(mh, Math.round(arg.h)) });
        const nb = w.getBounds();
        Object.assign(p, { x: nb.x, y: nb.y, w: nb.width }, p.rolled ? {} : { h: nb.height });
        saveSoon();
    } else if (cmd === 'fullscreen' && id === 'tv') fullScreen(w);
});
// From the radio: show or tuck one of its windows.
on('open-el', (e, elId) => { if (SIZES[elId] && elId !== 'radio') toPage('open-element', elId); });
on('element', (e, elId, show) => { if (who(e) === 'radio' && SIZES[elId]) setVisible(elId, !!show); });
handle('get-json', async (e, url) => {
    if (!/^https?:\/\//i.test(String(url))) throw new Error('Not a web address.');
    // Test runs: a station's extras.json from a file, before it is published.
    if (process.env.ONAIR_SMOKE && process.env.ONAIR_EXTRAS && /\/extras\.json(\?|$)/.test(url)) return { json: JSON.parse(fs.readFileSync(process.env.ONAIR_EXTRAS, 'utf8')), date: 0 };
    const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'Cache-Control': 'no-cache' } }).catch(() => null);
    if (!r || !r.ok) return { json: null, status: r ? r.status : 0 };      // not there (yet): the page carries on without it
    const text = await r.text();
    if (text.length > 2e6) throw new Error('Too big.');
    // The host's clock too: song times are by the station's clock, not this computer's.
    return { json: JSON.parse(text), date: Date.parse(r.headers.get('date') || '') || 0 };
});
handle('download-album', (e, job) => downloadAlbum(replyTo(e), job || {}));
handle('download-stop', (e, key) => { const d = downloads.get(key); if (d) d.stop(); return !!d; });
handle('show-folder', (e, dir) => { if (madeFolders.has(dir) || dir === uiInfo().downloads) { fs.mkdirSync(dir, { recursive: true }); return shell.openPath(dir); } return 'Not allowed.'; });
on('open-external', (e, url) => { if (/^(https?|mailto):/i.test(String(url))) shell.openExternal(String(url)); });
on('ping', (e, p) => { if (who(e) === 'radio' && p && typeof p === 'object') alertPing({ id: String(p.id || ''), at: Number(p.at) || 0, title: p.title, body: p.body }); });
on('page-status', (e, s) => {
    if (who(e) !== 'radio') return;
    pageState = s; refreshTray();
    if (win) win.setTitle((s.live ? '● ' : '') + ((station() && station().name) || 'On Air'));
    if (process.env.ONAIR_SMOKE) console.log('[page]', JSON.stringify(s));
});

/* ---------- the "stations" screen ---------- */
function useStation(i) {
    cfg.current = i; cfg.seen = ''; cfg.seenPing = ''; save();
    startWatch();
    applyStationIcon();
    if (win) win.loadURL(APP + 'radio.html'); else createWindow(true);
    if (stationsWin && !stationsWin.isDestroyed()) stationsWin.close();
}
handle('add-station', async (e, url) => {
    const st = await resolveStation(url);
    const i = cfg.stations.findIndex(x => x.pageUrl === st.pageUrl);
    const old = i >= 0 ? cfg.stations[i] : null;
    if (old && old.iconFrom === 'custom' && old.icon && fs.existsSync(old.icon)) { st.icon = old.icon; st.iconFrom = 'custom'; }
    else { st.icon = await fetchStationIcon(st).catch(() => ''); st.iconFrom = st.icon ? 'auto' : ''; }
    if (i >= 0) cfg.stations[i] = st; else cfg.stations.push(st);
    useStation(i >= 0 ? i : cfg.stations.length - 1);
    return st;
});
handle('stations', () => ({
    list: cfg.stations.map(s => ({
        name: s.name, pageUrl: s.pageUrl, custom: s.iconFrom === 'custom',
        icon: nativeImage.createFromPath(iconPath(s)).resize({ width: 48, height: 48, quality: 'best' }).toDataURL()
    })),
    current: cfg.current
}));
handle('set-icon', async (e, i) => {
    const st = cfg.stations[i];
    if (!st) return false;
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
        title: `An icon for ${st.name}`, properties: ['openFile'],
        filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'ico', 'bmp'] }]
    });
    if (r.canceled || !r.filePaths[0]) return false;
    const img = nativeImage.createFromPath(r.filePaths[0]);
    if (img.isEmpty()) throw new Error('That picture could not be read. PNG or JPG work best.');
    st.icon = keepIcon(img, hashOf(st.pageUrl) + '-custom-' + Date.now().toString(36) + '.png');
    st.iconFrom = 'custom'; save();
    if (i === cfg.current) applyStationIcon();
    return true;
});
handle('reset-icon', async (e, i) => {
    const st = cfg.stations[i];
    if (!st) return false;
    if (st.iconFrom === 'custom' && st.icon) { try { fs.unlinkSync(st.icon); } catch { /* gone */ } }
    st.icon = await fetchStationIcon(st).catch(() => '');
    st.iconFrom = st.icon ? 'auto' : ''; save();
    if (i === cfg.current) applyStationIcon();
    return true;
});
handle('pick-station', (e, i) => { if (cfg.stations[i]) useStation(i); });
handle('remove-station', (e, i) => {
    if (!cfg.stations[i]) return;
    cfg.stations.splice(i, 1);
    cfg.current = Math.min(cfg.current, Math.max(0, cfg.stations.length - 1));
    save(); startWatch();
    if (!station() && win) { win.destroy(); win = null; }
});
on('back', (e) => { if (stationsWin && !stationsWin.isDestroyed() && e.sender === stationsWin.webContents) stationsWin.close(); createWindow(true); });
handle('stations-window', () => { showStations(); });

/* ---------- go ---------- */
app.on('second-instance', (e, argv) => { createWindow(true); if (studioArg(argv) || sshArg(argv)) studioStart(argv); });
let updating = false;
app.on('before-quit', (e) => {
    // The Studio closes first (asking, if you're on air); then On Air quits, and installs an update if there is one.
    if (studioOpen()) { e.preventDefault(); quitAfterStudio = true; studioWin.close(); return; }
    // A new version is ready: quitting installs it, and the new version opens and asks "Open On Air / Close".
    if (!updating && updates && updates.state.status === 'ready') { e.preventDefault(); updating = true; setImmediate(() => { if (!updates.install('quit')) app.quit(); }); return; }
    quitting = true; if (saveT) save();
});
app.on('window-all-closed', () => { /* stay in the tray */ });
app.on('will-quit', () => { if (fwd) stopForward(); });

app.whenReady().then(async () => {
    serveApp();
    permissions();
    studioSession();
    webRules();
    // Start from the station's current page, not one kept from last time.
    await session.defaultSession.clearCache().catch(() => {});
    tray = new Tray(icon('tray-off'));
    tray.on('click', () => createWindow(true));
    // Test runs: a station given up front, and a clean exit after a while.
    if (process.env.ONAIR_STATION && !station()) {
        try { const st = await resolveStation(process.env.ONAIR_STATION); cfg.stations.push(st); cfg.current = cfg.stations.length - 1; save(); console.log('[station]', JSON.stringify(st)); }
        catch (e) { console.log('[station-error]', e.message); }
    }
    refreshTray();
    startWatch();
    ensureIcons().catch(() => {});
    updates = require('./updates').setup({
        icon: () => iconPath(), enabled: () => cfg.updates !== false, onChange: () => { refreshTray(); broadcastUi(); },
        busy: () => studioOpen() && 'Close the Studio first: the update installs when it is closed.',
        onInstall: (version, how) => { updating = true; quitting = true; cfg.updated = { to: version, ask: how === 'quit' }; save(); }
    });
    // Just updated: say so, and after an update that happened on quitting, ask before opening.
    const upd = cfg.updated;
    if (upd) { delete cfg.updated; save(); }
    // The new version is started by the installer (or the helper that waits for it), in the background:
    // Windows keeps what such a process opens behind your other windows. So after an update, on top.
    const justUpdated = !!(upd && upd.to === app.getVersion() && !process.env.ONAIR_SMOKE);
    if (justUpdated) {
        if (upd.ask) {
            const host = new BrowserWindow({ width: 1, height: 1, x: -10000, y: -10000, frame: false, skipTaskbar: true, alwaysOnTop: true, show: true, transparent: true, focusable: true });
            const r = await dialog.showMessageBox(host, {
                type: 'info', title: 'On Air', message: 'On Air ' + upd.to + ' is installed',
                detail: 'The new version was installed when you closed On Air.', buttons: ['Open On Air', 'Close'], defaultId: 0, cancelId: 1,
                icon: nativeImage.createFromPath(iconPath()), noLink: true
            }).finally(() => host.destroy());
            if (r.response === 1) { quitting = true; app.quit(); return; }
        } else tip('On Air ' + upd.to, 'Updated. Welcome back.');
    }
    if (!process.argv.includes('--hidden') || !station()) createWindow(!process.env.ONAIR_SMOKE || !!process.env.ONAIR_SMOKE_SHOW);
    if (justUpdated && win) win.once('ready-to-show', () => toFront(win));
    else if (process.env.ONAIR_SMOKE) createWindow(false);
    if (process.env.ONAIR_SMOKE) smoke();
    // The Studio, if this PC runs the station: opened now, and looked for now and then (for the tray).
    studioStart(process.argv);
    setInterval(() => { if (!studioOpen()) studioCheck(); }, 30e3).unref?.();
});

/* ---------- test runs (ONAIR_SMOKE=ms): no sound, then quit ---------- */
function smoke() {
    const E = process.env;
    for (const w of [win]) if (w) w.webContents.setAudioMuted(true);
    app.on('browser-window-created', (ev, w) => w.webContents.setAudioMuted(true));
    app.on('web-contents-created', (ev, wc) => wc.on('console-message', (e) => {
        if (e.level === 'warning' || e.level === 'error' || E.ONAIR_SMOKE_LOG) console.log('[console]', e.level, String(e.message).slice(0, 300), (e.sourceId || '').split('/').pop() + ':' + e.lineNumber);
    }));
    if (E.ONAIR_SMOKE_PLAY) setTimeout(() => toPage('toggle-play'), 9000);
    if (E.ONAIR_SMOKE_OPEN) setTimeout(() => { console.log('[open]', E.ONAIR_SMOKE_OPEN, 'radio ready:', radioReady); for (const id of E.ONAIR_SMOKE_OPEN.split(',')) toPage('open-element', id); }, Number(E.ONAIR_SMOKE_OPEN_AT) || 6000);
    if (E.ONAIR_SMOKE_CHECK) setTimeout(async () => {
        for (const [id, w] of [['radio', win], ...elWins, ['desk', studioWin]]) {
            if (!w || w.isDestroyed()) continue;
            const r = await w.webContents.executeJavaScript(E.ONAIR_SMOKE_CHECK).catch(e => 'error: ' + e.message);
            console.log('[check]', id, 'pid', w.webContents.getOSProcessId(), JSON.stringify(r));
        }
    }, Number(E.ONAIR_SMOKE_CHECK_AT) || 11000);
    // A busy main process (ONAIR_SMOKE_BUSY = ms of every second): what has to keep going regardless.
    if (E.ONAIR_SMOKE_BUSY) setInterval(() => { const t = Date.now() + Number(E.ONAIR_SMOKE_BUSY); while (Date.now() < t) { /* busy */ } }, 1000);
    // The same, inside the frames of every window (the TV's player, say), every ONAIR_SMOKE_FRAMES_EVERY ms.
    if (E.ONAIR_SMOKE_FRAMES_JS) setInterval(async () => {
        for (const [id, w] of [['radio', win], ...elWins]) {
            if (!w || w.isDestroyed()) continue;
            for (const f of w.webContents.mainFrame.framesInSubtree) {
                if (f === w.webContents.mainFrame) continue;
                const r = await f.executeJavaScript(E.ONAIR_SMOKE_FRAMES_JS).catch(e => 'error: ' + e.message);
                console.log('[frame]', id, f.origin, JSON.stringify(r));
            }
        }
    }, Number(E.ONAIR_SMOKE_FRAMES_EVERY) || 5000);
    if (E.ONAIR_SMOKE_STATIONS) setTimeout(showStations, 6000);
    if (E.ONAIR_SMOKE_BOARD_JS) setTimeout(async () => {
        if (!boardView) return console.log('[board] no view');
        const r = await boardView.webContents.executeJavaScript(E.ONAIR_SMOKE_BOARD_JS).catch(e => 'error: ' + e.message);
        console.log('[board]', boardView.webContents.getURL(), JSON.stringify(r));
    }, Number(E.ONAIR_SMOKE_BOARD_AT) || 15000);
    // ONAIR_SMOKE_FRAMES: what the windows' frames (board, chat, video) actually loaded.
    if (E.ONAIR_SMOKE_FRAMES) setTimeout(async () => {
        for (const [id, w] of elWins) {
            if (w.isDestroyed()) continue;
            for (const f of w.webContents.mainFrame.frames) {
                const t = await f.executeJavaScript(E.ONAIR_SMOKE_FRAMES_JS || 'document.title + " | " + document.body.innerText.length').catch(e => 'error: ' + e.message);
                console.log('[frame]', id, f.url.slice(0, 80), JSON.stringify(t));
            }
        }
    }, Number(E.ONAIR_SMOKE_FRAMES) || 15000);
    if (E.ONAIR_SMOKE_TRAY) setTimeout(() => {
        const st = station(), file = iconPath(st);
        for (const [name, rgb] of [['live', [255, 48, 72]], ['auto', [43, 230, 255]]]) {
            const out = E.ONAIR_SMOKE_TRAY.replace(/\.png$/, `-${name}.png`);
            fs.writeFileSync(out, stationTrayImage(file, rgb).toPNG({ scaleFactor: 2 }));
            console.log('[tray]', out, 'from', path.basename(file));
        }
    }, 12000);
    // ONAIR_SMOKE_SHOT=dir: a picture of every open window.
    if (E.ONAIR_SMOKE_SHOT) setTimeout(async () => {
        fs.mkdirSync(E.ONAIR_SMOKE_SHOT, { recursive: true });
        for (const [id, w] of [['radio', win], ...elWins, ['stations', stationsWin], ['desk', studioWin]]) {
            if (!w || w.isDestroyed()) continue;
            if (!w.isVisible()) { console.log('[shot]', id, 'tucked'); continue; }
            const img = await w.webContents.capturePage().catch((e) => { console.log('[shot-error]', id, e.message, 'visible:', w.isVisible()); return null; });
            if (!img) continue;
            const f = path.join(E.ONAIR_SMOKE_SHOT, id + '.png');
            fs.writeFileSync(f, img.toPNG());
            console.log('[shot]', f, JSON.stringify(w.getBounds()));
        }
        if (boardView) { const img = await boardView.webContents.capturePage().catch(() => null); if (img) { const f = path.join(E.ONAIR_SMOKE_SHOT, 'board-view.png'); fs.writeFileSync(f, img.toPNG()); console.log('[shot]', f, JSON.stringify(boardView.getBounds()), 'visible:', boardView.getVisible()); } }
    }, Number(E.ONAIR_SMOKE_SHOT_AT) || 14000);
    setTimeout(() => { quitting = true; app.quit(); }, Number(E.ONAIR_SMOKE) || 20000);
}
