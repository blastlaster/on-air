/* =============================================================
   THE INTERFACE — the board as the community sees it.

   Our own reader (no 4chan page, no ads): the board's threads from
   4chan's public read-only data, with the green posts merged in
   (funposters.club) and the community's own green threads mixed in
   (the station's green-thread server). Threads with nothing green
   fade into the background; green ones pop out.

   Posting: green posts go to funposters.club; green threads and
   their replies to the green server (text only, letter ids like
   >>7xK2); a real 4chan reply opens the board window at that thread
   (4chan's captcha lives there).
   ============================================================= */
(function () {
    'use strict';
    const FP = 'https://funposters.club/interface/';
    const ID_RE = '(\\d+(?:-\\d+)?|(?=[0-9a-zA-Z]*[a-zA-Z])[0-9a-zA-Z]{4,8})';
    // Levels: the board's numbers ([s4s] loves repeats). Same rules as interface-server/levels.mjs.
    function kindOf(n) {
        const s = String(Math.floor(Math.abs(n)));
        if (s.length >= 2 && /^(\d)\1+$/.test(s)) return s.length >= 4 ? 'quads' : s.length === 3 ? 'trips' : 'dubs';
        if (s.length >= 4 && /^(\d+)\1+$/.test(s)) return 'pattern';
        if (s.length >= 3 && s === [...s].reverse().join('')) return 'palindrome';
        if (/(\d)\1/.test(s)) return 'repeat';
        return '';
    }
    const NAMES = { dubs: 'Dubs', trips: 'Trips', quads: 'Quads', pattern: 'Pattern', palindrome: 'Palindrome' };
    function titleOf(lv) { for (let n = lv; n >= 11; n--) { const k = kindOf(n); if (NAMES[k]) return NAMES[k] + ' ' + n; } return ''; }
    const lvBadge = (lv) => lv ? '<span class="if-lv k-' + (kindOf(lv) || 'none') + '" title="Level ' + lv + (titleOf(lv) ? ' · ' + titleOf(lv) : '') + '">Lv ' + lv + '</span>' : '';
    /** A post id with its repeating end marked, 4chan-style: 7x<b>KK</b>. */
    function idHtml(id, esc) {
        const m = /(.)\1+$/.exec(String(id));
        if (!m || /^\d+(-\d+)?$/.test(id) && m[0].length < 2) return esc(id);
        return esc(String(id).slice(0, -m[0].length)) + '<b class="if-rep r' + Math.min(4, m[0].length) + '">' + esc(m[0]) + '</b>';
    }

    const store = {
        get(k, d) { try { const v = JSON.parse(localStorage.getItem('iface.' + k)); return v == null ? d : v; } catch { return d; } },
        set(k, v) { try { localStorage.setItem('iface.' + k, JSON.stringify(v)); } catch { /* private mode */ } }
    };

    window.IfaceView = function (box, { app, core }) {
        const { $, esc } = UI;
        const extras = () => (core.state.extras && core.state.extras.board) || {};
        const boardName = () => { const m = /boards\.4chan(?:nel)?\.org\/(\w+)/.exec(extras().url || ''); return m ? m[1] : 's4s'; };
        // Green threads: a server named in Settings or extras.json, else the station's own PC (its tunnel).
        const fromStation = () => !UI.info.ui.ifaceServer && !(extras().interface && extras().interface.server);
        const server = () => String(UI.info.ui.ifaceServer || (extras().interface && extras().interface.server) || (core.engineUrl && core.green ? core.engineUrl + '/green' : '')).replace(/\/+$/, '');
        const isAdmin = () => { try { return !!server() && (UI.info.ifaceAdmin === (fromStation() ? 'station' : new URL(server()).origin)); } catch { return false; } };
        const prefs = Object.assign({ sort: 'bump', greenOnly: false, fade: 0.3, threadGreen: false }, store.get('prefs', {}));
        const mine = new Set(store.get('mine', []));                  // my green-thread post ids, for (You)
        const watch = store.get('watch', {});                        // key → { title, seen }
        const saveMine = () => store.set('mine', [...mine].slice(-1000));
        const savePrefs = () => store.set('prefs', prefs);
        const saveWatch = () => store.set('watch', watch);
        /** ★ on or off. A 4chan thread's is shared with the board window's Thread Watcher (both ways). */
        function setWatch(key, on, title) {
            if (!!watch[key] === !!on) return;
            if (on) watch[key] = { title: title || '', seen: seenNow(key) }; else delete watch[key];
            saveWatch();
            if (key[0] === 'c' && app.boardWatched) app.boardWatched(boardName(), [{ id: key.slice(2), on, title: on ? watch[key].title : '' }]).catch(() => {});
        }
        /** The 4chan threads watched in the board window: the Interface's ★ list follows it. */
        function takeWatched(list) {
            if (!list) return;
            let changed = false;
            for (const k of Object.keys(watch)) if (k[0] === 'c' && !list[k.slice(2)]) { delete watch[k]; changed = true; }
            for (const [id, w] of Object.entries(list)) if (!watch['c:' + id]) { watch['c:' + id] = { title: w.title || '', seen: seenNow('c:' + id) }; changed = true; }
            if (changed) { saveWatch(); updateWatchCount(); if (view === 'watch') render(); }
        }
        // How many posts a thread has now (when it's in the catalog), so a newly watched one starts with nothing new.
        function seenNow(key) { const t = threads().find(x => x.key === key); return t ? t.replies + (t.gcount || 0) : 0; }
        let watchLoaded = false;
        const loadWatched = async () => {
            if (!app.boardWatched) return;
            // The first time, what the Interface already watched joins the shared list; after that the shared list leads.
            if (!store.get('watchShared', false)) {
                const ops = Object.keys(watch).filter(k => k[0] === 'c').map(k => ({ id: k.slice(2), on: true, title: watch[k].title }));
                await app.boardWatched(boardName(), ops.length ? ops : undefined).catch(() => null);
                store.set('watchShared', true);
            }
            takeWatched(await app.boardWatched(boardName()).catch(() => null));
        };
        if (app.onBoardWatched) app.onBoardWatched((b, list) => { if (b === boardName()) takeWatched(list); });
        // Hidden: 4chan threads and posts in the app's list (shared with the board window, both ways);
        // green threads and green posts only here. Keys: t:no / r:no (4chan), gt:id / gp:id (green), fp:id (funposters).
        let shared = { t: {}, r: {} }, showHidden = false;
        const hid = store.get('hidden', {});
        const saveHid = () => { const ks = Object.keys(hid); if (ks.length > 3000) for (const k of ks.sort((a, b) => hid[a] - hid[b]).slice(0, ks.length - 3000)) delete hid[k]; store.set('hidden', hid); };
        const tk = (key) => (key[0] === 'c' ? 't:' : 'gt:') + key.slice(2);
        const isHidden = (hk) => /^[tr]:/.test(hk) ? !!shared[hk[0]][hk.slice(2)] : !!hid[hk];
        const threadHidden = (key) => isHidden(tk(key));
        function setHide(hk, on) {
            if (/^[tr]:/.test(hk)) {
                const k = hk[0], id = hk.slice(2);
                if (on) shared[k][id] = Date.now(); else delete shared[k][id];
                if (app.boardHidden) app.boardHidden(boardName(), [{ k, id, on }]).then((b) => { if (b) shared = b; }).catch(() => {});
            } else { if (on) hid[hk] = Date.now(); else delete hid[hk]; saveHid(); }
        }
        const loadHidden = () => app.boardHidden ? app.boardHidden(boardName()).then((b) => { if (b) shared = b; }, () => {}) : Promise.resolve();
        // Hidden or shown in the board window.
        if (app.onBoardHidden) app.onBoardHidden((b, list) => { if (b === boardName() && list) { shared = list; applyHidden(); } });

        let view = 'index', current = null;      // current = { key, kind: 'c'|'g', id }
        let catalog = [], lastPage = 0, greenCounts = {}, green = [], greenVer = 0, threadVer = 0, threadKey = '', timer = 0, busy = false, me = null, query = '';
        // Where you were: the list when you opened a thread, and each thread you've read (this session).
        let listTop = null, restoreTop = null;
        let attached = null;                                          // the picture for your next green post (a File)
        const PIC_MAX = 8 * 1024 * 1024;
        const threadTops = new Map();
        function leaveThread() {
            const sc = $('.if-posts', box);
            if (view === 'thread' && current && sc) { threadTops.set(current.key, sc.scrollTop); if (threadTops.size > 200) threadTops.delete(threadTops.keys().next().value); }
        }
        const seenPosts = new Map();                                 // board post no → its thread (for checks)
        UI.setTitle('Interface', '🟩');

        /* ---------- the 18+ gate (the same promise as the board) ---------- */
        if (!UI.info.ui.boardOk) {
            box.innerHTML = '<div class="gate"><h2>Warning: NSFW</h2><p>' + esc(extras().title || 'The board') + ' is a live message board, shown as posted. It may show pornography and anything else people post.</p>' +
                '<label><input type="checkbox" class="age"> I am 18 or older</label><label><input type="checkbox" class="noask"> Don’t ask me again</label>' +
                '<div class="row"><button type="button" class="btn go" data-g="yes" disabled>Show it</button><button type="button" class="btn" data-g="no">Take me back</button></div></div>';
            $('.age', box).onchange = (e) => { $('[data-g="yes"]', box).disabled = !e.target.checked; };
            box.onclick = (e) => {
                const g = e.target.dataset && e.target.dataset.g;
                if (g === 'no') window.close();
                if (g === 'yes') { if ($('.noask', box).checked) app.setUi({ boardOk: true }); box.onclick = null; build(); }
            };
        } else Promise.resolve().then(build);          // after everything below is set up

        function build() {
            box.classList.add('flush');
            box.innerHTML =
                '<div class="if-bar row">' +
                  '<button type="button" class="btn" data-v="back" title="Back to the threads" hidden>‹</button>' +
                  '<span class="if-tabs seg"><button type="button" class="btn" data-v="index">Threads</button><button type="button" class="btn" data-v="watch" title="Threads you watch">★ <span class="wn"></span></button><button type="button" class="btn" data-v="archive" title="Green threads that died">Archive</button>' +
                  '<button type="button" class="btn" data-v="reports" hidden>Reports</button></span>' +
                  '<input type="search" class="if-search" placeholder="Search threads" title="Search the threads: subject, text or number">' +
                  // The view's options: in a small panel they fold away behind ⋯.
                  '<button type="button" class="btn if-more" data-v="more" title="Order, Green only, Hidden, Fade">⋯</button>' +
                  '<span class="if-view">' +
                  '<select class="sort" title="Order"><option value="bump">Bump order</option><option value="green">Green on top</option></select>' +
                  '<label class="dim"><input type="checkbox" class="gonly"> Green only</label>' +
                  '<label class="dim" title="Show the threads you hid (✕), to bring them back"><input type="checkbox" class="shid"> Hidden <span class="hn"></span></label>' +
                  '<label class="dim fadeset" title="How far threads with nothing green fade">Fade <input type="range" class="fade" min="0.08" max="1" step="0.02"></label>' +
                  '</span>' +
                  '<span class="grow"></span>' +
                  '<button type="button" class="btn if-me" data-v="me" title="Your level" hidden></button>' +
                  '<button type="button" class="btn go" data-v="new" title="Start a green thread (only on the Interface)">＋<span class="l"> Green thread</span></button>' +
                  '<button type="button" class="btn" data-v="refresh" title="Refresh">⟳</button>' +
                  '<button type="button" class="btn" data-v="set" title="Interface settings">⚙</button>' +
                '</div><div class="if-main"></div>';
            $('.sort', box).value = prefs.sort;
            $('.gonly', box).checked = prefs.greenOnly;
            $('.fade', box).value = prefs.fade;
            box.style.setProperty('--fade', prefs.fade);
            $('.sort', box).onchange = (e) => { prefs.sort = e.target.value; savePrefs(); render(); };
            $('.gonly', box).onchange = (e) => { prefs.greenOnly = e.target.checked; savePrefs(); render(); };
            $('.shid', box).onchange = (e) => { showHidden = e.target.checked; render(); };
            $('.if-search', box).oninput = (e) => { query = e.target.value.trim().toLowerCase(); $('.if-main', box).scrollTop = 0; render(); };
            $('.if-search', box).onkeydown = (e) => { if (e.key === 'Escape' && e.target.value) { e.target.value = ''; e.target.oninput(e); } };
            $('.fade', box).oninput = (e) => { prefs.fade = Number(e.target.value); box.style.setProperty('--fade', prefs.fade); savePrefs(); };
            $('.if-bar', box).onclick = (e) => {
                const b = e.target.closest('[data-v]'); if (!b) return;
                const v = b.dataset.v;
                if (v === 'back') return go('index');
                if (v === 'new') return newThread();
                if (v === 'refresh') return refresh(true);
                if (v === 'set') return settingsSheet();
                if (v === 'me') return profile();
                if (v === 'more') { b.classList.toggle('on', $('.if-bar', box).classList.toggle('more')); return; }
                go(v);
            };
            $('.if-main', box).addEventListener('click', onMainClick);
            // A picture that's gone from 4chan: no broken-image box.
            $('.if-main', box).addEventListener('error', (e) => { if (e.target.tagName !== 'IMG') return; const f = e.target.closest('.if-file'); if (f) f.hidden = true; else e.target.style.visibility = 'hidden'; }, true);
            $('.if-main', box).addEventListener('mouseover', onHover);
            $('.if-main', box).addEventListener('contextmenu', onContext);
            $('.if-main', box).addEventListener('mouseout', (e) => { if (e.target.closest('.ql')) hidePreview(); });
            UI.onUi(() => { $('[data-v="reports"]', box).hidden = !isAdmin(); });
            $('[data-v="reports"]', box).hidden = !isAdmin();
            go('index');
            loadMe();
            // Your own replies on 4chan (in the board window) that check someone's repeats.
            app.onBoardPosted(checkBoardPosts);
            if (app.onToast) app.onToast(UI.toast);
            checkBoardPosts();
            // Light on purpose: one look a while, and none while the window is hidden.
            timer = setInterval(() => { if (!document.hidden) { refresh(false); if (!me) loadMe(); } }, 20000);
            document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
        }

        const boardRefs = (text) => [...new Set([...String(text).matchAll(/>>(\d{3,})(?!\d)/g)].map(m => Number(m[1])))]
            .filter(no => seenPosts.has(no) && /(\d)\1$/.test(String(no))).slice(0, 40).map(no => ({ no, thread: seenPosts.get(no) }));

        /** Posts you made on 4chan itself: the station reads them from 4chan and gives the (bigger) checking XP. */
        async function checkBoardPosts() {
            if (!server()) return;
            for (const p of await app.boardPosts().catch(() => [])) {
                if (p.board !== boardName()) continue;
                toServer('/api/check', { thread: p.thread, post: p.no }).then(celebrate).catch(() => {});
            }
        }

        /* ---------- you: level, XP, achievements ---------- */
        let meAsked = 0;
        async function loadMe() {
            if (!server()) return;
            meAsked = Date.now();
            try { showMe((await toServer('/api/me', {})).me); } catch { /* offline */ }
        }
        /* Opened before the station was known (One window loads with the app): ask once it is,
           and again now and then until it answers. */
        let postsChecked = false;
        core.on('state', () => {
            if (!server() || !$('.if-me', box)) return;
            if (!me && Date.now() - meAsked > 15000) loadMe();
            if (!postsChecked) { postsChecked = true; checkBoardPosts(); }      // your 4chan replies from before it was known
        }, window);
        function showMe(m) {
            if (!m) return;
            me = m;
            const b = $('.if-me', box);
            if (!b) return;
            const pct = Math.max(0, Math.min(100, Math.round((m.xp - m.from) / Math.max(1, m.next - m.from) * 100)));
            b.hidden = false;
            b.innerHTML = lvBadge(m.level) + '<span class="if-xpbar"><i style="width:' + pct + '%"></i></span>';
            b.title = 'Level ' + m.level + (m.title ? ' · ' + m.title : '') + ' — ' + (m.next - m.xp) + ' XP to level ' + (m.level + 1);
        }
        /** What a post earned: XP, a level, achievements, dubs. */
        function celebrate(r) {
            if (!r) return;
            if (r.me) showMe(r.me);
            const bits = [];
            if (r.dubs) bits.push({ dubs: 'Dubs! +22 XP', trips: 'TRIPS! +111 XP', quads: 'QUADS!!! +1111 XP' }[r.dubs]);
            const NAMED = { 2: 'dubs', 3: 'trips', 4: 'quads', 5: 'quints', 6: 'sexts' };
            for (const c of r.checks || []) bits.push('✓ Checked ' + (NAMED[Math.min(6, c.repeats)] || 'repeats') + ' (>>' + (c.no || c.id) + ')' + (c.via === '4chan' ? ' on 4chan' : '') + (c.xp ? ' +' + c.xp + ' XP' : ' (today’s checking XP is used up; it still counts)'));
            for (const a of r.earned || []) if (!/^(dubs|trips|quads)$/.test(a.id)) bits.push('🏆 ' + a.name + (a.xp ? ' +' + a.xp + ' XP' : ''));
            if (r.levelUp) {
                const k = kindOf(r.levelUp);
                bits.unshift((NAMES[k] ? '✨ LEVEL ' + r.levelUp + ' — ' + NAMES[k] + '!' : 'Level ' + r.levelUp + '!') + (r.levelUp === r.me.threadLevel ? ' You can start green threads now.' : ''));
                UI.flash();
            }
            if (r.own) bits.push('Try checking someone else’s dubs for a change!');
            if (r.again && !(r.checks || []).length) bits.push('Already checked ' + (r.again === 1 ? 'that one' : 'those ' + r.again) + ': each post counts once');
            if (bits.length) UI.toast(bits.join('  ·  '));
        }
        function profile() {
            const m = me;
            if (!m) return UI.toast('Green threads are offline right now.');
            const all = [['dubs', 'Checked', 'Your own post id ending in dubs: a green post, or your 4chan reply from the board window (+22 XP each time)'], ['trips', 'Trips get', 'Your own post id ending in trips (+111 XP each time)'], ['quads', 'Quads get', 'Your own post id ending in quads (+1111 XP each time)'],
                ['quoted11', 'Heard', 'Quoted 11 times'], ['quoted111', 'Famous', 'Quoted 111 times'], ['roamer11', 'Regular', 'Posted in 11 different green threads'],
                ['thread22', 'Conversation', 'Your thread reached 22 replies'], ['thread111', 'Legend thread', 'Your thread reached 111 replies'],
                ['checker11', 'Checker', 'Checked 11 repeats that weren’t yours'], ['checker111', 'Witness', 'Checked 111 repeats'], ['checkQuads', 'Quads witness', 'Checked quads or better'],
                ['level11', 'Thread starter', 'Level 11: start green threads'], ['level44', 'Long-lived', 'Level 44: your threads live 4 days'], ['level111', 'Trips', 'Level 111'], ['level1111', 'Quads', 'Level 1111']];
            const have = new Set(m.ach.map(a => a.id));
            // How far along the counted ones are (a station that doesn't send the counts shows none).
            const goal = { quoted11: [m.quoted, 11], quoted111: [m.quoted, 111], roamer11: [m.roamed, 11], checker11: [m.checks, 11], checker111: [m.checks, 111], level11: [m.level, 11], level44: [m.level, 44], level111: [m.level, 111], level1111: [m.level, 1111] };
            const progress = (id) => { const g = goal[id]; return g && g[0] != null && !have.has(id) ? ' <span class="dim">(' + Math.min(g[0], g[1]) + ' / ' + g[1] + ')</span>' : ''; };
            // Checking has no daily cap (a station that still has one sends checkCap).
            const checking = m.checks == null ? '' : '<p class="dim">Checking today: ' + (m.checkCap ? m.checksToday + ' / ' + m.checkCap + ' XP for dubs and trips · ' + m.chanToday + ' / ' + m.chanCap + ' on 4chan · quads and up always count'
                : (m.checksToday + m.chanToday) + ' XP' + (m.chanToday ? ' (' + m.chanToday + ' of it on 4chan)' : '')) + ' · ' + m.checks + ' check' + (m.checks === 1 ? '' : 's') + ' in all</p>';
            const pct = Math.round((m.xp - m.from) / Math.max(1, m.next - m.from) * 100);
            UI.sheet('<div class="if-prof"><h2>' + lvBadge(m.level) + ' ' + esc(m.title || 'Level ' + m.level) + '</h2>' +
                '<div class="if-xpbig"><i style="width:' + pct + '%"></i></div><p class="dim">' + m.xp + ' XP · ' + (m.next - m.xp) + ' to level ' + (m.level + 1) + ' · today ' + m.today + ' / ' + m.todayCap + ' from posting</p>' + checking +
                (m.canThread ? '<p>' + (m.thread ? 'Your live thread: <a class="ql" data-goto="g:' + esc(m.thread) + '">&gt;&gt;' + esc(m.thread) + '</a> (one at a time).' : 'You can start a green thread (one at a time).') + '</p>'
                    : '<p>Reach <b>level ' + m.threadLevel + '</b> to start green threads. Until then, post in them.</p>') +
                '<h3>How XP works</h3><p class="dim">+10 a real post (12+ characters, not a repeat), up to 120 a day · +5 when someone quotes you · +22 / +111 / +1111 when your post id ends in dubs / trips / quads (green posts, and your 4chan replies from the board window) · <b>checking</b> someone else’s repeats by quoting them (green posts, and board posts from the last day): +5 dubs, +11 trips, +22 quads, +111 quints, +1111 sexts (dubs and trips checks: up to 55 a day) · <b>double</b> for checking with a real reply on 4chan, from the board window: +11 dubs, +22 trips, +44 quads, +222 quints, +2222 sexts (up to 111 a day for dubs and trips). Milestone levels are the repeating ones: 11, 22, 33… 111, 1111, palindromes like 121 and 3113, patterns like 1313.</p>' +
                '<h3>Achievements</h3><ul class="list if-ach">' + all.map(([id, name, about]) => '<li class="' + (have.has(id) ? 'got' : '') + '">' + (have.has(id) ? '🏆' : '·') + ' <b>' + esc(name) + '</b> <span class="dim">' + esc(about) + '</span>' + progress(id) + '</li>').join('') + '</ul>' +
                '<div class="row"><button type="button" class="btn" data-close>Close</button></div></div>');
            const g = $('.sheet-card [data-goto]');
            if (g) g.onclick = () => { UI.closeSheet(); openThread(g.dataset.goto); };
        }

        /* ---------- fetching ---------- */
        const getJSON = async (url) => { try { const r = await app.getJSON(url); return r && r.json; } catch { return null; } };
        const toServer = async (path, json, admin) => {
            if (!server()) throw new Error('Green threads are offline: the station’s PC is off.');
            const r = await app.iface({ to: 'server', server: server(), station: fromStation(), path, json, admin });
            if (!r.json) throw new Error(r.text || 'The green server did not answer.');
            if (r.status >= 400) throw new Error(r.json.error || 'Error ' + r.status);
            return r.json;
        };
        async function loadIndex() {
            const b = boardName();
            await loadHidden();
            const pages = await getJSON('https://a.4cdn.org/' + b + '/catalog.json');
            if (Array.isArray(pages)) { catalog = pages.flatMap(p => (p.threads || []).map(t => Object.assign(t, { page: p.page }))); lastPage = pages.reduce((m, p) => Math.max(m, p.page || 0), 0); for (const t of catalog) { seenPosts.set(t.no, t.no); for (const r of t.last_replies || []) seenPosts.set(r.no, t.no); } }
            if (catalog.length) {
                const r = await app.iface({ to: 'fp', path: 'get.php?mode=catalog', form: { thread: catalog.map(t => t.no).join(',') } }).catch(() => null);
                if (r && r.json && typeof r.json === 'object') greenCounts = r.json;
            }
            // "Anything new since last time?" costs the station a few bytes when nothing is.
            if (server()) {
                try {
                    const j = await toServer('/api/threads?v=' + greenVer);
                    if (!j.unchanged) { green = j.threads || []; greenVer = j.version || 0; }
                } catch { /* off, busy or unreachable: keep what we had; the board still shows */ }
            }
            else green = [];
            if (!watchLoaded) { watchLoaded = true; await loadWatched(); }     // after the catalog: a thread watched in the board window starts with nothing new
            checkWatch();
        }

        async function refresh(force) {
            if (busy) return;
            busy = true;
            try {
                if (view === 'thread' && current) await loadThread(current, !force);
                else if (view === 'archive') await showArchive();
                else if (view === 'reports') await showReports();
                else { await loadIndex(); render(); }
                if (view === 'thread') loadIndex().then(() => { const el = $('.if-pg', box); if (el && current) el.innerHTML = pageTag(current.id); }).catch(() => {});   // keeps the watcher (and the page) current
            } finally { busy = false; }
        }

        /* ---------- views ---------- */
        function go(v) {
            leaveThread();
            restoreTop = view === 'thread' && listTop && listTop.view === v ? listTop.top : null;
            view = v;
            $('[data-v="back"]', box).hidden = v === 'index';
            for (const b of box.querySelectorAll('.if-tabs .btn')) b.classList.toggle('on', b.dataset.v === v);
            for (const el of box.querySelectorAll('.sort, .gonly, .shid, .fadeset, .if-search, .if-more')) (el.closest('label') || el).hidden = v !== 'index' && v !== 'watch';
            if (v === 'index' || v === 'watch') {
                $('.if-main', box).innerHTML = '<p class="dim if-load">Loading the board…</p>';
                if (catalog.length) render();
                refresh(false);
            } else if (v === 'archive') { $('.if-main', box).innerHTML = '<p class="dim if-load">Loading the archive…</p>'; refresh(false); }
            else if (v === 'reports') { $('.if-main', box).innerHTML = '<p class="dim if-load">Loading reports…</p>'; refresh(false); }
        }

        // One list: the board's threads and the green threads, by last bump (or green first).
        function threads() {
            const b = boardName();
            const list = catalog.map(t => ({
                key: 'c:' + t.no, kind: 'c', id: t.no, sub: t.sub || '', text: htmlText(t.com || ''), bumped: (t.last_modified || t.time) * 1000,
                replies: t.replies || 0, images: t.images || 0, gcount: Number(greenCounts[t.no]) || 0, sticky: !!t.sticky,
                thumb: t.tim ? 'https://i.4cdn.org/' + b + '/' + t.tim + 's.jpg' : ''
            })).concat(green.map(t => ({
                key: 'g:' + t.id, kind: 'g', id: t.id, sub: t.sub || '', text: t.text, bumped: t.bumped, replies: t.replies, images: 0,
                gcount: t.replies + 1, green: true, name: t.name, expires: t.expires, last: t.last || []
            })));
            for (const t of list) t.lit = t.green || t.gcount > 0;
            list.sort((x, y) => (prefs.sort === 'green' ? (y.lit - x.lit) : 0) || (y.sticky - x.sticky) || (y.bumped - x.bumped));
            return list;
        }

        function render() {
            const main = $('.if-main', box);
            let list = threads();
            if (view === 'watch') {
                list = list.filter(t => watch[t.key]);
                for (const k of Object.keys(watch)) if (!list.some(t => t.key === k)) list.push({ key: k, kind: k[0], id: k.slice(2), sub: watch[k].title, text: '', gone: true, replies: 0, gcount: 0 });
            } else {
                if (prefs.greenOnly) list = list.filter(t => t.lit);
                const n = list.filter(t => threadHidden(t.key)).length;
                $('.hn', box).textContent = n ? '(' + n + ')' : '';
                if (!showHidden) list = list.filter(t => !threadHidden(t.key));
            }
            if (query) list = list.filter(t => (String(t.sub) + ' ' + t.text + ' ' + t.id).toLowerCase().includes(query));
            if (!list.length) {
                main.innerHTML = '<p class="dim if-load">' + (query ? 'No threads match “' + esc(query) + '”.' : view === 'watch' ? 'You aren’t watching any threads. Open one and press ★.' : catalog.length || green.length ? 'Nothing green right now. Start a green thread, or untick “Green only”.' : 'The board didn’t answer. ⟳ to try again.') + '</p>';
                return;
            }
            main.innerHTML = '<div class="if-list">' + list.map(card).join('') + '</div>' +
                (server() ? '' : '<p class="dim if-note">Green threads are offline while the station’s PC is off. The board and its green posts still show.</p>');
            if (restoreTop != null) { main.scrollTop = restoreTop; restoreTop = null; }
        }

        // Which page of the board a thread is on: near the last page it's about to fall off, so bump it.
        function pageTag(no) {
            const t = catalog.find(x => x.no === Number(no));
            if (!t || t.sticky || !lastPage) return '';
            const low = t.page >= lastPage - 1;
            return ' <span class="if-page' + (low ? ' low' : '') + '" title="' + (low ? 'Near the last page: bump it or it falls off the board' : 'Page ' + t.page + ' of ' + lastPage) + '">p' + t.page + '/' + lastPage + '</span>' +
                (t.bumplimit ? ' <span class="dim" title="Past the bump limit: replies no longer bump it">bump limit</span>' : '');
        }

        function card(t) {
            const w = watch[t.key], fresh = w && !t.gone ? Math.max(0, (t.replies + t.gcount) - w.seen) : 0;
            const you = t.kind === 'g' && (t.last || []).some(p => quotesMine(p.text)), hidden = threadHidden(t.key);
            return '<article class="if-th' + (t.green ? ' green' : '') + (t.lit ? ' lit' : ' faded') + (t.gone ? ' gone' : '') + (hidden ? ' hid' : '') + '" data-k="' + esc(t.key) + '">' +
                (t.thumb ? '<img class="if-thumb" loading="lazy" alt="" src="' + esc(t.thumb) + '">' : '<span class="if-thumb none">' + (t.green ? '🟩' : '') + '</span>') +
                '<div class="if-th-body"><div class="if-th-head">' +
                    (t.sub ? '<b class="if-sub">' + esc(t.sub) + '</b> ' : '') +
                    '<span class="dim">' + (t.kind === 'g' ? 'No.' + esc(t.id) : 'No.' + t.id) + (t.gone ? ' · gone' : '') + '</span>' +
                    (t.kind === 'c' ? ' <span class="dim">R ' + t.replies + ' · I ' + t.images + '</span>' + pageTag(t.id) : ' <span class="dim">' + t.replies + ' repl' + (t.replies === 1 ? 'y' : 'ies') + '</span>') +
                    (t.gcount && t.kind === 'c' ? ' <span class="if-g">G ' + t.gcount + '</span>' : '') +
                    (t.green ? ' <span class="if-g">green thread</span>' : '') +
                    (fresh ? ' <span class="if-new">' + fresh + ' new</span>' : '') +
                    (you ? ' <span class="if-you">(You)</span>' : '') +
                '</div><div class="if-th-text">' + esc((t.text || '').slice(0, 300)) + '</div></div>' +
                (t.gone ? '' : '<button type="button" class="if-hide" data-hidet="' + esc(t.key) + '" title="' + (hidden ? 'Show this thread again' : 'Hide this thread') + '">' + (hidden ? '↺' : '✕') + '</button>') +
                '</article>';
        }

        /* ---------- a thread ---------- */
        async function openThread(key) {
            const kind = key[0], id = key.slice(2);
            leaveThread();
            if (view === 'index' || view === 'watch') listTop = { view, top: $('.if-main', box).scrollTop };
            current = { key, kind, id };
            view = 'thread';
            $('[data-v="back"]', box).hidden = false;
            for (const b of box.querySelectorAll('.if-tabs .btn')) b.classList.remove('on');
            for (const el of box.querySelectorAll('.sort, .gonly, .shid, .fadeset, .if-search, .if-more')) (el.closest('label') || el).hidden = true;
            $('.if-main', box).innerHTML = '<p class="dim if-load">Loading the thread…</p>';
            await loadThread(current, false);
        }

        async function loadThread(cur, keepScroll) {
            const main = $('.if-main', box);
            const scroller = $('.if-posts', box);
            const top = keepScroll && scroller ? scroller.scrollTop : 0;
            const draft = $('.if-reply textarea', box) ? { text: $('.if-reply textarea', box).value, name: $('.if-reply [name=name]', box).value, opt: $('.if-reply [name=options]', box).value } : null;
            let posts = [], head = {}, readOnly = false;
            if (cur.kind === 'c') {
                const b = boardName();
                const j = await getJSON('https://a.4cdn.org/' + b + '/thread/' + cur.id + '.json');
                if (!j || !j.posts) { main.innerHTML = '<p class="dim if-load">That thread is gone from the board (it may have died). <button type="button" class="btn" data-unwatch="' + esc(cur.key) + '">Stop watching</button></p>'; return; }
                const fp = await getJSON(FP + 'get.php?thread=' + cur.id);
                const greens = fp && typeof fp === 'object' ? Object.values(fp).filter(p => p && p.id) : [];
                const after = {};
                for (const g of greens) (after[g.after_no] = after[g.after_no] || []).push(g);
                const nos = new Set(j.posts.map(p => p.no));
                for (const n of nos) seenPosts.set(n, Number(cur.id));
                if (seenPosts.size > 20000) seenPosts.clear();
                for (const p of j.posts) {
                    posts.push(chanPost(p, b));
                    for (const g of (after[p.no] || []).sort((x, y) => x.timestamp - y.timestamp || x.id - y.id)) posts.push(fpPost(g));
                }
                for (const g of greens.filter(g => !nos.has(Number(g.after_no))).sort((x, y) => x.timestamp - y.timestamp)) posts.push(fpPost(g));
                const op = j.posts[0];
                head = { title: op.sub || htmlText(op.com || '').slice(0, 60) || 'No.' + op.no, closed: !!op.closed || !!op.archived, url: 'https://boards.4chan.org/' + b + '/thread/' + op.no };
                readOnly = !!op.archived;
                markSeen(cur.key, (op.replies || 0) + greens.length, head.title);
            } else {
                let j;
                const v = keepScroll && threadKey === cur.key ? threadVer : 0;
                try { j = await toServer('/api/thread/' + cur.id + '?v=' + v); } catch (e) { if (!keepScroll) main.innerHTML = '<p class="dim if-load">' + esc(e.message) + '</p>'; return; }
                if (j.unchanged) return;                                   // nothing new: leave the page as it is
                threadVer = j.version || 0; threadKey = cur.key;
                posts = j.posts.map(p => ourPost(p));
                const t = j.thread;
                head = { title: t.sub || t.text.slice(0, 60), green: true, expires: t.expires, archived: t.archived, closed: t.closed };
                readOnly = t.archived || t.closed;
                markSeen(cur.key, t.replies + t.replies + 1, head.title);
            }
            if (posts[0]) posts[0].op = true;                              // its opening post: hiding that is hiding the thread
            const watched = !!watch[cur.key], greenIn = posts.filter(p => p.kind === 'f').length;
            const html =
                '<div class="if-thread' + (head.green ? ' green' : '') + (cur.kind === 'c' && prefs.threadGreen ? ' gonly' : '') + '" data-key="' + esc(cur.key) + '"><div class="if-thead row">' +
                    '<b class="grow ell">' + esc(head.title) + '</b>' +
                    (cur.kind === 'c' ? '<span class="if-pg">' + pageTag(cur.id) + '</span>' : '') +
                    '<button type="button" class="btn" data-scroll="top" title="To the opening post">[Top]</button>' +
                    '<button type="button" class="btn" data-scroll="bottom" title="To the newest post">[Bottom]</button>' +
                    (head.green && !head.archived ? '<span class="dim if-exp" title="Green threads die after 3 days without a reply, then go to the archive">' + esc(expiresIn(head.expires)) + '</span>' : '') +
                    (head.archived ? '<span class="dim">archived</span>' : '') +
                    (cur.kind === 'c' ? '<button type="button" class="btn' + (prefs.threadGreen ? ' on' : '') + '" data-tgreen title="Show only the green posts (and the opening post)">🟩 Green only' + (greenIn ? ' (' + greenIn + ')' : '') + '</button>' : '') +
                    '<button type="button" class="btn" data-watch="' + esc(cur.key) + '" title="Watch this thread">' + (watched ? '★ Watching' : '☆ Watch') + '</button>' +
                    '<button type="button" class="btn" data-hidet="' + esc(cur.key) + '" title="Hide this thread from the list (in the board window too)">' + (threadHidden(cur.key) ? '↺ Unhide' : '✕ Hide') + '</button>' +
                    (head.url ? '<button type="button" class="btn" data-open4="' + esc(head.url) + '" title="This thread on 4chan, in the board window">4chan ↗</button>' : '') +
                '</div><div class="if-posts">' + posts.map(postHtml).join('') + (cur.kind === 'c' && !greenIn ? '<p class="dim if-load if-gempty">No green posts in this thread yet.</p>' : '') + '</div>' +
                (readOnly ? '<p class="dim if-note">' + (head.archived ? 'This thread is archived — read only.' : 'This thread is closed.') + '</p>' : replyForm(cur)) +
                '</div>';
            // A refresh of the same thread swaps only its heading and posts: the reply form stays as it is,
            // so whoever is typing in it keeps their place (and the cursor).
            const old = $('.if-thread', main), oldForm = old && $('.if-reply', old);
            if (keepScroll && oldForm && !readOnly && old.dataset.key === cur.key) {
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                const nu = tmp.firstChild;
                old.className = nu.className;
                old.replaceChild($('.if-thead', nu), $('.if-thead', old));
                old.replaceChild($('.if-posts', nu), $('.if-posts', old));
                $('.if-posts', old).scrollTop = top;
                return;
            }
            main.innerHTML = html;
            if (draft) { const f = $('.if-reply', box); if (f) { f.text.value = draft.text; f.name.value = draft.name; f.options.value = draft.opt; } }
            const sc = $('.if-posts', box);
            if (sc) sc.scrollTop = keepScroll ? top : threadTops.get(cur.key) || 0;
            const f = $('.if-reply', box);
            if (f) { f.onsubmit = (e) => { e.preventDefault(); sendReply(f, e.submitter && e.submitter.dataset.send); }; optionsMenu(f.options, cur); if (f.upfile) pictureField(f); }

        }

        function replyForm(cur) {
            const name = store.get('name', core.name || '');
            return '<form class="if-reply">' +
                '<div class="row"><input name="name" class="grow" maxlength="60" placeholder="Name (name#secret for a tripcode)" value="' + esc(name) + '">' +
                '<input name="options" maxlength="20" placeholder="Options" title="sage = don’t bump' + (cur.kind === 'c' ? '; numberless = hide your number' : '') + '"></div>' +
                '<textarea name="text" rows="3" maxlength="2000" placeholder="' + (cur.kind === 'c' ? 'A green post: everyone on the interface sees it (a picture too, if you like)' : 'Reply (text only)') + '"></textarea>' +
                '<div class="row">' +
                    (cur.kind === 'c'
                        ? '<button class="btn go" data-send="fp">🟩 Green post</button>' +
                          '<label class="btn if-pick" title="Add a picture to your green post (or paste one into the comment)">📎 Picture<input type="file" name="upfile" accept="image/*" hidden></label>' +
                          '<span class="if-picked" hidden><span class="dim ell"></span> <a class="if-act" data-unpick title="Remove the picture">✕</a></span>' +
                          '<button type="button" class="btn" data-open4="https://boards.4chan.org/' + boardName() + '/thread/' + cur.id + '">Reply on 4chan ↗</button>'
                        : '<button class="btn go" data-send="g">Reply</button>') +
                    '<span class="grow"></span><span class="dim if-hint">&gt;text greentext · &gt;&gt;' + (cur.kind === 'c' ? '123' : '7xK2') + ' quotes</span>' +
                '</div></form>';
        }

        /** A picture for a green post: pick one, paste one, or drop one on the form. Kept across refreshes until it's posted. */
        function pictureField(f) {
            const show = () => {
                const p = $('.if-picked', f);
                p.hidden = !attached;
                $('.ell', p).textContent = attached ? (attached.name || 'pasted picture') + ' · ' + Math.max(1, Math.round(attached.size / 1024)) + ' KB' : '';
                $('.if-pick', f).hidden = !!attached;
            };
            const take = (file) => {
                if (!file) return;
                if (!/^image\//.test(file.type)) return UI.toast('Pictures only (JPG, PNG, GIF, WebP).');
                if (file.size > PIC_MAX) return UI.toast('That picture is too big (8 MB at most).');
                attached = file; show();
            };
            f.upfile.onchange = () => { take(f.upfile.files[0]); f.upfile.value = ''; };
            f.text.addEventListener('paste', (e) => { const it = [...(e.clipboardData && e.clipboardData.items || [])].find(i => i.kind === 'file' && /^image\//.test(i.type)); if (it) { e.preventDefault(); take(it.getAsFile()); } });
            f.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
            f.addEventListener('drop', (e) => { const file = e.dataTransfer && e.dataTransfer.files[0]; if (file) { e.preventDefault(); take(file); } });
            $('[data-unpick]', f).onclick = () => { attached = null; show(); };
            show();
        }

        /** The Options field: every option, shown when you click into it. */
        function optionsMenu(input, cur) {
            const opts = (cur.kind === 'c'
                ? [['sage', 'Don’t bump the thread'], ['numberless', 'Hide your post number (shows as XXXXXX)']]
                : [['sage', 'Don’t bump the thread']]).concat(isAdmin() ? [['station', 'Post with the Station badge (moderators)']] : []);
            const menu = document.createElement('div');
            menu.className = 'if-opts';
            menu.hidden = true;
            menu.innerHTML = opts.map(([o, about]) => '<button type="button" class="if-opt" data-opt="' + o + '"><b>' + o + '</b> <span class="dim">' + esc(about) + '</span></button>').join('');
            input.parentNode.style.position = 'relative';
            input.after(menu);
            const has = () => new Set(input.value.split(/[\s,]+/).filter(Boolean));
            const mark = () => { const h = has(); for (const b of menu.children) b.classList.toggle('on', h.has(b.dataset.opt)); };
            const show = () => { mark(); menu.hidden = false; };
            input.addEventListener('focus', show);
            input.addEventListener('click', show);
            input.addEventListener('input', mark);
            input.addEventListener('blur', () => setTimeout(() => { menu.hidden = true; }, 150));
            input.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.hidden = true; });
            menu.addEventListener('mousedown', (e) => e.preventDefault());           // keep the field focused
            menu.addEventListener('click', (e) => {
                const b = e.target.closest('[data-opt]'); if (!b) return;
                const h = has(), o = b.dataset.opt;
                if (h.has(o)) h.delete(o); else h.add(o);
                input.value = [...h].join(' ');
                mark();
            });
        }

        async function sendReply(f, how) {
            const text = f.text.value.trim();
            const pic = how === 'fp' ? attached : null;
            if (!text && !pic) return UI.toast('Write something first.');
            store.set('name', f.name.value.trim());
            const btn = f.querySelector('[data-send]');
            btn.disabled = true;
            try {
                if (how === 'fp') {
                    // funposters.club: the green post goes into the 4chan thread for everyone on the interface.
                    const form = { thread: current.id, username: f.name.value.trim(), options: f.options.value.trim(), text: pic ? text : text.replace(/\r?\n/g, '\r') };
                    const file = pic ? { name: pic.name || 'image.png', type: pic.type, bytes: new Uint8Array(await pic.arrayBuffer()) } : undefined;
                    const r = await app.iface({ to: 'fp', path: 'post.php', form, file });
                    if (!/Post Successful/i.test(r.text || '')) throw new Error(r.status && r.status !== 200 ? 'funposters.club answered ' + r.status : 'Not posted: ' + htmlText(r.text || '').slice(0, 160));
                    // Checked someone's repeats in it? The station checks with 4chan and gives the XP.
                    const refs = boardRefs(text);
                    if (refs.length && server()) toServer('/api/check', { thread: Number(current.id), nos: refs.map(x => x.no), text }).then(celebrate).catch(() => {});
                } else {
                    const r = await toServer('/api/thread/' + current.id + '/reply', { name: f.name.value.trim(), options: f.options.value.trim(), text, refs: boardRefs(text), cap: isAdmin() && /^station$/i.test(f.options.value.trim()) });
                    mine.add(r.post.id); saveMine();
                    celebrate(r);
                }
                f.text.value = '';
                if (pic) attached = null;
                setWatch(current.key, true, $('.if-thead b', box) ? $('.if-thead b', box).textContent : '');
                await loadThread(current, false);
                const sc = $('.if-posts', box); if (sc) sc.scrollTop = sc.scrollHeight;
            } catch (e) { UI.toast(e.message); } finally { if (btn.isConnected) btn.disabled = false; }
        }

        async function newThread() {
            if (!server()) return UI.toast('Green threads are offline right now (the station’s PC is off).');
            await loadMe();
            if (me && !me.canThread && !isAdmin()) {
                const pct = Math.round((me.xp - me.from) / Math.max(1, me.next - me.from) * 100);
                return UI.sheet('<div><h2>🟩 Level ' + me.threadLevel + ' starts threads</h2><p>You’re ' + lvBadge(me.level) + '. Green threads are earned: post in the green threads (and the board’s green posts) to level up. Real replies get you there in a few days.</p>' +
                    '<div class="if-xpbig"><i style="width:' + pct + '%"></i></div><p class="dim">' + (me.next - me.xp) + ' XP to level ' + (me.level + 1) + '.</p>' +
                    '<div class="row"><button type="button" class="btn" data-close>OK</button></div></div>');
            }
            if (me && me.thread && !isAdmin()) return UI.toast('You already have a live thread (>>' + me.thread + '). One at a time: it frees up when it dies.');
            UI.sheet('<form><h2>🟩 New green thread</h2><p class="dim">Text only. It shows on the board for everyone using the Interface, and dies after 3 days without a reply (then it goes to the archive).</p>' +
                '<input name="sub" maxlength="100" placeholder="Subject (optional)">' +
                '<input name="name" maxlength="60" placeholder="Name (name#secret for a tripcode)" value="' + esc(store.get('name', core.name || '')) + '">' +
                '<textarea name="text" rows="6" maxlength="2000" placeholder="Comment" required></textarea>' +
                '<div class="row"><button class="btn go">Start it</button><button type="button" class="btn" data-close>Cancel</button></div></form>',
                async (f) => {
                    try {
                        store.set('name', f.name.value.trim());
                        const r = await toServer('/api/thread', { sub: f.sub.value.trim(), name: f.name.value.trim(), text: f.text.value, refs: boardRefs(f.text.value), cap: isAdmin() });
                        mine.add(r.post.id); saveMine();
                        celebrate(r);
                        watch['g:' + r.thread.id] = { title: r.thread.sub || r.thread.text.slice(0, 60), seen: 1 }; saveWatch();
                        UI.closeSheet();
                        openThread('g:' + r.thread.id);
                    } catch (e) { UI.toast(e.message); }
                });
        }

        /* ---------- posts ---------- */
        function chanPost(p, b) {
            return {
                kind: 'c', id: String(p.no), name: p.name || 'Anonymous', trip: p.trip || '', cap: p.capcode || '', time: p.time * 1000, sub: p.sub || '',
                html: clean(p.com || ''), pid: p.id || '',
                file: p.tim ? { thumb: 'https://i.4cdn.org/' + b + '/' + p.tim + 's.jpg', full: 'https://i.4cdn.org/' + b + '/' + p.tim + p.ext, name: (p.filename || '') + (p.ext || ''), w: p.w, h: p.h, tw: p.tn_w, th: p.tn_h, video: /\.(webm|mp4)$/i.test(p.ext || '') } : null
            };
        }
        function fpPost(g) {
            const numberless = g.options === 'numberless';
            const img = g.image || (g.file_url && g.thumb_url ? { file_url: g.file_url, thumb_url: g.thumb_url, filename: g.filename, thumb_width: g.tn_w, thumb_height: g.tn_h } : null);
            return {
                kind: 'f', id: numberless ? '' : g.after_no + '-' + g.id, shown: numberless ? 'XXXXXX' : g.after_no + '-' + g.id, name: g.username || 'Anonymous', trip: '', cap: g.capcode && g.capcode !== 'none' ? g.capcode : '',
                time: (Number(g.timestamp) || 0) * 1000, html: clean(String(g.text || '').replace(/\r/g, '')), report: g.id,
                file: img && /^https:\/\//.test(img.thumb_url || '') ? { thumb: img.thumb_url, full: img.file_url, name: img.filename || 'image', tw: img.thumb_width, th: img.thumb_height } : null
            };
        }
        function ourPost(p) { return { kind: 'g', id: p.id, name: p.name, trip: p.trip, cap: p.cap, lv: p.lv || 0, time: p.time, html: plain(p.text), you: mine.has(p.id) }; }

        function postHtml(p) {
            const quotedMe = /class="ql[^"]*" data-q="[^"]*"[^>]*>[^<]*\(You\)/.test(p.html);
            const hk = p.op ? '' : p.kind === 'c' ? 'r:' + p.id : p.kind === 'g' ? 'gp:' + p.id : p.report ? 'fp:' + p.report : '', hidden = !!hk && isHidden(hk);
            return '<div class="if-post ' + (p.kind === 'c' ? 'chan' : 'greenp') + (quotedMe ? ' to-you' : '') + (hidden ? ' hid' : '') + '" data-id="' + esc(p.id) + '"' + (hk ? ' data-hk="' + esc(hk) + '"' : '') + '>' +
                '<div class="if-ph">' +
                    '<b class="if-name">' + esc(p.name) + '</b>' + (p.trip ? ' <span class="if-trip">' + esc(p.trip) + '</span>' : '') +
                    (p.cap ? ' <span class="if-cap">## ' + esc(p.cap) + '</span>' : '') +
                    (p.lv ? ' ' + lvBadge(p.lv) : '') +
                    (p.you ? ' <span class="if-you">(You)</span>' : '') +
                    (p.sub ? ' <b class="if-sub">' + esc(p.sub) + '</b>' : '') +
                    ' <span class="dim">' + esc(when(p.time)) + '</span>' +
                    ' <a class="if-no" data-quote="' + esc(p.id) + '" title="Quote this post">No.' + (p.shown && p.shown !== p.id ? esc(p.shown) : idHtml(p.id, esc)) + '</a>' +
                    (p.kind === 'g' ? ' <a class="if-act" data-report="g:' + esc(p.id) + '">report</a>' + (isAdmin() ? ' <a class="if-act" data-del="' + esc(p.id) + '">delete</a> <a class="if-act" data-ban="' + esc(p.id) + '">ban</a>' : '') : '') +
                    (p.kind === 'f' && p.report ? ' <a class="if-act" data-report="f:' + esc(String(p.report)) + '">report</a>' : '') +
                    (p.file ? ' <a class="if-act" data-save="' + esc(p.file.full) + '" data-name="' + esc(p.file.name || '') + '" title="Save the picture to your computer (or right-click it)">↓ save</a>' : '') +
                    (hk ? ' <a class="if-act" data-hidep="' + esc(hk) + '" title="' + (hidden ? 'Show this post again' : 'Hide this post') + '">' + (hidden ? 'show' : 'hide') + '</a>' : '') +
                '</div>' +
                (p.file ? '<a class="if-file" data-full="' + esc(p.file.full) + '" data-video="' + (p.file.video ? 1 : '') + '" title="' + esc(p.file.name || '') + '"><img loading="lazy" alt="" src="' + esc(p.file.thumb) + '"' + (p.file.tw ? ' width="' + p.file.tw + '" height="' + p.file.th + '"' : '') + '></a>' : '') +
                '<div class="if-text">' + p.html + '</div></div>';
        }

        /* ---------- text: 4chan's HTML made safe, our plain text formatted ---------- */
        const ql = (id) => '<a class="ql" data-q="' + esc(id) + '">&gt;&gt;' + esc(id) + (mine.has(id) ? ' (You)' : '') + '</a>';
        // Web addresses in text, up to (not including) a closing bracket or the full stop after one.
        const URL_RE = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]}]/g;
        const quotes = (h) => h.replace(new RegExp('&gt;&gt;' + ID_RE + '(?![\\w-])', 'g'), (m, id) => ql(id));
        /** A YouTube link's video (and where to start, in seconds), or null. */
        function ytOf(u) {
            const m = /^https?:\/\/(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i.exec(u);
            if (!m) return null;
            const t = /[?&#]t=(?:(\d+)h)?(?:(\d+)m)?(\d+)?s?(?:&|$)/.exec(u);
            return { id: m[1], start: t ? (+t[1] || 0) * 3600 + (+t[2] || 0) * 60 + (+t[3] || 0) : 0 };
        }
        /** 4chan's [Embed] after a YouTube link: a player in the post, on asking. */
        const ytToggle = (u) => { const y = ytOf(u); return y ? ' [<a class="ext" data-yt="' + y.id + '" data-start="' + y.start + '">Embed</a>]' : ''; };
        function toggleYT(a) {
            if (a.__player) { a.__player.remove(); a.__player = null; a.textContent = 'Embed'; return; }
            const p = document.createElement('div');
            p.className = 'if-ytbox';
            p.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(a.dataset.yt) + '?autoplay=1&rel=0' + (+a.dataset.start ? '&start=' + (+a.dataset.start) : '') +
                '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
            // After the "]": split it off whatever text follows, and put the player there.
            let after = a.nextSibling;
            if (after && after.nodeType === 3 && after.data.startsWith(']') && after.data.length > 1) after.splitText(1);
            a.parentNode.insertBefore(p, after ? after.nextSibling : null);
            a.__player = p;
            a.textContent = 'Remove';
        }
        /** Plain text as HTML: escaped, with its quotes and web addresses made links (not inside a link already). */
        function textHtml(raw, inLink) {
            if (inLink) return esc(raw);
            let out = '', i = 0;
            for (const m of raw.matchAll(URL_RE)) {
                out += quotes(esc(raw.slice(i, m.index))) + '<a class="ext" data-href="' + esc(m[0]) + '">' + esc(m[0]) + '</a>' + ytToggle(m[0]);
                i = m.index + m[0].length;
            }
            return out + quotes(esc(raw.slice(i)));
        }
        function clean(html) {
            // 4chan breaks long addresses with <wbr>: join them up again first, so they read as one link.
            const doc = new DOMParser().parseFromString('<div>' + String(html).replace(/<wbr\s*\/?>/gi, '') + '</div>', 'text/html');
            const walk = (node, inLink) => {
                let out = '';
                for (const n of node.childNodes) {
                    if (n.nodeType === 3) { out += textHtml(n.data, inLink); continue; }
                    if (n.nodeType !== 1) continue;
                    const t = n.tagName.toLowerCase();
                    if (t === 'br') { out += '<br>'; continue; }
                    if (t === 'script' || t === 'style') continue;
                    const q = new RegExp('^>>' + ID_RE + '$').exec((n.textContent || '').replace(/\s*\(You\)$/, '').trim());
                    if (t === 'a') {
                        const h = n.getAttribute('href') || '';
                        // >>>/board/123 and >>>/board/: 4chan pages, for the board window.
                        const board = /^\/\/boards\.4chan(nel)?\.org\//.test(h) ? 'https:' + h : /^\/[a-z0-9]+\//i.test(h) ? 'https://boards.4chan.org' + h : '';
                        if (q) out += ql(q[1]);
                        else if (board) out += '<a class="ext" data-open4="' + esc(board) + '">' + walk(n, true) + '</a>';
                        else if (/^https?:\/\//.test(h)) out += '<a class="ext" data-href="' + esc(h) + '">' + walk(n, true) + '</a>' + ytToggle(h);
                        else out += walk(n, inLink);
                        continue;
                    }
                    const inner = walk(n, inLink);
                    if (t === 'span') out += /\bquote\b/.test(n.className) ? '<span class="gt">' + inner + '</span>' : /deadlink/.test(n.className) ? '<span class="dead">' + inner + '</span>' : inner;
                    else if (t === 's') out += '<s class="spoiler">' + inner + '</s>';
                    else if (t === 'b' || t === 'strong') out += '<b>' + inner + '</b>';
                    else if (t === 'i' || t === 'em') out += '<i>' + inner + '</i>';
                    else if (t === 'u') out += '<u>' + inner + '</u>';
                    else if (t === 'pre' || t === 'code') out += '<pre>' + inner + '</pre>';
                    else out += inner;
                }
                return out;
            };
            return walk(doc.body.firstChild || doc.body);
        }
        function plain(text) {
            return String(text || '').split('\n').map(line => {
                let h = textHtml(line);
                if (/^&gt;(?!&gt;)/.test(esc(line))) h = '<span class="gt">' + h + '</span>';
                return h;
            }).join('<br>');
        }
        function htmlText(html) { const d = new DOMParser().parseFromString('<div>' + String(html).replace(/<br\s*\/?>/gi, '\n') + '</div>', 'text/html'); return (d.body.textContent || '').replace(/\s+/g, ' ').trim(); }
        const quotesMine = (text) => [...String(text || '').matchAll(new RegExp('>>' + ID_RE, 'g'))].some(m => mine.has(m[1]));

        const when = (ms) => { if (!ms) return ''; const d = new Date(ms); return d.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
        function expiresIn(t) {
            const left = t - Date.now();
            if (left <= 0) return 'dying';
            const h = Math.floor(left / 3600e3), d = Math.floor(h / 24);
            return 'dies in ' + (d ? d + 'd ' + (h % 24) + 'h' : h ? h + 'h' : Math.ceil(left / 60e3) + 'm') + ' without a reply';
        }

        /* ---------- clicks: open, quote, jump, images, links, watch, moderate ---------- */
        async function onMainClick(e) {
            const t = e.target;
            // The end of a drag that selected text (to copy it) is not a click on what's under it.
            const sel = getSelection();
            if (sel && !sel.isCollapsed && String(sel).trim() && !t.closest('button')) return;
            const sb = t.closest('[data-scroll]');
            if (sb) { const p = $('.if-posts', box); if (p) p.scrollTo({ top: sb.dataset.scroll === 'top' ? 0 : p.scrollHeight }); return; }
            const hb = t.closest('[data-hidet], [data-hidep]');
            if (hb) {
                if (hb.dataset.hidep) { setHide(hb.dataset.hidep, !isHidden(hb.dataset.hidep)); return applyHidden(); }
                const key = hb.dataset.hidet, on = !threadHidden(key);
                setHide(tk(key), on);
                if (view === 'thread' && on) { UI.toast('Hidden. Tick “Hidden” over the list to see it again.'); return go('index'); }
                return applyHidden();
            }
            const card = t.closest('.if-th');
            if (card) return card.classList.contains('gone') ? (setWatch(card.dataset.k, false), render()) : openThread(card.dataset.k);
            const a = t.closest('a, button');
            if (!a) return;
            const d = a.dataset;
            if (d.q) return jump(d.q);
            if (d.quote !== undefined) { const ta = $('.if-reply textarea', box); if (ta && d.quote) { ta.value += (ta.value && !ta.value.endsWith('\n') ? '\n' : '') + '>>' + d.quote + '\n'; ta.focus(); } return; }
            if (d.full) {
                const img = a.querySelector('img'), open = a.classList.toggle('big');
                if (d.video) { if (open) { a.insertAdjacentHTML('afterend', '<video class="if-vid" controls autoplay loop src="' + esc(d.full) + '"></video>'); a.hidden = true; } return; }
                if (open) { img.dataset.thumb = img.src; img.removeAttribute('width'); img.removeAttribute('height'); img.src = d.full; } else { img.src = img.dataset.thumb; }
                return;
            }
            if (d.save) return saveImage(d.save, d.name);
            if (d.tgreen !== undefined) {
                prefs.threadGreen = !prefs.threadGreen; savePrefs();
                a.classList.toggle('on', prefs.threadGreen);
                $('.if-thread', box).classList.toggle('gonly', prefs.threadGreen);
                return;
            }
            if (d.yt) return toggleYT(a);
            if (d.href) return app.openExternal(d.href);
            if (d.open4) return app.boardGoto(d.open4);
            if (d.watch) { setWatch(d.watch, !watch[d.watch], $('.if-thead b', box) ? $('.if-thead b', box).textContent : ''); a.textContent = watch[d.watch] ? '★ Watching' : '☆ Watch'; updateWatchCount(); return; }
            if (d.unwatch) { setWatch(d.unwatch, false); return go('index'); }
            if (d.report) {
                const [k, id] = [d.report[0], d.report.slice(2)];
                if (k === 'f') return app.openExternal('https://sys.funposters.club/sius/imgboard.php?mode=interface_report&no=' + encodeURIComponent(id));
                const reason = await ask('Report >>' + id, 'Why? (the station’s moderators see this)', 'spam');
                if (reason == null) return;
                try { await toServer('/api/report', { id, reason }); UI.toast('Reported. Thanks.'); } catch (err) { UI.toast(err.message); }
                return;
            }
            if (d.del) { if (!confirm('Delete >>' + d.del + '? (The opening post deletes the whole thread.)')) return; try { const r = await toServer('/api/admin/delete', { id: d.del }, true); UI.toast('Deleted.'); if (r.thread) go('index'); else loadThread(current, true); } catch (err) { UI.toast(err.message); } return; }
            if (d.ban) {
                const hours = await ask('Ban the poster of >>' + d.ban, 'For how many hours? (0 = for good). Their post is deleted too.', '24');
                if (hours == null) return;
                try { await toServer('/api/admin/ban', { id: d.ban, hours: Number(hours) || 0, reason: 'Banned from the green threads' }, true); UI.toast('Banned.'); loadThread(current, true); } catch (err) { UI.toast(err.message); }
                return;
            }
            if (d.dismiss) { try { await toServer('/api/admin/dismiss', { id: d.dismiss }, true); showReports(); } catch (err) { UI.toast(err.message); } return; }
            if (d.goto) return openThread(d.goto);
        }

        async function saveImage(url, name) {
            try { const r = await app.saveImage(url, name); if (r) UI.toast('Saved ' + r + '.'); } catch (e) { UI.toast(String(e.message || e).replace(/^Error invoking remote method '[\w-]+': (Error: )?/, '')); }
        }
        function onContext(e) {
            const f = e.target.closest('.if-file, .if-vid');
            if (!f) return;
            e.preventDefault();
            const url = f.dataset.full || f.getAttribute('src'), post = f.closest('.if-post'), s = post && post.querySelector('[data-save]');
            app.imageMenu(url, s ? s.dataset.name : '');
        }

        async function jump(id) {
            const el = box.querySelector('.if-post[data-id="' + CSS.escape(id) + '"]');
            if (el) { el.classList.add('shown'); el.scrollIntoView({ block: 'center' }); el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl'); return; }
            if (/^\d+$/.test(id)) return openThread('c:' + id);                          // another 4chan thread
            if (/[a-zA-Z]/.test(id) && server()) {                                        // a green thread's opening post
                try { await toServer('/api/thread/' + id); return openThread('g:' + id); } catch { /* a reply elsewhere */ }
            }
            UI.toast('>>' + id + ' isn’t in this thread.');
        }

        let preview = null;
        function onHover(e) {
            const q = e.target.closest('.ql');
            if (!q) return;
            const el = box.querySelector('.if-post[data-id="' + CSS.escape(q.dataset.q) + '"]');
            if (!el) return;
            hidePreview();
            preview = el.cloneNode(true);
            preview.classList.add('if-preview');
            document.body.appendChild(preview);
            const r = q.getBoundingClientRect(), w = Math.min(520, window.innerWidth - 20);
            preview.style.width = w + 'px';
            preview.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 10)) + 'px';
            const below = r.bottom + 6, h = preview.offsetHeight;
            preview.style.top = (below + h < window.innerHeight ? below : Math.max(8, r.top - h - 6)) + 'px';
        }
        function hidePreview() { if (preview) { preview.remove(); preview = null; } }

        /** A one-line question in a sheet (Electron has no prompt()). Resolves to the answer, or null. */
        function ask(title, label, value) {
            return new Promise((resolve) => {
                let done = false;
                const finish = (v) => { if (!done) { done = true; resolve(v); } };
                UI.sheet('<form><h2>' + esc(title) + '</h2><label>' + esc(label) + '<input name="a" maxlength="200" value="' + esc(value || '') + '"></label>' +
                    '<div class="row"><button class="btn go">OK</button><button type="button" class="btn" data-close>Cancel</button></div></form>',
                    (f) => { const v = f.a.value; finish(v); UI.closeSheet(); }, () => finish(null));
            });
        }

        /* ---------- watching ---------- */
        /** Hiding changed (here or in the board window): the list again, or the posts in this thread. */
        function applyHidden() {
            if (view === 'index' || view === 'watch') return render();
            if (view !== 'thread') return;
            for (const el of box.querySelectorAll('.if-post[data-hk]')) {
                const on = isHidden(el.dataset.hk), a = el.querySelector('[data-hidep]');
                el.classList.toggle('hid', on);
                if (a) { a.textContent = on ? 'show' : 'hide'; a.title = on ? 'Show this post again' : 'Hide this post'; }
            }
            const b = $('.if-thead [data-hidet]', box);
            if (b && current) b.textContent = threadHidden(current.key) ? '↺ Unhide' : '✕ Hide';
        }
        function markSeen(key, count, title) { if (watch[key]) { watch[key].seen = count; if (title) watch[key].title = title; saveWatch(); updateWatchCount(); } }
        function checkWatch() {
            let fresh = 0, you = false;
            for (const t of threads()) {
                if (!watch[t.key]) continue;
                fresh += Math.max(0, (t.replies + t.gcount) - watch[t.key].seen);
                if (t.kind === 'g' && (t.last || []).some(p => quotesMine(p.text))) you = true;
            }
            updateWatchCount(fresh);
            if (fresh || you) UI.flash();
        }
        function updateWatchCount(n) {
            if (n === undefined) { n = 0; for (const t of threads()) if (watch[t.key]) n += Math.max(0, (t.replies + t.gcount) - watch[t.key].seen); }
            const el = $('.wn', box); if (el) el.textContent = n ? n : '';
        }

        /* ---------- archive and reports ---------- */
        async function showArchive() {
            const main = $('.if-main', box);
            if (!server()) { main.innerHTML = '<p class="dim if-load">The archive keeps green threads that died. It’s offline while the station’s PC is off.</p>'; return; }
            let j;
            try { j = await toServer('/api/archive'); } catch (e) { main.innerHTML = '<p class="dim if-load">' + esc(e.message) + '</p>'; return; }
            main.innerHTML = j.threads.length ? '<div class="if-list">' + j.threads.map(t => card({ key: 'g:' + t.id, kind: 'g', id: t.id, sub: t.sub, text: t.text, replies: t.replies, gcount: 0, green: true, lit: true })).join('') + '</div><p class="dim if-note">' + j.total + ' archived green thread' + (j.total === 1 ? '' : 's') + '.</p>' : '<p class="dim if-load">Nothing in the archive yet.</p>';
        }
        async function showReports() {
            const main = $('.if-main', box);
            let j;
            try { j = await toServer('/api/admin/reports', undefined, true); } catch (e) { main.innerHTML = '<p class="dim if-load">' + esc(e.message) + '</p>'; return; }
            main.innerHTML = j.reports.length ? '<ul class="list if-reports">' + j.reports.map(r => '<li><b>&gt;&gt;' + esc(r.id) + '</b> <span class="dim">' + esc(when(r.at)) + ' — ' + esc(r.reason || '') + '</span><div class="if-text">' + esc(r.text) + '</div>' +
                '<div class="row"><button type="button" class="btn" data-goto="g:' + esc(r.thread) + '">Open thread</button><button type="button" class="btn" data-del="' + esc(r.id) + '">Delete</button><button type="button" class="btn" data-ban="' + esc(r.id) + '">Ban</button><button type="button" class="btn" data-dismiss="' + esc(r.id) + '">Dismiss</button></div></li>').join('') + '</ul>'
                : '<p class="dim if-load">No reports.</p>';
        }

        /* ---------- settings ---------- */
        function settingsSheet() {
            const st = extras().interface && extras().interface.server;
            UI.sheet('<form><h2>🟩 Interface settings</h2>' +
                '<label>Green-thread server<input name="server" placeholder="' + esc(st || 'the station’s own PC') + '" value="' + esc(UI.info.ui.ifaceServer || '') + '"></label>' +
                '<p class="dim">Leave it empty to use the station’s' + (st ? ' (' + esc(st) + ')' : ' own PC, through its tunnel') + '.</p>' +
                '<label>Station token (moderators only)<input name="token" type="password" autocomplete="off" placeholder="' + (isAdmin() ? 'saved — type a new one to replace it, or clear it' : 'not set') + '"></label>' +
                '<label><input type="checkbox" name="clear"> Forget the token</label>' +
                '<p class="dim">The token is in the studio: Settings → Green threads → Copy moderator token. It stays on this computer and is only sent to the server it was saved for. With it you can delete, ban and read reports; “station” in Options gives your post the Station badge.</p>' +
                '<div class="row"><button class="btn go">Save</button><button type="button" class="btn" data-close>Cancel</button></div></form>',
                async (f) => {
                    const s = f.server.value.trim().replace(/\/+$/, '');
                    if (s && !/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(s)) return UI.toast('Use an https:// address.');
                    await app.setUi({ ifaceServer: s });
                    UI.info.ui.ifaceServer = s;
                    if (f.clear.checked) await app.ifaceToken('', '', false);
                    else if (f.token.value.trim()) { if (!server()) return UI.toast('Green threads are offline right now; try again when the station’s PC is on.'); await app.ifaceToken(server(), f.token.value.trim(), fromStation()); }
                    UI.closeSheet(); UI.toast('Saved.');
                    setTimeout(() => { $('[data-v="reports"]', box).hidden = !isAdmin(); refresh(true); }, 200);
                });
        }

        window.addEventListener('beforeunload', () => clearInterval(timer));
    };
})();
