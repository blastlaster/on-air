/* =============================================================
   CORE — the station, once, for every window.

   Runs in the radio. Every other window is opened by the radio
   and shares its process, so they all read this one object
   (window.opener.core) instead of each keeping its own connection:

     core.state              what the station is doing right now
     core.on(event, fn, w)   'state', 'chat', 'pins', 'toast', 'album', 'call'
                             (w = the window listening; dropped when it closes)

   The same rules as the station's listener page (web/js/listen.js):
   while someone is live, the studio (its engine) is the source of
   everything; off air, the hosting panel answers directly, and chat
   is the community's Chattable room.
   ============================================================= */
(function () {
    'use strict';
    const app = window.onairApp;
    const LT = window.LT = window.LT || {};

    const pref = (k, d) => { try { const v = localStorage.getItem('ltl.' + k); return v == null ? d : v; } catch { return d; } };
    const setPref = (k, v) => { try { localStorage.setItem('ltl.' + k, v); } catch { /* full */ } };
    /** Your look in the Hall, if you've been there: it goes with a call or a voicemail, for the speaker box. */
    const hallLook = () => { try { const l = JSON.parse(pref('hallLook', 'null')); return l && typeof l === 'object' ? l : null; } catch { return null; } };
    const trim = (s) => String(s || '').trim();
    const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    /* ---------- who is listening (windows come and go) ---------- */
    const subs = {};
    function on(ev, fn, w) {
        (subs[ev] = subs[ev] || new Set()).add({ fn, w: w || window });
        const set = subs[ev];
        return () => { for (const s of set) if (s.fn === fn) set.delete(s); };
    }
    function emit(ev, data) {
        const set = subs[ev];
        if (!set) return;
        for (const s of [...set]) {
            if (s.w && s.w !== window && s.w.closed) { set.delete(s); continue; }
            try { s.fn(data); } catch (e) { set.delete(s); }
        }
    }

    /* ---------- where things are ---------- */
    let station = {}, extras = {}, ENGINE = '', POINTER = '', SITE = '';
    let engineUp = false, status = null, panelNow = null, panelLiveDj = '', forecast = [];
    // The panel's forecast follows the playlist's order; a shuffled AutoDJ never
    // keeps to it. Show it only once a prediction has come true, and drop it at
    // the first one that doesn't.
    let forecastOk = false, lastSong = '';
    const forecastNext = new Set();     // what it said would come next, during this song
    const songKey = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
    let ws = null, wsWait = 1000, retryT = null;
    let clockSkew = 0;
    const serverNow = () => Date.now() + clockSkew;
    let myName = pref('name', '');
    let myColor = pref('color', '');          // your name colour in chat and blug.dj/jej ('' = the usual)
    let chat = [], pinList = [], gotPins = false, pendingPassCall = false;
    let call = null, callState = null, wasPlayingBeforeCall = false;

    /* =========================================================
       ENGINE CONNECTION
       ========================================================= */
    function connect() {
        retryT = null;
        if (ws || !ENGINE) return;
        try { ws = new WebSocket(ENGINE.replace(/^http/, 'ws') + '/ws'); } catch { ws = null; return retry(); }
        ws.onopen = () => {
            wsWait = 1000;
            if (window.onairApp) send({ t: 'app' });           // the desktop app: the studio counts us for 📣 Ping
            if (myName) send({ t: 'hello', name: myName, color: myColor });
            if (call && call.token) send({ t: 'resume', token: call.token });
            emit('connected');                                   // the Hall walks back in
        };
        ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
        ws.onclose = () => {
            ws = null;
            if (engineUp) { engineUp = false; render(); }
            if (call) { setCall({ text: 'Reconnecting to the studio…' }); wsWait = 1000; }
            retry();
        };
    }
    function retry() {
        if (retryT || !ENGINE) return;
        retryT = setTimeout(connect, wsWait);
        wsWait = Math.min(wsWait * 2, 8000);
    }
    function findStudioNow() {
        if (engineUp) return;
        if (POINTER) loadPointer();
        if (ENGINE && !ws) { clearTimeout(retryT); retryT = null; wsWait = 1000; connect(); }
    }
    async function loadPointer() {
        if (!POINTER) return;
        try {
            const sentAt = Date.now();
            const { json: j, date } = await app.getJSON(POINTER + (POINTER.includes('?') ? '&' : '?') + 't=' + Date.now());
            if (date) clockSkew = date + 500 - (sentAt + Date.now()) / 2;
            const e = String((j && j.engine) || '').replace(/\/+$/, '');
            if (j && j.station && !engineUp) { setStation(j.station); render(); }
            if (e !== ENGINE) {
                ENGINE = e; wsWait = 1000;
                clearTimeout(retryT); retryT = null;
                if (ws) { try { ws.close(); } catch { /* closing */ } } else connect();
            }
        } catch { /* the site is unreachable for now */ }
    }
    function send(o) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; } return false; }

    /* The station's picture emotes (:name: → '/emotes/<file>' on the station's PC). When the
       list (or the PC's address) changes, every chat draws itself again so earlier lines get them
       too. Each window has its own copy of LT: core.emotes / emotesKey let it catch up (win.js). */
    let emotes = {}, emotesKey = '';
    function setEmotes(map) {
        const key = ENGINE + JSON.stringify(map || {});
        if (key === emotesKey) return;
        emotes = map || {}; emotesKey = key;
        if (window.LT && LT.setEmotes) LT.setEmotes(emotes, ENGINE);
        emit('chat', { reset: chat });
    }

    function onMessage(m) {
        switch (m.t) {
            case 'welcome':
                chat = (m.chat || []).slice(-150);
                emit('chat', { reset: chat });
                if (m.pins) { gotPins = true; setPins(m.pins); }
                if (m.role === 'cohost' && pendingPassCall) { pendingPassCall = false; startCall(true); }
                break;
            case 'status':
                status = m; engineUp = true;
                setEmotes(m.emotes);
                if (m.ping && window.onairApp) window.onairApp.ping(m.ping);      // the host's 📣 Ping (the app shows each once)
                if (m.station) { setStation(m.station); setPref('station', JSON.stringify(station)); }
                render();
                break;
            case 'chat':
                chat.push(m.msg); if (chat.length > 150) chat.shift();
                emit('chat', { add: m.msg });
                break;
            case 'chat-hide': chat = chat.filter(x => x.id !== m.id); emit('chat', { hide: m.id }); break;
            case 'chat-pins': gotPins = true; setPins(m.pins); break;
            case 'chat-pin': if (!gotPins) setPins(m.msg ? [m.msg] : []); break;
            case 'named': myName = m.name; render(); break;
            case 'call': onCall(m); break;
            case 'rtc': if (call) call.onRtc(m.data); break;
            case 'rtc-restart': if (call && call.pc) call.restart(); break;
            case 'resumed-call': if (call) { call.restart(); toast('Back on the line.'); } break;
            case 'error': toast(m.message); pendingPassCall = false; break;
            default: if (typeof m.t === 'string' && m.t.startsWith('hall-')) emit('hall', m); return;
            case 'requested': toast(m.bumped ? '“' + m.title + '” was already queued — it’s now up next.' : m.queued ? '“' + m.title + '” is in the queue.' : 'Request sent — the DJ will try to find it.'); break;
        }
    }

    function setStation(s) {
        station = s || {};
    }
    function setPins(list) { pinList = list || []; emit('pins', pinList); render(); }

    /* =========================================================
       THE PANEL — straight from the hosting service
       ========================================================= */
    const panel = () => station.panel || null;
    const panelApi = () => { const p = panel(); return p && p.api ? String(p.api).replace(/\/+$/, '') : ''; };

    function splitRequest(title) {
        const m = /^(.*?)\s*\[Requested by ([^\]:]*?)\s*(?::\s*([^\]]*?))?\s*\]\s*$/i.exec(String(title || ''));
        if (!m) return { title: String(title || ''), by: '', note: '' };
        return { title: m[1] || String(title), by: trim(m[2]), note: trim(m[3] || '') };
    }
    function panelSong(r) {
        let meta = String(r.metadata || '');
        if (r.dj_name && meta.indexOf(r.dj_name + ':') === 0) meta = meta.slice(r.dj_name.length + 1);
        const parts = meta.split(' - ').map(trim);
        const req = splitRequest(r.title || parts[1] || parts[2] || parts[0] || 'Unknown');
        return {
            title: req.title, artist: r.author || (parts.length > 1 ? parts[0] : ''),
            requestedBy: req.by, note: req.note,
            at: r.ts || 0, length: r.length || 0, img: r.img_medium_url || r.img_url || '', id: r.all_music_id || 0,
            live: !!(r.dj_name && !r.all_music_id && !r.jingle_id && !r.length), dj: r.dj_name || ''
        };
    }
    async function getJSON(url) {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
    }

    let pollT = null;
    function pollPanel() { clearTimeout(pollT); pollT = setTimeout(pollPanel, 20000); pollNow(); }
    function pollNow() {
        const api = panelApi(), sid = (panel() || {}).server || 1;
        if (!api || engineUp) return;
        getJSON(api + '/history/?limit=21&offset=0&server=' + sid).then((j) => {
            const rows = (j.results || []).map(panelSong);
            panelNow = panelNow || {};
            panelNow.current = rows[0] || null;
            panelNow.recent = rows.slice(1);
            const top = rows[0], was = panelLiveDj;
            panelLiveDj = top && top.live && serverNow() - top.at < 3 * 3600e3 ? top.dj : '';
            if (panelLiveDj && !was) findStudioNow();
            render();
        }).catch(() => {});
        getJSON(api + '/channels/?server=' + sid).then((j) => {
            if (!j || !j.length) return;
            panelNow = panelNow || {};
            panelNow.listeners = j.reduce((n, c) => n + (Number(c.listeners_current) || 0), 0);
            render();
        }).catch(() => {});
    }

    // Coming up: the AutoDJ's plan (meaningless while someone is live).
    function pollForecast() {
        setTimeout(pollForecast, 30000);
        const api = panelApi();
        if (!api || isLive()) return;
        getJSON(api + '/forecast/?format=json').then((d) => {
            const arr = Array.isArray(d) ? d : (d && (d.results || d.objects || d.tracks || d.forecast || d.items)) || [];
            const pick = (o, ks) => { for (const k of ks) if (o && o[k] != null && String(o[k]).trim() !== '') return String(o[k]).trim(); return ''; };
            const list = arr.map((it) => {
                const t = it && typeof it === 'object' && it.track && typeof it.track === 'object' ? it.track : it;
                return {
                    title: pick(t, ['title', 'name', 'track', 'song', 'metadata', 'display_name']),
                    artist: pick(t, ['artist', 'artist_name', 'performer', 'author']),
                    combined: pick(t, ['metadata', 'display', 'text'])
                };
            }).filter(x => x.title || x.combined).slice(0, 10);
            if (list[0]) forecastNext.add(songKey(list[0].title || list[0].combined));
            if (!sameJSON(list, forecast)) { forecast = list; render(); }
        }).catch(() => {});
    }

    function autodj() {
        if (engineUp && status && status.autodj && (status.autodj.title || status.autodj.song)) {
            const a = status.autodj;
            return {
                current: { title: a.title || a.song, artist: a.title ? a.artist : '', img: a.img || '', requestedBy: a.requestedBy || '', note: a.note || '', at: a.startedAt || 0, length: a.length || 0, id: a.musicId || 0 },
                recent: a.recent || [], listeners: a.listeners
            };
        }
        if (panelNow) return { current: panelNow.current, recent: panelNow.recent || [], listeners: panelNow.listeners };
        return null;
    }
    const isLive = () => !!(engineUp && status && status.live);

    function requestMode() {
        if (isLive()) return status.requests && status.requests !== 'off' ? 'station' : '';
        const p = panel();
        if (p && p.requests) return 'autodj';
        if (engineUp && status.requests && status.requests !== 'off') return 'station';
        return '';
    }
    const artUrl = (p) => (p ? (/^https?:/.test(p) ? p : ENGINE + p) : '');

    /* =========================================================
       STATE — one snapshot, sent to every window when it changes
       ========================================================= */
    const S = { ready: false };
    let lastStatusKey = '', bannerVarsNow = {};
    function render() {
        const live = isLive(), a = live ? null : autodj();
        const hint = !live && !engineUp ? panelLiveDj : '';
        const onAir = live || !!hint, who = live ? (status.dj || '') : hint;
        let main = '', sub = '', img = '', track = null;
        if (live) {
            main = status.show || (status.dj ? status.dj + ' is on the air' : 'On the air');
            const np = status.nowPlaying;
            if (np) { sub = [np.artist, np.title].filter(Boolean).join(' — '); img = artUrl(np.art); track = { title: np.title || '', artist: np.artist || '', requestedBy: np.requestedBy || '', note: np.note || '' }; }
        } else if (a && a.current) {
            main = a.current.title; sub = a.current.artist; img = a.current.img;
            track = a.current;
        } else {
            main = station.tagline || (station.name ? 'Music around the clock' : 'Tuning in…');
        }
        if (!live && track && track.title) {
            const k = songKey(track.title);
            if (k !== lastSong) {
                if (lastSong && forecastNext.size) forecastOk = [...forecastNext].some(f => f === k || (f.length > 3 && k.includes(f)));
                forecastNext.clear();
                lastSong = k;
            }
        }
        const n = live ? status.listeners : (a && typeof a.listeners === 'number' ? a.listeners : (status ? status.listeners : null));
        const played = (live ? (status.history || []) : (a ? a.recent : [])).map((h) => ({
            title: h.title || '', artist: h.artist || '', img: artUrl(h.art || h.img), at: h.at || 0, requestedBy: h.requestedBy || ''
        }));
        const room = station.chattable || extras.chattable || '';
        const next = {
            ready: true,
            name: station.name || '', tagline: station.tagline || '',
            accent: station.accent || '#ff3d6e', autoAccent: station.autoAccent || '#4ecdff',
            live, onAir, who, engineUp,
            main, sub, img,
            track: track ? { title: track.title || '', artist: track.artist || '', requestedBy: track.requestedBy || '', note: track.note || '', at: track.at || 0, length: track.length || 0, id: track.id || 0 } : null,
            canVote: !!(track && track.id && panel() && !live),
            // A vote to skip this AutoDJ song (the station's PC counts it; more than half of the listeners skips it).
            skip: !live && track && track.id && engineUp && status && status.skip && status.skip.on && status.skip.musicId === track.id
                ? { votes: status.skip.votes, needed: status.skip.needed, listeners: status.skip.listeners, skipped: !!status.skip.skipped, mine: hasSkipped(track.id) } : null,
            onLine: live ? (status.onAir || []).filter(p => p.lane !== 'host').map(p => ({ name: p.name, color: p.color })) : [],
            listeners: typeof n === 'number' ? n : null,
            played, comingUp: live || !forecastOk ? [] : forecast,
            // The station's own chat whenever its PC is on (live or not); its Chattable room while it's off.
            chatMode: engineUp ? 'station' : room ? 'chattable' : 'none', room,
            requestMode: requestMode(), requestKind: live || (engineUp && requestMode() === 'station') ? (status && status.requests) : 'autodj',
            callsOpen: !!(live && status.callsOpen && LT.callSupported && LT.callSupported()),
            voicemail: !!(engineUp && status && status.voicemail),
            canCode: engineUp,
            call: callState, myName,
            pins: pinList,
            tv: station.tv && station.tv.live && station.tv.videoId ? { live: true, videoId: station.tv.videoId, title: station.tv.title || '' } : { live: false },
            extras,
            playing: player.playing, volume: player.volume,
            album: album.info()
        };
        // The LED sign, with its shortcuts filled in from the above.
        const pl = pinList || [];
        bannerVarsNow = {
            current: track ? [track.artist, track.title].filter(Boolean).join(' — ') : '',
            artist: track ? track.artist || '' : '', title: track ? track.title || '' : '',
            dj: live ? (status.dj || '') : 'AutoDJ', show: live ? (status.show || '') : '',
            listeners: next.listeners == null ? '' : next.listeners, station: next.name,
            time: clock(Date.now())
        };
        for (let i = 0; i < 5; i++) bannerVarsNow['pin' + (i + 1)] = pl[i] ? (LT.bannerPlain ? LT.bannerPlain(pl[i].text) : pl[i].text) : '';
        const b = station.banner || null;
        next.banner = b && LT.bannerFill ? { on: b.on, color: b.color, speed: b.speed, font: b.font, effect: b.effect, caps: b.caps, items: LT.bannerFill(b.items, bannerVarsNow) } : b;

        if (!sameJSON(next, S)) {
            for (const k of Object.keys(S)) delete S[k];
            Object.assign(S, next);
            emit('state', S);
        }
        // The tray says the same.
        const st = { live: onAir, dj: who, now: main, sub, playing: player.playing };
        const k = JSON.stringify(st);
        if (k !== lastStatusKey) { lastStatusKey = k; app.status(st); }
    }
    function clock(ts) {
        const d = new Date(ts), h = d.getHours(), m = d.getMinutes();
        return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' am' : ' pm');
    }
    setInterval(() => { if (station.banner && /%time/i.test((station.banner.items || []).join(' '))) render(); }, 20000);

    /* =========================================================
       PLAYER — the stream, and the station's albums
       (one plays at a time)
       ========================================================= */
    const audio = new Audio();
    audio.preload = 'none';
    const player = { playing: false, volume: Number(pref('vol', '0.8')) };
    audio.volume = player.volume;

    function streamUrl() {
        let u = station.listenUrl || '';
        // The app's pages are https-strict: servers that offer http answer on https too.
        if (/^http:/i.test(u)) u = 'https:' + u.slice(5);
        return u;
    }
    function play() {
        const url = streamUrl();
        if (!url) { toast('No stream address yet.'); return; }
        album.pause();
        audio.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        const p = audio.play();
        if (p && p.catch) p.catch(() => { setPlaying(false); toast('Press play again to start.'); });
        setPlaying(true);
    }
    function stop() {
        audio.pause();
        audio.removeAttribute('src');
        try { audio.load(); } catch { /* fine */ }
        setPlaying(false);
    }
    function setPlaying(on) { player.playing = on; render(); }
    audio.onerror = () => { if (player.playing) { setPlaying(false); toast('The stream did not open.'); } };
    function setVolume(v) {
        player.volume = Math.max(0, Math.min(1, Number(v)));
        audio.volume = player.volume; album.audio.volume = player.volume;
        if (call) call.setVolume(player.volume);
        setPref('vol', player.volume);
        render();
    }

    const album = {
        audio: new Audio(), now: null, list: [], i: -1,
        info() {
            if (!this.now) return null;
            const t = this.list[this.i] || {};
            return { key: this.now.key, title: this.now.title, track: t.label || '', i: this.i, n: this.list.length, playing: !this.audio.paused };
        },
        start(albumInfo, tracks, i) {
            this.now = albumInfo; this.list = tracks || []; this.go(i || 0);
        },
        go(i) {
            if (!this.list.length) return;
            this.i = (i + this.list.length) % this.list.length;
            if (player.playing) stop();
            this.audio.src = this.list[this.i].url;
            this.audio.volume = player.volume;
            this.audio.play().catch(() => toast('That track did not open.'));
            render(); emit('album', this.info());
        },
        toggle() { if (!this.now) return; if (this.audio.paused) { if (player.playing) stop(); this.audio.play().catch(() => {}); } else this.audio.pause(); },
        pause() { if (this.now && !this.audio.paused) this.audio.pause(); },
        close() { this.audio.pause(); this.audio.removeAttribute('src'); this.now = null; this.list = []; this.i = -1; render(); emit('album', null); },
        seek(frac) { if (isFinite(this.audio.duration)) this.audio.currentTime = frac * this.audio.duration; }
    };
    album.audio.preload = 'none';
    album.audio.onended = () => { if (album.i < album.list.length - 1) album.go(album.i + 1); else { render(); emit('album', album.info()); } };
    album.audio.onplay = album.audio.onpause = () => { render(); emit('album', album.info()); };
    album.audio.ontimeupdate = () => emit('albumtime', { t: album.audio.currentTime, len: album.audio.duration || 0 });

    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.setActionHandler('play', () => (album.now ? album.toggle() : play()));
            navigator.mediaSession.setActionHandler('pause', () => (album.now && !album.audio.paused ? album.toggle() : stop()));
            navigator.mediaSession.setActionHandler('nexttrack', () => album.now && album.go(album.i + 1));
            navigator.mediaSession.setActionHandler('previoustrack', () => album.now && album.go(album.i - 1));
        } catch { /* older */ }
    }
    on('state', (s) => {
        if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
        const al = s.album && s.album.playing ? s.album : null;
        try { navigator.mediaSession.metadata = new MediaMetadata(al ? { title: al.track, artist: al.title } : { title: s.main, artist: s.sub || s.name }); } catch { /* fine */ }
    });

    /* =========================================================
       VOTES — the hosting panel's own (the same calls its widget makes)
       ========================================================= */
    const votedList = () => { try { return JSON.parse(pref('voted', '[]')) || []; } catch { return []; } };
    const hasVoted = (id) => votedList().includes(String(id));
    const rememberVote = (id) => setPref('voted', JSON.stringify([...votedList(), String(id)].slice(-60)));
    const skippedList = () => { try { return JSON.parse(pref('skipVoted', '[]')) || []; } catch { return []; } };
    const hasSkipped = (id) => skippedList().includes(String(id));
    async function skipVote() {
        const id = S.track && S.track.id;
        if (!id || !S.skip || !window.onairApp || !window.onairApp.skipVote) return;
        if (hasSkipped(id)) return toast('You’ve voted to skip this one.');
        try {
            const r = await window.onairApp.skipVote(id);
            if (r && r.error) { toast(r.error); return; }
            setPref('skipVoted', JSON.stringify([...skippedList(), String(id)].slice(-60)));
            if (r && r.on && typeof r.votes === 'number') status.skip = { ...status.skip, ...r };
            toast(r && r.skipped ? 'Skipped. ⏭' : 'Vote counted: ' + r.votes + ' of ' + r.needed + ' to skip.');
            render();
        } catch { toast('Could not reach the station to vote.'); }
    }
    async function vote(kind) {
        const id = S.track && S.track.id, api = panelApi();
        if (!id || !api) return { ok: false };
        if (hasVoted(id)) { toast('You already voted for this one.'); return { ok: false, done: true }; }
        try {
            const r = await fetch(api + '/music/' + encodeURIComponent(id) + '/' + (kind === 'like' ? 'like' : 'dislike') + '/', { method: 'POST' });
            let d = {}; try { d = await r.json(); } catch { /* empty */ }
            if (r.ok) { rememberVote(id); toast(kind === 'like' ? 'Thanks — vote counted.' : 'Noted — vote counted.'); return { ok: true, done: true, up: d.up, down: d.down }; }
            if (d.result === 'already_voted') { rememberVote(id); toast('You already voted for this one.'); return { ok: false, done: true }; }
            toast('The vote did not go through.');
        } catch { toast('Could not reach the station to vote.'); }
        return { ok: false };
    }

    /* =========================================================
       CALL-IN — the call itself lives here, so closing the
       call-in window never drops it
       ========================================================= */
    function setCall(patch) { callState = patch === null ? null : { ...(callState || {}), ...patch }; render(); emit('call', callState); }
    function startCall(asGuest, topic) {
        if (call) return;
        wasPlayingBeforeCall = player.playing;
        if (player.playing) stop();
        album.pause();
        call = new LT.Call({
            send,
            beaconUrl: (ENGINE || '') + '/api/call/away',
            onAway: (away) => { if (!away && call) toast('Welcome back — your mic is live again.'); }
        });
        setCall({ state: 'starting', text: asGuest ? 'Checking in…' : 'Asking for your microphone…', muted: false });
        call.getMic().then(() => {
            send({ t: 'call', name: myName, topic: topic || '', look: hallLook() });
            call.keepAwake();
        }, (err) => {
            toast('Microphone: ' + (err && err.name === 'NotAllowedError' ? 'permission was refused.' : (err && err.message) || err));
            endCall();
        });
    }
    function onCall(m) {
        if (!call) return;
        if (m.state === 'ended' || m.state === 'closed') { endCall(m.reason); return; }
        if (m.token) call.token = m.token;
        if (!call.pc) { call.connect(); call.setVolume(player.volume); }
        const text = {
            queued: m.position ? 'You are number ' + m.position + ' in line. You can hear the show — hang tight.' : 'You are in line.',
            screen: 'The host is talking to you. You are not on air yet.',
            onair: 'You are ON AIR — everyone can hear you.',
            backstage: 'You are backstage as a co-host. You hear the show; the host will bring you up.'
        }[m.state] || '';
        setCall({ state: m.state, text: text + (m.muted ? ' (The host has muted you.)' : ''), hostMuted: !!m.muted });
    }
    function endCall(reason) {
        if (call) { send({ t: 'hangup' }); call.end(); }
        call = null;
        setCall(null);
        if (reason) toast(reason);
        if (wasPlayingBeforeCall) play();
    }
    function mute() { if (!call) return; call.setMuted(!call.muted); setCall({ muted: call.muted }); }
    function checkIn(code, name) {
        if (!LT.callSupported || !LT.callSupported()) { toast('This computer cannot send audio.'); return false; }
        if (name) setName(name, true);
        pendingPassCall = true;
        if (!send({ t: 'hello', name: myName, pass: code })) { pendingPassCall = false; toast('The studio is not reachable right now.'); return false; }
        return true;
    }

    function setName(n, quiet) {
        n = trim(n).slice(0, 32);
        if (!n) return false;
        myName = n; setPref('name', n);
        send({ t: 'hello', name: n, color: myColor });
        if (!quiet) render();
        return true;
    }

    /* ---------- toasts: shown by the radio and the window you are in ---------- */
    function toast(msg) { if (msg) emit('toast', String(msg)); }

    /* =========================================================
       STATION EXTRAS — what a station offers beyond the radio:
       its albums, links, a board, a video channel (extras.json,
       published next to station.json)
       ========================================================= */
    async function loadExtras() {
        const tries = [];
        if (POINTER) tries.push(new URL('extras.json', POINTER).href);
        if (ENGINE) tries.push(ENGINE + '/extras.json');
        for (const u of tries) {
            try {
                const { json } = await app.getJSON(u + '?t=' + Math.floor(Date.now() / 600000));
                if (json && typeof json === 'object') {
                    extras = json;
                    // Albums may live on the station's own server: a list there replaces the one here.
                    if (extras.albums && typeof extras.albums.url === 'string') {
                        try { const r = await app.getJSON(new URL(extras.albums.url, u).href); extras.albums.items = (r.json && (r.json.items || r.json.albums)) || r.json; } catch { /* keep any inline list */ }
                    }
                    render();
                    return;
                }
            } catch { /* try the next */ }
        }
    }

    /* ---------- the AutoDJ's library index, for the request picker ---------- */
    // From the station PC while it's on, or the copy it publishes next to station.json.
    let library = null;
    async function loadLibrary() {
        if (library) return library;
        const tries = [];
        if (ENGINE && engineUp) tries.push(ENGINE + '/api/autodj-library');
        if (POINTER) tries.push(new URL('library.json', POINTER).href + '?v=' + Math.floor(Date.now() / 3600e3));
        for (const u of tries) {
            try {
                const { json } = await app.getJSON(u);
                if (json && json.tracks && json.tracks.length) return (library = json);
            } catch { /* try the next */ }
        }
        return null;
    }

    /* =========================================================
       GO
       ========================================================= */
    async function start() {
        const info = await app.ui();
        const st = info.station || {};
        POINTER = st.pointerUrl || '';
        ENGINE = (st.engineUrl || '').replace(/\/+$/, '');
        SITE = st.pageUrl || '';
        try { const saved = JSON.parse(pref('station:' + SITE, 'null')); if (saved) station = saved; } catch { /* none */ }
        if (!station.name) station.name = st.name || '';
        render();
        if (POINTER) {
            await loadPointer();
            setTimeout(pollPanel, ENGINE ? 2500 : 0);
            setInterval(() => { if (!engineUp) loadPointer(); }, 15000);
        } else {
            connect();
            setTimeout(pollPanel, 2500);
        }
        loadExtras();
        setInterval(loadExtras, 30 * 60e3);
        setTimeout(pollForecast, 3000);
        window.addEventListener('online', findStudioNow);
        on('state', () => { if (station.name) setPref('station:' + SITE, JSON.stringify(station)); });
    }

    window.core = {
        state: S,
        get chat() { return chat; },
        get pins() { return pinList; },
        get name() { return myName; },
        get color() { return myColor; },
        setColor(c) { myColor = String(c || ''); setPref('color', myColor); if (myName) send({ t: 'hello', name: myName, color: myColor }); render(); },
        get engineUrl() { return ENGINE; },
        get connected() { return !!(ws && ws.readyState === 1); },
        get green() { return !!(status && status.green); },
        get engine() { return ENGINE; },
        get site() { return SITE; },
        get panelApi() { return panelApi(); },
        get panelServer() { return (panel() || {}).server || 1; },
        loadLibrary,
        get emotes() { return emotes; },
        get emotesKey() { return emotesKey; },
        on, toast, now: serverNow, skipVote, hallLook,
        play, stop, toggle: () => (player.playing ? stop() : album.now && !album.audio.paused ? album.toggle() : play()), setVolume,
        vote, hasVoted,
        send, setName,
        chatSend(text) { return send({ t: 'chat', text }); },
        request(o) { return send({ t: 'request', ...o }); },
        startCall, endCall, mute, checkIn, level: () => (call ? call.level() : 0),
        album: {
            start: (a, tracks, i) => album.start(a, tracks, i), go: (i) => album.go(i), toggle: () => album.toggle(),
            close: () => album.close(), seek: (f) => album.seek(f), info: () => album.info(),
            time: () => ({ t: album.audio.currentTime, len: album.audio.duration || 0 })
        },
        pauseForVideo() { const was = player.playing; if (was) stop(); album.pause(); return was; },
        pollNow, findStudioNow, render
    };
    start();
})();
