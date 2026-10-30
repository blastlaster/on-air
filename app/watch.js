/* =============================================================
   STATION WATCH — is the station live? Plain Node, no Electron.

   A station is found from whatever address someone pastes:
     - its listener page            https://esfores.neocities.org/
     - the published pointer file   …/onair/station.json
     - the station PC itself        https://xyz.trycloudflare.com
   and watched without any push service: every half minute the app
   reads the pointer file the station PC keeps on its site (where
   the studio is now), asks the studio whether it is live, and
   falls back to the hosting panel, which shows a DJ on the stream.
   ============================================================= */
'use strict';

const TIMEOUT = 8000;

async function getJSON(url, timeout = TIMEOUT) {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
    return r.json();
}

const bust = (url) => url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();

/** "esfores.neocities.org" → "https://esfores.neocities.org/". Only http(s). */
function normalise(input) {
    let s = String(input || '').trim();
    if (!s) throw new Error('Paste the station’s address.');
    if (/^(javascript|data|file|vbscript|about|blob|chrome|ftp):/i.test(s)) throw new Error('That is not a web address.');
    if (!/^[a-z][\w+.-]*:\/\//i.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch { throw new Error('That is not a web address.'); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('That is not a web address.');
    return u;
}

/** The folder a page lives in: …/onair/index.html → …/onair/ */
function folderOf(u) {
    const f = new URL(u.href);
    f.search = ''; f.hash = '';
    if (!f.pathname.endsWith('/')) f.pathname = f.pathname.replace(/[^/]*$/, '');
    return f;
}

/**
 * Work out what an address points at. Returns
 *   { name, pageUrl, pointerUrl, engineUrl }
 * where pointerUrl (a published station.json) or engineUrl (a station
 * PC) is how the app finds out whether the station is live.
 */
async function resolveStation(input) {
    const u = normalise(input);
    const tries = [];
    // 1. A pointer file, given directly.
    if (/\.json$/i.test(u.pathname)) tries.push({ pointer: u.href, page: new URL('index.html', folderOf(u)).href });
    // 2. A site that carries the station's onair/ folder (the page itself, or its onair/ page).
    const dir = folderOf(u);
    tries.push({ pointer: new URL('onair/station.json', dir).href, page: u.href });
    tries.push({ pointer: new URL('station.json', dir).href, page: u.href });
    for (const t of tries) {
        try {
            const j = await getJSON(bust(t.pointer));
            if (j && typeof j === 'object' && 'engine' in j && j.station) {
                return { name: j.station.name || u.host, pageUrl: t.page, pointerUrl: t.pointer, engineUrl: '' };
            }
        } catch { /* try the next */ }
    }
    // 3. A station PC (its listener page is its front page).
    try {
        const s = await getJSON(new URL('/api/status', u).href);
        if (s && s.station) return { name: s.station.name || u.host, pageUrl: new URL('/', u).href, pointerUrl: '', engineUrl: u.origin };
    } catch { /* not one */ }
    throw new Error('No On Air station found there. Paste the station’s page address (the one listeners open).');
}

/** A live DJ as the hosting panel shows it: a DJ name, and no library id or length. */
function panelLive(row) {
    return !!(row && row.dj_name && !row.all_music_id && !row.jingle_id && !row.length) ? row.dj_name : '';
}

/**
 * One look at the station. Returns
 *   { live, dj, show, song, name, since, via }   via: 'studio' | 'panel' | 'none'
 * Never throws: a station that cannot be reached is simply not live.
 */
async function checkStation(st) {
    let engine = st.engineUrl || '', info = null;
    if (st.pointerUrl) {
        try {
            const p = await getJSON(bust(st.pointerUrl));
            engine = String(p.engine || '').replace(/\/+$/, '');
            info = p.station || null;
        } catch { /* site unreachable: try what we know */ }
    }
    if (engine) {
        try {
            const s = await getJSON(new URL('/api/status', engine).href);
            const np = s.live ? s.nowPlaying : (s.autodj && s.autodj.title ? s.autodj : null);
            return {
                live: !!s.live, dj: s.dj || '', show: s.show || '', since: s.since || 0, ping: s.ping || null,
                song: np ? [np.artist, np.title].filter(Boolean).join(' — ') : '',
                name: (s.station && s.station.name) || (info && info.name) || st.name, via: 'studio'
            };
        } catch { /* studio PC off or unreachable: ask the panel */ }
    }
    const panel = info && info.panel;
    if (panel && panel.api) {
        try {
            const api = String(panel.api).replace(/\/+$/, '');
            const h = await getJSON(`${api}/history/?limit=1&offset=0&server=${panel.server || 1}`);
            const row = h && h.results && h.results[0];
            const dj = panelLive(row);
            const meta = row ? String(row.metadata || '').replace(new RegExp('^' + (row.dj_name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*'), '') : '';
            return { live: !!dj, dj, show: '', since: 0, song: row ? (row.author && row.title ? `${row.author} — ${row.title}` : meta) : '', name: (info && info.name) || st.name, via: 'panel' };
        } catch { /* panel unreachable too */ }
    }
    return { live: false, dj: '', show: '', since: 0, song: '', name: (info && info.name) || st.name, via: 'none' };
}

/**
 * Watches one station and calls onLive once per show (not every check,
 * not again after a restart in the middle of the same show).
 *   const w = new Watcher(station, { onLive, onState, every, seen, remember });
 */
class Watcher {
    constructor(station, { onLive, onState, every = 30000, seen = '', remember = () => {} } = {}) {
        this.station = station;
        this.onLive = onLive || (() => {});
        this.onState = onState || (() => {});
        this.every = every;
        this.seen = seen;              // the last show alerted for
        this.remember = remember;
        this.state = null;
        this.timer = null;
    }

    /** One show = one alert. The studio says when it started; the panel only says who. */
    static showKey(s) {
        if (!s.live) return '';
        return s.since ? `studio:${s.since}` : `panel:${s.dj}:${new Date().toISOString().slice(0, 10)}`;
    }

    async check() {
        const s = await checkStation(this.station);
        const was = this.state;
        this.state = s;
        this.onState(s, was);
        const key = Watcher.showKey(s);
        // A studio show also seen through the panel a moment earlier is the same show.
        const same = key && (key === this.seen || (this.seen.startsWith('panel:' + s.dj + ':') && key.startsWith('studio:')));
        // Live a moment ago too: the same show, however it is being seen now.
        const stillOn = !!(was && was.live);
        if (key && !same && !stillOn) {
            this.seen = key;
            this.remember(key);
            this.onLive(s);
        } else if (key && key !== this.seen) {
            this.seen = key; this.remember(key);
        }
        return s;
    }

    start() {
        if (this.timer) return;
        const tick = () => this.check().catch(() => {});
        tick();
        this.timer = setInterval(tick, this.every);
    }

    stop() { clearInterval(this.timer); this.timer = null; }
}

module.exports = { resolveStation, checkStation, Watcher, panelLive, normalise };
