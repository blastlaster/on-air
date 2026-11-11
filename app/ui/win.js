/* =============================================================
   THE STATION'S WINDOWS — one page, told which part to be
   (win.html?w=chat). The radio opened this window, so the
   station is the radio's: window.opener.core.
   ============================================================= */
(async function () {
    'use strict';
    const app = window.onairApp, { $, esc, clock, mmss } = UI;
    const id = new URLSearchParams(location.search).get('w') || '';
    // A panel of the one window is a frame in it: the station is its parent's.
    const panel = window.parent !== window && /[?&]panel=1/.test(location.search);
    const core = panel ? window.parent.core : window.opener && window.opener.core;
    // A view that closes itself ("Take me back") hides its panel instead.
    if (panel) window.close = () => { try { window.parent.onairOne.close(id); } catch { /* not ready */ } };
    const VIEWS = { chat, request, playlist, studio, banner, albums, board, tv, links, settings, interface: (box) => window.IfaceView(box, { app, core }), hall: (box) => window.HallView(box, { app, core }) };
    if (!core || !VIEWS[id]) { window.close(); return; }
    const meta = ELEMENTS.find(e => e.id === id) || { label: id, icon: '' };
    document.body.classList.add('el-' + id);
    await UI.init({ id, panel, title: meta.label, icon: meta.icon, barExtra: id === 'tv' ? '<button type="button" data-tv="full" title="Fullscreen">⛶</button>'
        : id === 'chat' ? '<button type="button" data-sound></button><button type="button" data-hall title="blug.dj/jej: walk around, dance, and talk out of your character’s mouth">🕺</button>' : '' });
    if (id === 'chat') {
        $('.bar [data-hall]').onclick = () => app.openElement('hall');
        // 🔔: a sound for new chat messages (the same switch as Settings → Alerts).
        const sb = $('.bar [data-sound]');
        const paintSound = () => { const on = !!UI.info.ui.chatSound; sb.textContent = on ? '🔔' : '🔕'; sb.title = on ? 'A sound plays for new chat messages — click to turn it off' : 'Click for a sound when new chat messages come in'; };
        sb.onclick = () => { const on = !UI.info.ui.chatSound; app.setUi({ chatSound: on }); if (on && window.LT && LT.chime) LT.chime(); };
        paintSound(); UI.onUi(paintSound);
    }
    const body = $('.body');
    const on = (ev, fn) => core.on(ev, fn, window);
    on('toast', (m) => { if (document.hasFocus()) UI.toast(m); });
    // The station's picture emotes, into this window's LT before any chat draws (core redraws the chat when they change).
    let emotesKey = '';
    const syncEmotes = () => { if (core.emotesKey !== emotesKey && window.LT && LT.setEmotes) { emotesKey = core.emotesKey; LT.setEmotes(core.emotes, core.engine); } };
    syncEmotes();
    on('chat', syncEmotes);
    VIEWS[id](body);

    /* =========================================================
       CHAT — the live room during a show (the station's own),
       the community's Chattable room the rest of the time
       ========================================================= */
    function chat(box) {
        let mode = '';
        box.innerHTML = '<div class="chat"><div class="pinned" hidden></div><ol class="log"></ol>' +
            '<form class="say"><input maxlength="400" placeholder="Say something…" autocomplete="off"><button type="button" class="btn times" title="Show the time on messages">🕒</button><button class="btn go">Send</button></form></div>' +
            '<div class="chattable" hidden></div><div class="empty" hidden>Chat opens when the station is on.</div>';
        const log = $('.log', box), say = $('.say', box), room = $('.chattable', box);
        if (window.LT && LT.stickToBottom) LT.stickToBottom(log);           // opens at the newest line, and stays there
        // The time on each message: off unless you switch it on (shared with blug.dj/jej's chat).
        const timesBtn = $('.times', say);
        const paintTimes = () => {
            let on = false;
            try { on = localStorage.getItem('ltl.chatTimes') === '1'; } catch { /* default */ }
            log.classList.toggle('times', on); timesBtn.classList.toggle('on', on);
        };
        paintTimes();
        timesBtn.onclick = () => {
            try { localStorage.setItem('ltl.chatTimes', log.classList.contains('times') ? '0' : '1'); } catch { /* full */ }
            paintTimes();
        };
        window.addEventListener('storage', (e) => { if (e.key === 'ltl.chatTimes') paintTimes(); });

        function line(m) {
            const li = document.createElement('li');
            li.dataset.mid = m.id;
            li.className = 'msg msg--' + m.role;
            if (m.role === 'system') li.innerHTML = '<span class="sys">' + esc(m.text) + '</span>';
            else li.innerHTML = '<b style="color:' + esc(m.color || '') + '">' + esc(m.name) + '</b>' +
                (m.role === 'host' || m.role === 'cohost' ? '<span class="tag">' + (m.role === 'host' ? 'DJ' : 'co-host') + '</span>' : '') +
                (m.role === 'request' ? '<span class="tag">request</span>' : '') + ' ' + (LT.chatHtml ? LT.chatHtml(m.text) : esc(m.text)) +
                (m.ts || m.at ? '<span class="when">' + clock(m.ts || m.at) + '</span>' : '');
            return li;
        }
        function add(m) {
            const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
            log.appendChild(line(m));
            while (log.children.length > 150) log.removeChild(log.firstChild);
            if (atBottom) log.scrollTop = log.scrollHeight;
        }
        function reset(list) { log.innerHTML = ''; (list || []).forEach(add); log.scrollTop = log.scrollHeight; }
        function pins(list) {
            const p = $('.pinned', box);
            p.hidden = !(list && list.length);
            p.innerHTML = (list || []).map(x => '<div class="pin">📌 ' + (x.name ? '<b>' + esc(x.name) + ':</b> ' : '') + (LT.richText ? LT.richText(x.text) : esc(x.text)) + '</div>').join('');
        }
        reset(core.chat); pins(core.pins);
        on('chat', (c) => {
            if (c.reset) reset(c.reset);
            else if (c.add) { add(c.add); if (mode === 'station') UI.flash(); }
            else if (c.hide) { const li = log.querySelector('[data-mid="' + CSS.escape(String(c.hide)) + '"]'); if (li) li.remove(); }
        });
        on('pins', pins);
        const sayBox = LT.chatInput(say.querySelector('input'));            // :emoji: suggestions, Shift+↑ history
        say.onsubmit = (e) => {
            e.preventDefault();
            const t = say.querySelector('input'), typed = t.value, text = LT.emojiCodes(typed);
            if (!text.trim()) return;
            const go = () => { if (core.chatSend(text)) { t.value = ''; sayBox.sent(typed); } else UI.toast('Chat is reconnecting…'); };
            if (!core.name) UI.askName(core, go); else go();
        };

        // Chattable, in the window's look (it takes a stylesheet by message).
        function chattableCss() {
            const L = window.LOOKS || {}, base = L.chattableCss || '';
            const HUD = { bg: 'transparent', msg: 'rgba(0,0,0,0.38)', text: '#fff', name: '#7dfff2', sent: '#ffd6f5', line: 'rgba(255,255,255,0.35)', font: '"Segoe UI", Arial, sans-serif', input: 'rgba(0,0,0,0.5)', inputText: '#fff', banner: 'rgba(0,0,0,0.35)', time: '#d0d0d0' };
            const p = UI.skin === 'hud' ? HUD : (L.chatLooks || {})[UI.skin];
            if (!p) return base;
            return base + `
body, #background { background: ${p.bg} !important; color: ${p.text} !important; font-family: ${p.font} !important; }
#top_banner { background: ${p.banner} !important; }
.allMessages { background: ${p.msg} !important; color: ${p.text} !important; border-left-color: ${p.line} !important; border-radius: 4px !important; }
.allMessages.sent { background: ${p.msg} !important; border-left-color: ${p.name} !important; }
.senderInfo { color: ${p.name} !important; text-shadow: none !important; }
.sent .senderInfo { color: ${p.sent} !important; text-shadow: none !important; }
.msgBody { color: ${p.text} !important; }
.msgBody a { color: ${p.sent} !important; }
.allMessages[time]::before { color: ${p.time} !important; }
#input { background: ${p.input} !important; color: ${p.inputText} !important; border-color: ${p.line} !important; caret-color: ${p.name} !important; font-family: ${p.font} !important; }
#input:empty::before { color: ${p.time} !important; }
#emojiTray, #settingsMenu, #settingsWindow, .dialogueModal, .ctxMenuOption { background: ${p.bg} !important; color: ${p.text} !important; border-color: ${p.line} !important; }
#scrollToBottom, #loadMore { background: ${p.line} !important; color: ${p.bg} !important; }
`;
        }
        function pushCss(frame, n) {
            try { frame.contentWindow.postMessage(chattableCss(), 'https://iframe.chat'); } catch { /* not ready */ }
            if (n > 0) setTimeout(() => pushCss(frame, n - 1), 700);
        }
        UI.onLook(() => { const f = room.firstChild; if (f) pushCss(f, 1); });
        // Your name (Settings → You) is your Chattable handle too. Chattable says
        // what it calls you ('init', 'updateName'); tell it when that differs.
        let ctName = null;
        function syncName() {
            const f = room.firstChild, n = core.name;
            if (!f || !n || n === ctName) return;
            try { f.contentWindow.postMessage({ type: 'setName', value: n }, 'https://iframe.chat'); ctName = n; } catch { /* not ready */ }
        }
        window.addEventListener('message', (e) => {
            if (e.origin !== 'https://iframe.chat' || !e.data || typeof e.data !== 'object') return;
            if (e.data.type === 'init' || e.data.type === 'updateName') { ctName = String(e.data.name || ''); syncName(); }
        });
        on('state', syncName);

        function show(s) {
            const m = s.chatMode;
            say.querySelector('input').placeholder = 'Say something to ' + (s.name || 'the show') + '…';
            if (m === mode) return;
            mode = m;
            $('.chat', box).hidden = m !== 'station';
            room.hidden = m !== 'chattable';
            $('.empty', box).hidden = m !== 'none';
            box.classList.toggle('flush', m === 'chattable');
            if (m === 'chattable') {
                // Built when first needed; loaded again when coming back from a show so it fits.
                if (!room.firstChild) {
                    room.innerHTML = '<iframe title="Chat" src="https://iframe.chat/embed?chat=' + encodeURIComponent(s.room) + '"></iframe>';
                    const f = room.firstChild;
                    f.addEventListener('load', () => pushCss(f, 4));
                } else room.firstChild.src = room.firstChild.src;
            }
            if (m === 'station') log.scrollTop = log.scrollHeight;
        }
        on('state', show); show(core.state);
    }

    /* =========================================================
       REQUEST — off air the hosting panel's library (AutoDJ
       plays it); live, the studio's library into the DJ's queue
       ========================================================= */
    function request(box) {
        let kind = '';
        function show(s) {
            const k = !s.requestMode ? 'off' : s.requestMode === 'autodj' ? 'autodj' : 'station-' + (s.requestKind || 'free');
            if (k === kind) return;
            kind = k;
            if (k === 'off') box.innerHTML = '<div class="empty">Requests are closed right now.</div>';
            else if (k === 'autodj') autodjBrowser(box);
            else stationRequest(box, s);
        }
        on('state', show); show(core.state);
    }

    /** The request picker over the library index (LT.songPicker); without one, the panel's own search. */
    async function autodjBrowser(box) {
        box.innerHTML = '<div class="empty">Loading the music…</div>';
        const lib = await core.loadLibrary().catch(() => null);
        if (!lib || !window.LT || !LT.songPicker) return autodjPaged(box);
        const api = core.panelApi, sid = core.panelServer;
        LT.songPicker(box, {
            lib, go: 'btn go', quiet: 'btn', list: 'list', toast: UI.toast,
            name: () => core.name, setName: (n) => core.setName(n),
            send: async (t, message, ok, again) => {
                try {
                    const res = await fetch(api + '/track_requests/', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        // The same fields the panel's own request widget sends.
                        body: JSON.stringify({ server_id: sid, person: core.name, message, music_id: t.id, ip_timeout: 0, track_timeout: 0 })
                    });
                    let d = {}; try { d = await res.json(); } catch { /* empty */ }
                    if (res.ok) ok();
                    else if (d.track_blocked) again('That one was played or asked for recently. Pick another.');
                    else if (d.ip_blocked) again('You have requested recently — try again a little later.');
                    else again('The request did not go through. Try again.');
                } catch { again('Could not reach the request line.'); }
            }
        });
    }

    function autodjPaged(box) {
        const api = core.panelApi, sid = core.panelServer, PAGE = 12;
        let page = 0, pages = 1, total = 0, q = '', rows = [], seq = 0, timer = 0, openRow = -1;
        const done = {};
        box.innerHTML = '<div class="rq">' +
            '<input class="rq-q" type="search" maxlength="80" placeholder="Search by title, artist or album…" autocomplete="off">' +
            '<p class="rq-count hint"></p><ul class="list rq-list"></ul>' +
            '<div class="row rq-pager"><button type="button" class="btn" data-go="-1">‹ Prev</button><span class="rq-page dim grow"></span><button type="button" class="btn" data-go="1">Next ›</button></div></div>';
        const el = (c) => box.querySelector('.' + c);
        async function load() {
            const my = ++seq;
            el('rq-list').innerHTML = '<li class="dim">Loading…</li>';
            try {
                const r = await fetch(api + '/music/?limit=' + PAGE + '&offset=' + (page * PAGE) + '&search_q=' + encodeURIComponent(q) +
                    '&server=' + sid + '&with_tags_only=true&requestable=true&order=1');
                const j = await r.json();
                if (my !== seq) return;
                rows = j.results || [];
                total = typeof j.count === 'number' ? j.count : rows.length;
                pages = Math.max(1, Math.ceil(total / PAGE));
                openRow = -1;
                draw();
                el('rq-list').scrollTop = 0;
            } catch {
                if (my === seq) el('rq-list').innerHTML = '<li class="dim">Could not reach the request line. Try again in a moment.</li>';
            }
        }
        function draw() {
            el('rq-count').textContent = q ? total + (total === 1 ? ' song' : ' songs') + ' found for “' + q + '”' : total + ' songs to choose from';
            el('rq-list').innerHTML = rows.length ? rows.map((r, i) => {
                const pic = r.image_medium || r.tag_image || '';
                const sub = [r.author, r.album].filter(Boolean).join(' · ') + (r.year && +r.year > 0 ? ' (' + r.year + ')' : '');
                const asked = done[r.id];
                return '<li class="rq-item' + (openRow === i ? ' open' : '') + '">' +
                    (pic ? '<img class="thumb" loading="lazy" alt="" src="' + esc(pic) + '">' : '<span class="thumb"></span>') +
                    '<span class="grow"><b class="ell" style="display:block">' + esc(r.title || r.meta || r.filename) + '</b>' + (sub ? '<span class="dim ell" style="display:block;font-size:.85em">' + esc(sub) + '</span>' : '') + '</span>' +
                    (r.length ? '<span class="dim" style="font-size:.8em">' + mmss(r.length / 1000) + '</span>' : '') +
                    '<button type="button" class="btn' + (asked ? '' : ' go') + '" data-req="' + i + '"' + (asked ? ' disabled' : '') + '>' + (asked ? 'Requested ✓' : 'Request') + '</button>' +
                    (openRow === i ? '<form class="rq-form" data-form="' + i + '"><input name="n" maxlength="30" placeholder="Your name (optional)" value="' + esc(core.name) + '">' +
                        '<input name="m" maxlength="80" placeholder="A message for the show (optional)">' +
                        '<div class="row"><button class="btn go">Send request</button><button type="button" class="btn" data-cancel>Cancel</button></div></form>' : '') +
                    '</li>';
            }).join('') : '<li class="dim">Nothing by that name. Try fewer words.</li>';
            el('rq-page').textContent = 'Page ' + (page + 1) + ' of ' + pages;
            box.querySelector('[data-go="-1"]').disabled = page <= 0;
            box.querySelector('[data-go="1"]').disabled = page >= pages - 1;
        }
        el('rq-q').oninput = function () { const v = this.value.trim(); clearTimeout(timer); timer = setTimeout(() => { q = v; page = 0; load(); }, 300); };
        box.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') e.target.replaceWith(Object.assign(document.createElement('span'), { className: 'thumb' })); }, true);
        box.onclick = (e) => {
            const t = e.target.closest('button');
            if (!t) return;
            if (t.dataset.go) { page = Math.max(0, Math.min(pages - 1, page + Number(t.dataset.go))); load(); }
            else if (t.dataset.req != null) { openRow = openRow === +t.dataset.req ? -1 : +t.dataset.req; draw(); const f = box.querySelector('.rq-form input'); if (f) f.focus(); }
            else if (t.hasAttribute('data-cancel')) { openRow = -1; draw(); }
        };
        box.onsubmit = async (e) => {
            e.preventDefault();
            const f = e.target, r = rows[+f.dataset.form];
            if (!r) return;
            if (f.n.value.trim()) core.setName(f.n.value);
            const btn = f.querySelector('.go');
            btn.disabled = true; btn.textContent = 'Sending…';
            const again = (msg) => { btn.disabled = false; btn.textContent = 'Send request'; UI.toast(msg); };
            try {
                const res = await fetch(api + '/track_requests/', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    // The same fields the panel's own request widget sends.
                    body: JSON.stringify({ server_id: sid, person: core.name, message: f.m.value.trim(), music_id: r.id, ip_timeout: 0, track_timeout: 0 })
                });
                let d = {}; try { d = await res.json(); } catch { /* empty */ }
                if (res.ok) { done[r.id] = true; openRow = -1; draw(); UI.toast('Requested “' + (r.title || 'that one') + '” — AutoDJ will play it soon.'); }
                else if (d.track_blocked) again('That one was played or asked for recently. Pick another.');
                else if (d.ip_blocked) again('You have requested recently — try again a little later.');
                else again('The request did not go through. Try again.');
            } catch { again('Could not reach the request line.'); }
        };
        load();
    }

    function stationRequest(box, s) {
        const lib = s.requestKind === 'library';
        box.innerHTML = '<form class="rq">' + (s.live ? '' : '<p class="hint">Requests play during the next live show.</p>') +
            (lib ? '<input name="q" type="search" maxlength="80" placeholder="Search the station’s music…" autocomplete="off"><ul class="list picks"><li class="dim">Type to search.</li></ul><p class="hint nf" hidden>Can’t find it? Ask for it anyway:</p>' : '') +
            '<div class="free"' + (lib ? ' hidden' : '') + '><input name="s" maxlength="120" placeholder="Artist — title"><input name="n" maxlength="120" placeholder="A note for the DJ (optional)" style="margin-top:6px">' +
            '<div class="row" style="margin-top:6px"><button class="btn go">Send request</button></div></div></form>';
        const form = $('form', box), withName = (fn) => (core.name ? fn() : UI.askName(core, fn));
        form.onsubmit = (e) => {
            e.preventDefault();
            if (!form.s.value.trim()) { UI.toast('Type the song you want.'); return; }
            withName(() => { core.request({ song: form.s.value, note: form.n.value }); form.s.value = ''; form.n.value = ''; });
        };
        if (!lib) return;
        let timer = 0, lastQ = '';
        form.q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => search(form.q.value.trim()), 220); };
        async function search(q) {
            lastQ = q;
            if (q.length < 2) { $('.picks', box).innerHTML = '<li class="dim">Type to search.</li>'; return; }
            try {
                const rows = await (await fetch(core.engine + '/api/requestable?q=' + encodeURIComponent(q))).json();
                if (q !== lastQ) return;
                $('.picks', box).innerHTML = rows.length ? rows.map(r => '<li><button type="button" class="pick btn grow" data-id="' + esc(r.id) + '"><b>' + esc(r.title) + '</b>' + (r.artist ? ' <span class="dim">' + esc(r.artist) + '</span>' : '') + '</button></li>').join('') : '<li class="dim">Not in the library.</li>';
                $('.nf', box).hidden = false; $('.free', box).hidden = false;
                if (!form.s.value) form.s.value = q;
            } catch { $('.picks', box).innerHTML = '<li class="dim">The studio did not answer.</li>'; }
        }
        $('.picks', box).onclick = (e) => {
            const b = e.target.closest('.pick');
            if (b) withName(() => core.request({ id: b.dataset.id }));
        };
    }

    /* =========================================================
       PLAYLIST — coming up next (AutoDJ's plan) and what just played
       ========================================================= */
    function playlist(box) {
        box.innerHTML = '<section class="cu" hidden><h3>🎵 Coming up</h3><ol class="list cu-list"></ol></section><section><h3>🕘 Just played</h3><ol class="list played"></ol></section>';
        let key = '';
        function show(s) {
            const k = JSON.stringify([s.comingUp, s.played]);
            if (k === key) return;
            key = k;
            $('.cu', box).hidden = !s.comingUp.length;
            $('.cu-list', box).innerHTML = s.comingUp.map((it, i) => '<li><span class="dim">' + (i + 1) + '.</span><span class="grow ell" title="' + esc(it.combined || it.title) + '">' + esc(it.combined || (it.artist ? it.artist + ' — ' + it.title : it.title)) + '</span></li>').join('');
            $('.played', box).innerHTML = s.played.length ? s.played.map(h => '<li>' + (h.img ? '<img class="thumb" loading="lazy" alt="" src="' + esc(h.img) + '">' : '<span class="thumb"></span>') +
                '<span class="grow"><b class="ell" style="display:block">' + esc(h.title) + '</b><span class="dim ell" style="display:block;font-size:.85em">' + esc(h.artist) +
                (h.requestedBy ? ' · 🎵 ' + esc(h.requestedBy) : '') + '</span></span><span class="dim" style="font-size:.8em">' + (h.at ? clock(h.at) : '') + '</span></li>').join('')
                : '<li class="dim">Nothing yet.</li>';
        }
        box.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);
        on('state', show); show(core.state);
    }

    /* =========================================================
       CALL IN — the show's phone line, voicemail, guest check-in,
       and who is on the line (the call itself is the radio's, so
       closing this window never hangs up)
       ========================================================= */
    function studio(box) {
        box.innerHTML = '<div class="card st-status"></div><div class="booth card" hidden><p class="bt"></p><div class="ring"><span></span></div><div class="row"><button type="button" class="btn" data-c="mute">Mute</button><button type="button" class="btn bad" data-c="hang">Hang up</button></div></div>' +
            '<div class="st-actions"></div>';
        function show(s) {
            $('.st-status', box).innerHTML =
                '<div><b>' + (s.onAir ? '🔴 Live' + (s.who ? ' with ' + esc(s.who) : '') : '🔵 AutoDJ') + '</b>' + (s.listeners != null ? ' <span class="dim">· ' + s.listeners + ' listening</span>' : '') + '</div>' +
                (s.live && s.main ? '<div class="dim">' + esc(s.main) + '</div>' : '') +
                (s.onLine.length ? '<div>On the line: ' + s.onLine.map(p => '<b style="color:' + esc(p.color) + '">' + esc(p.name) + '</b>').join(', ') + '</div>' : '') +
                (!s.engineUp ? '<div class="hint">The studio is off right now. Call-in and voicemail open when the station’s computer is on.</div>' : '');
            const c = s.call;
            $('.booth', box).hidden = !c;
            if (c) { $('.bt', box).textContent = c.text || ''; $('[data-c="mute"]', box).textContent = c.muted ? 'Unmute' : 'Mute'; }
            const acts = [];
            if (!c && s.callsOpen) acts.push('<button type="button" class="btn go" data-a="call">📞 Call in</button>');
            if (!c && s.voicemail) acts.push('<button type="button" class="btn" data-a="vm">📼 Voicemail</button>');
            if (!c && s.canCode) acts.push('<button type="button" class="btn" data-a="code">I have a guest code</button>');
            if (!c && s.engineUp && !s.callsOpen) acts.push('<p class="hint">' + (s.live ? 'The host has not opened the phone lines.' : 'Calls open during live shows.') + '</p>');
            $('.st-actions', box).innerHTML = acts.join('');
        }
        on('state', show); show(core.state);
        // The ring follows your own voice, so you know the mic works.
        setInterval(() => { if (core.state.call && !document.hidden) $('.ring span', box).style.transform = 'scale(' + (1 + Math.min(core.level() * 1.5, 0.6)) + ')'; }, 100);
        box.onclick = (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.c === 'mute') core.mute();
            else if (b.dataset.c === 'hang') core.endCall('You hung up.');
            else if (b.dataset.a === 'call') callSheet();
            else if (b.dataset.a === 'code') codeSheet();
            else if (b.dataset.a === 'vm') voicemail();
        };
        function callSheet() {
            UI.sheet('<form><h2>Call in</h2><input name="n" maxlength="32" placeholder="Your name" value="' + esc(core.name) + '" required>' +
                '<input name="topic" maxlength="140" placeholder="What do you want to talk about? (optional)">' +
                '<label class="consent"><input type="checkbox" name="ok" required> I understand this is a live broadcast. Anything I say may go out on air and be recorded.</label>' +
                '<p class="hint">Headphones stop echo. The radio pauses while you are on the line — you hear the show through the call.</p>' +
                '<div class="row"><button class="btn go">Call</button><button type="button" class="btn" data-close>Cancel</button></div></form>',
                (f) => { core.setName(f.n.value); UI.closeSheet(); core.startCall(false, f.topic.value); });
        }
        function codeSheet() {
            UI.sheet('<form><h2>Check in as a guest</h2><p class="hint">The host gave you a six-digit code.</p>' +
                '<input name="c" inputmode="numeric" maxlength="7" placeholder="123 456" required>' +
                '<input name="n" maxlength="32" placeholder="Your name" value="' + esc(core.name) + '">' +
                '<div class="row"><button class="btn go">Check in</button><button type="button" class="btn" data-close>Cancel</button></div></form>',
                (f) => { if (core.checkIn(f.c.value, f.n.value)) UI.closeSheet(); });
        }
        function voicemail() {
            const VM_MAX = 300, VM_BYTES = 50 * 1024 * 1024;
            const canRecord = !!(window.MediaRecorder && navigator.mediaDevices);
            let rec = null, stream = null, chunks = [], blob = null, started = 0, tick = 0, resume = false, mode = canRecord ? 'rec' : 'file';
            const card = UI.sheet('<form><h2>Leave a voicemail</h2>' +
                (canRecord ? '<div class="row seg"><button type="button" class="btn on" data-m="rec">Record here</button><button type="button" class="btn" data-m="file">Send a file</button></div>' : '') +
                '<div class="vm-rec"' + (canRecord ? '' : ' hidden') + '><div class="row"><button type="button" class="btn go vm-btn">● Record</button><span class="vm-time dim">0:00 / ' + mmss(VM_MAX) + '</span></div><audio class="vm-play" controls hidden></audio></div>' +
                '<div class="vm-file"' + (canRecord ? ' hidden' : '') + '><input type="file" name="f" accept="audio/*"><p class="hint">Up to 5 minutes and 50 MB — MP3, M4A, WAV, OGG, FLAC or WebM.</p></div>' +
                '<input name="n" maxlength="40" placeholder="Your name (optional)" value="' + esc(core.name) + '">' +
                '<input name="note" maxlength="200" placeholder="What is it about? (optional)">' +
                '<label class="consent"><input type="checkbox" name="ok" required> It is OK to play this on air and keep it.</label>' +
                '<div class="upbar" hidden><i></i></div>' +
                '<div class="row"><button class="btn go vm-send">Send voicemail</button><button type="button" class="btn" data-close>Cancel</button></div></form>', send, stopAll);
            const q = (c) => card.querySelector(c);
            const seg = q('.seg');
            if (seg) seg.onclick = (e) => {
                const m = e.target.dataset.m;
                if (!m) return;
                mode = m;
                seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.m === m));
                q('.vm-rec').hidden = m !== 'rec'; q('.vm-file').hidden = m !== 'file';
            };
            q('.vm-btn').onclick = () => (rec && rec.state === 'recording' ? stopRec() : startRec());
            function startRec() {
                navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then((s) => {
                    stream = s;
                    // The stream would bleed into the message; pause it while recording.
                    resume = core.state.playing; if (resume) core.stop();
                    const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
                    const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
                    rec = mime ? new MediaRecorder(s, { mimeType: mime, audioBitsPerSecond: 64000 }) : new MediaRecorder(s);
                    chunks = []; blob = null;
                    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
                    rec.onstop = () => { blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }); const a = q('.vm-play'); if (a) { a.src = URL.createObjectURL(blob); a.hidden = false; } releaseMic(); };
                    rec.start(1000);
                    started = Date.now();
                    q('.vm-btn').textContent = '■ Stop'; q('.vm-play').hidden = true;
                    tick = setInterval(() => { const t = (Date.now() - started) / 1000; if (q('.vm-time')) q('.vm-time').textContent = mmss(t) + ' / ' + mmss(VM_MAX); if (t >= VM_MAX) stopRec(); }, 250);
                }, (err) => UI.toast('Microphone: ' + (err && err.name === 'NotAllowedError' ? 'permission was refused.' : (err && err.message) || err)));
            }
            function stopRec() { clearInterval(tick); if (rec && rec.state === 'recording') rec.stop(); if (q('.vm-btn')) q('.vm-btn').textContent = '● Record again'; }
            function releaseMic() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; if (resume) { resume = false; core.play(); } }
            function stopAll() { clearInterval(tick); if (rec && rec.state === 'recording') { rec.onstop = null; rec.stop(); } releaseMic(); }
            function send(f) {
                const file = mode === 'file' ? f.f.files[0] : blob;
                if (!file) { UI.toast(mode === 'file' ? 'Choose an audio file first.' : 'Record your message first.'); return; }
                if (mode === 'rec' && rec && rec.state === 'recording') { UI.toast('Stop recording first.'); return; }
                if (file.size > VM_BYTES) { UI.toast('That file is over 50 MB. Try an MP3 or M4A.'); return; }
                if (f.n.value.trim()) core.setName(f.n.value);
                const x = new XMLHttpRequest();
                const look = core.hallLook && core.hallLook();
                x.open('POST', core.engine + '/api/voicemail?name=' + encodeURIComponent(f.n.value.trim()) + '&note=' + encodeURIComponent(f.note.value.trim()) + (look ? '&look=' + encodeURIComponent(JSON.stringify(look)) : ''));
                const bar = q('.upbar'), btn = q('.vm-send');
                bar.hidden = false; btn.disabled = true; btn.textContent = 'Sending…';
                x.upload.onprogress = (e) => { if (e.lengthComputable) bar.firstChild.style.width = Math.round(e.loaded / e.total * 100) + '%'; };
                x.onload = () => {
                    let d = {}; try { d = JSON.parse(x.responseText); } catch { /* empty */ }
                    if (x.status >= 200 && x.status < 300) { UI.closeSheet(); UI.toast('Thanks — your voicemail is in.'); }
                    else { btn.disabled = false; btn.textContent = 'Send voicemail'; bar.hidden = true; UI.toast(d.error || 'It did not go through. Try again.'); }
                };
                x.onerror = () => { btn.disabled = false; btn.textContent = 'Send voicemail'; bar.hidden = true; UI.toast('Could not reach the station.'); };
                x.send(file);
            }
        }
    }

    /* =========================================================
       SIGN — the station's LED sign on its own: stretch it across
       the top of the screen like a ticker
       ========================================================= */
    function banner(box) {
        box.innerHTML = '<div class="led" data-bg="transparent" data-off="rgba(255,255,255,0.10)"></div><div class="empty off" hidden>The sign is off right now.</div>';
        const sign = LT.LedBanner($('.led', box));
        let key = '';
        function show(s) {
            const b = s.banner && s.banner.on ? s.banner : { on: false, items: [] };
            const k = JSON.stringify(b);
            if (k === key) return;
            key = k;
            sign.set(b);
            $('.off', box).hidden = !!b.on;
        }
        on('state', show); show(core.state);
    }

    /* =========================================================
       ALBUMS — play the station's albums here, or download them
       to a folder (Music\<station>\<album>, unless you choose)
       ========================================================= */
    function albums(box) {
        box.innerHTML = '<div class="al-now card" hidden></div><ul class="list al-list"></ul><p class="hint al-where"></p>';
        const meta = {};                     // archive id → metadata (fetched once)
        const progress = {};                 // album key → last download message
        let openKey = '', key = '';
        const items = () => ((core.state.extras && core.state.extras.albums && core.state.extras.albums.items) || []).map((a, i) => ({ ...a, key: a.archive || a.id || a.title || String(i) }));

        async function archiveMeta(idx) {
            if (meta[idx]) return meta[idx];
            const r = await fetch('https://archive.org/metadata/' + encodeURIComponent(idx));
            if (!r.ok) throw new Error('archive.org said ' + r.status);
            return (meta[idx] = await r.json());
        }
        const fileUrl = (idx, name) => 'https://archive.org/download/' + encodeURIComponent(idx) + '/' + name.split('/').map(encodeURIComponent).join('/');
        // One playable copy of each track, in album order.
        function tracksOf(a, m) {
            if (a.tracks) return a.tracks.map((t, i) => ({ url: t.url, label: t.title || 'Track ' + (i + 1) }));
            const seen = new Set();
            return (m.files || []).filter(f => /\.mp3$/i.test(f.name))
                .filter(f => { const k = f.name.replace(/_64kb\.mp3$/i, '.mp3').toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
                .map(f => {
                    const base = f.name.split('/').pop().replace(/\.mp3$/i, '');
                    const title = (f.title || '').replace(/^\d+[\s.\-_]+/, '').trim(), artist = f.artist || f.creator || '';
                    return { url: fileUrl(a.archive, f.name), label: title ? (artist ? artist + ' — ' + title : title) : base.replace(/^\d+[\s.\-_]+/, ''), num: parseInt(f.track, 10), name: f.name };
                })
                .sort((x, y) => (isNaN(x.num) ? 1e9 : x.num) - (isNaN(y.num) ? 1e9 : y.num) || x.name.localeCompare(y.name, undefined, { numeric: true }));
        }
        // What to save: the uploader's own audio files (not archive.org's copies), one
        // format per track (MP3 unless Settings asks for lossless), and the cover.
        function downloadFiles(a, m) {
            if (a.download) return [].concat(a.download).map(u => ({ url: u, name: decodeURIComponent(u.split('/').pop().split('?')[0]) }));
            if (a.tracks) return a.tracks.map(t => ({ url: t.url, name: decodeURIComponent(t.url.split('/').pop().split('?')[0]) }));
            const files = m.files || [], audio = /\.(mp3|flac|wav|ogg|m4a|opus|aiff?)$/i;
            const order = UI.info.ui.lossless ? ['flac', 'wav', 'aif', 'aiff', 'mp3', 'm4a', 'ogg', 'opus'] : ['mp3', 'm4a', 'ogg', 'opus', 'flac', 'wav', 'aif', 'aiff'];
            const rank = (f) => order.indexOf(f.name.split('.').pop().toLowerCase());
            const best = new Map();
            for (const f of files.filter(x => x.source === 'original' && audio.test(x.name))) {
                const k = f.name.replace(/\.[^.]+$/, '').toLowerCase();
                if (!best.has(k) || rank(f) < rank(best.get(k))) best.set(k, f);
            }
            let pick = [...best.values()];
            if (!pick.length) pick = files.filter(f => /\.mp3$/i.test(f.name) && !/_64kb\.mp3$/i.test(f.name));
            const art = files.filter(f => f.source === 'original' && /\.(jpe?g|png)$/i.test(f.name) && !/__ia_thumb/i.test(f.name));
            const all = [...pick, ...art], short = (f) => f.name.split('/').pop();
            const clash = new Set(all.map(short).filter((n, i, l) => l.indexOf(n) !== i));
            return all.map(f => ({ url: fileUrl(a.archive, f.name), name: clash.has(short(f)) ? f.name.split('/').join(' - ') : short(f), size: f.size }));
        }

        function draw() {
            const list = items(), now = core.album.info();
            const k = JSON.stringify([list.map(a => a.key), now && now.key, openKey]);
            if (k !== key) {
                key = k;
                $('.al-list', box).innerHTML = list.length ? list.map(a => {
                    const playable = !!(a.archive || a.tracks), saveable = !!(a.archive || a.tracks || a.download);
                    return '<li class="al" data-key="' + esc(a.key) + '"><span class="grow"><b class="ell al-t" style="display:block" title="' + esc(a.title) + '">' + esc(a.title) + '</b><span class="al-dl dim"></span></span>' +
                        (playable ? '<button type="button" class="btn' + (now && now.key === a.key ? ' on' : '') + '" data-a="play" title="Play it here">▶</button>' : '') +
                        (saveable ? '<button type="button" class="btn" data-a="save" title="Download the album">⬇</button>' : '') +
                        (a.page || a.archive || a.bandcamp || a.youtube ? '<button type="button" class="btn" data-a="page" title="Open its page in the browser">↗</button>' : '') +
                        (openKey === a.key ? '<ol class="list al-tracks"><li class="dim">Loading tracks…</li></ol>' : '') + '</li>';
                }).join('') : '<li class="dim">This station has no albums listed yet.</li>';
                if (openKey) fillTracks(openKey);
                for (const kk of Object.keys(progress)) paintProgress(kk);
            }
            const nb = $('.al-now', box);
            nb.hidden = !now;
            if (now) {
                if (!nb.firstChild) nb.innerHTML = '<div class="row"><b class="grow ell al-nt"></b><button type="button" class="btn" data-n="prev">⏮</button><button type="button" class="btn" data-n="toggle"></button><button type="button" class="btn" data-n="next">⏭</button><button type="button" class="btn" data-n="close" title="Stop">✕</button></div>' +
                    '<div class="row"><input type="range" class="grow al-seek" min="0" max="1000" value="0"><span class="dim al-time">0:00</span></div>';
                $('.al-nt', nb).textContent = now.track + ' — ' + now.title;
                $('[data-n="toggle"]', nb).textContent = now.playing ? '⏸' : '▶';
            } else nb.innerHTML = '';
        }
        async function fillTracks(k) {
            const a = items().find(x => x.key === k), ol = box.querySelector('.al[data-key="' + CSS.escape(k) + '"] .al-tracks');
            if (!a || !ol) return;
            try {
                const ts = a.tracks ? tracksOf(a) : tracksOf(a, await archiveMeta(a.archive));
                const now = core.album.info();
                ol.innerHTML = ts.map((t, i) => '<li><button type="button" class="linkish' + (now && now.key === k && now.i === i ? ' on' : '') + '" data-t="' + i + '">' + (i + 1) + '. ' + esc(t.label) + '</button></li>').join('') || '<li class="dim">No tracks.</li>';
            } catch (e) { ol.innerHTML = '<li class="dim">Could not load the tracks (' + esc(e.message) + ').</li>'; }
        }
        async function play(a, i) {
            try {
                const ts = a.tracks ? tracksOf(a) : tracksOf(a, await archiveMeta(a.archive));
                if (!ts.length) return UI.toast('No tracks to play in that one.');
                core.album.start({ key: a.key, title: a.title }, ts, i || 0);
            } catch (e) { UI.toast('Could not load the album: ' + e.message); }
        }
        async function save(a) {
            if (progress[a.key] && !progress[a.key].finished && !progress[a.key].error && !progress[a.key].stopped) {
                await app.stopDownload(a.key); return;
            }
            try {
                progress[a.key] = { done: 0, total: 0, file: 'Getting the file list…' }; paintProgress(a.key);
                const files = downloadFiles(a, a.archive ? await archiveMeta(a.archive) : {});
                const r = await app.download({ key: a.key, album: a.title, files });
                if (r && r.cancelled) { delete progress[a.key]; paintProgress(a.key); }
            } catch (e) { progress[a.key] = { error: String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }; paintProgress(a.key); }
        }
        function paintProgress(k) {
            const row = box.querySelector('.al[data-key="' + CSS.escape(k) + '"]');
            if (!row) return;
            const p = progress[k], out = $('.al-dl', row), btn = $('[data-a="save"]', row);
            if (!p) { out.textContent = ''; if (btn) btn.textContent = '⬇'; return; }
            if (p.error) { out.innerHTML = '⚠ ' + esc(p.error); if (btn) btn.textContent = '⬇'; }
            else if (p.finished || p.stopped) {
                out.innerHTML = (p.finished ? '✓ Saved ' + p.done + ' files — ' : 'Stopped — ') + '<button type="button" class="linkish" data-a="folder">show folder</button>';
                if (btn) btn.textContent = '⬇';
            } else {
                out.textContent = p.total ? '⬇ ' + p.done + ' of ' + p.total + (p.file ? ' · ' + p.file : '') : p.file || 'Starting…';
                if (btn) { btn.textContent = '■'; btn.title = 'Stop downloading'; }
            }
        }
        app.onDownload((m) => { progress[m.key] = { ...(progress[m.key] || {}), ...m }; paintProgress(m.key); });

        box.onclick = (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            const row = b.closest('.al'), a = row && items().find(x => x.key === row.dataset.key);
            if (b.dataset.n) {
                const n = b.dataset.n, now = core.album.info();
                if (n === 'toggle') core.album.toggle(); else if (n === 'close') core.album.close();
                else if (now) core.album.go(now.i + (n === 'next' ? 1 : -1));
                return;
            }
            if (!a) return;
            if (b.dataset.a === 'play') { openKey = openKey === a.key ? '' : a.key; draw(); if (openKey) play(a, 0); }
            else if (b.dataset.t != null) play(a, +b.dataset.t);
            else if (b.dataset.a === 'save') save(a);
            else if (b.dataset.a === 'folder') app.showFolder(progress[a.key].dir);
            else if (b.dataset.a === 'page') app.openExternal(a.page || (a.archive ? 'https://archive.org/details/' + a.archive : a.bandcamp || 'https://www.youtube.com/watch?v=' + a.youtube));
        };
        box.addEventListener('input', (e) => { if (e.target.classList.contains('al-seek')) core.album.seek(e.target.value / 1000); });
        on('albumtime', (t) => {
            const sk = $('.al-seek', box);
            if (!sk || document.hidden) return;
            if (document.activeElement !== sk && t.len) sk.value = Math.round(t.t / t.len * 1000);
            $('.al-time', box).textContent = mmss(t.t) + ' / ' + mmss(t.len);
        });
        on('album', () => { key = ''; draw(); });
        on('state', draw); draw();
        const where = () => { $('.al-where', box).innerHTML = 'Downloads go to <b>' + esc(UI.info.ui.askWhere ? 'a folder you pick each time' : UI.info.downloads) + '</b> — change it in Settings.'; };
        where(); UI.onUi(where);
    }

    /* =========================================================
       BOARD — the station's board, in a window of its own
       (a web page can't show it inside itself; the app can).
       Asks first: it may show anything.
       ========================================================= */
    function board(box) {
        const TINT = {
            win95: 'grayscale(0.35) contrast(1.05)', macos: 'grayscale(0.35) contrast(1.05)', netscape: 'grayscale(0.2)',
            dos: 'invert(0.88) hue-rotate(180deg) sepia(0.5) hue-rotate(190deg) saturate(2.5)',
            c64: 'invert(0.85) hue-rotate(180deg) sepia(0.6) hue-rotate(205deg) saturate(1.8)',
            matrix: 'invert(0.92) hue-rotate(180deg) grayscale(1) sepia(1) hue-rotate(75deg) saturate(4) brightness(0.85)',
            amber: 'invert(0.92) hue-rotate(180deg) grayscale(1) sepia(1) saturate(3) brightness(0.9)',
            gameboy: 'grayscale(1) sepia(1) hue-rotate(40deg) saturate(1.8) contrast(0.85)',
            geocities: 'saturate(2.2) hue-rotate(-25deg)', synthwave: 'invert(0.9) hue-rotate(180deg) sepia(0.4) hue-rotate(260deg) saturate(2.2)',
            teletext: 'invert(0.9) hue-rotate(180deg) contrast(1.3) saturate(2)', glitch: 'invert(0.9) hue-rotate(180deg) contrast(1.2) saturate(1.4)',
            chinese: 'sepia(0.45) hue-rotate(-20deg) saturate(1.3)', japanese: 'sepia(0.2) saturate(0.85)',
            starry: 'invert(0.9) hue-rotate(180deg) sepia(0.3) hue-rotate(215deg) saturate(1.3) brightness(0.95)'
        };
        const b = () => (core.state.extras && core.state.extras.board) || {};
        UI.setTitle(b().title || 'Board', '📋');
        function gate() {
            box.innerHTML = '<div class="gate"><h2>Warning: NSFW</h2><p>' + esc(b().title || 'The board') + ' is a live message board, shown as posted. It may show pornography and anything else people post.</p>' +
                '<label><input type="checkbox" class="age"> I am 18 or older</label><label><input type="checkbox" class="noask"> Don’t ask me again</label>' +
                '<div class="row"><button type="button" class="btn go" data-g="yes" disabled>Show the board</button><button type="button" class="btn" data-g="no">Take me back</button></div></div>';
            $('.age', box).onchange = (e) => { $('[data-g="yes"]', box).disabled = !e.target.checked; };
            box.onclick = (e) => {
                const g = e.target.dataset && e.target.dataset.g;
                if (g === 'no') window.close();
                if (g === 'yes') { if ($('.noask', box).checked) app.setUi({ boardOk: true }); show(); }
            };
        }
        function show() {
            const url = b().url;
            if (!url) { box.innerHTML = '<div class="empty">This station has no board.</div>'; return; }
            box.classList.add('flush');
            box.innerHTML = '<div class="bd-bar row"><button type="button" class="btn" data-b="back" title="Back">‹</button><button type="button" class="btn" data-b="home" title="The board’s front page">⌂</button><button type="button" class="btn" data-b="reload" title="Reload">⟳</button><button type="button" class="btn" data-b="link" title="Verify your e-mail with 4chan here, or open a 4chan link in this window">🔗</button><span class="grow"></span>' +
                '<label class="dim"><input type="checkbox" class="tint"' + (UI.info.ui.boardTint === false ? '' : ' checked') + '> Tint to the look</label><button type="button" class="btn" data-b="scripts" title="Userscripts: extra features for the board">🧩 Scripts</button><button type="button" class="btn" data-b="out" title="Open in the browser">↗</button></div>' +
                '<div class="bd-wait row" hidden><span class="grow"></span><button type="button" class="btn" data-b="paste" title="Paste 4chan’s link yourself, if it isn’t picked up">📋 Paste the link…</button><button type="button" class="btn" data-b="stopwait" title="Stop waiting">✕</button></div>' +
                '<div class="bd"></div>';
            // The board is a real browser view laid over this spot (not a frame in this page),
            // so the site sees an ordinary visit: its captcha, cookies and posting all work.
            const slot = $('.bd', box);
            const place = () => {
                const r = slot.getBoundingClientRect();
                // In the one window the view is laid over the whole window, so: where this panel sits in it,
                // and out of the way while the panel is hidden or something is open over it.
                let dx = 0, dy = 0, away = false;
                if (panel) {
                    const f = window.frameElement, o = f && f.getBoundingClientRect();
                    if (o) { dx = o.left; dy = o.top; }
                    away = !o || !o.width || !!(window.parent.onairOne && window.parent.onairOne.covered());
                }
                // The view sits above this page, so it steps aside while a sheet (Scripts, the window menu) is open.
                app.board('bounds', away || UI.me.rolled || !$('.sheet').hidden || !r.width ? null : { x: Math.round(r.left + dx), y: Math.round(r.top + dy), width: Math.round(r.width), height: Math.round(r.height) });
            };
            new ResizeObserver(place).observe(slot);
            window.addEventListener('panel-moved', place);          // the one window moved its panels about
            new MutationObserver(place).observe($('.sheet'), { attributes: true, attributeFilter: ['hidden'] });
            app.onWin(() => setTimeout(place, 50));
            app.board('open', url);
            place();
            /* ---- 4chan's e-mail verification, done in this window ----
               4chan remembers a verified e-mail with a cookie, and this window keeps its own
               cookies (not your browser's). The link in 4chan's e-mail opens your browser if
               you click it, so: copy it instead, and this window opens it here. */
            const isChan = (u) => /^https:\/\/([\w-]+\.)*4chan(nel)?\.org\/\S+$/i.test(u);
            let waiting = false, waitT = 0, lastClip = '', guided = 0;
            const say = (html) => { $('.bd-wait span', box).innerHTML = html; };
            function waitFor(on) {
                waiting = on;
                clearInterval(waitT);
                $('.bd-wait', box).hidden = !on;
                if (!on) return;
                say('📧 <b>Waiting for 4chan’s link.</b> In the e-mail from 4chan, <b>right-click</b> the link → <b>Copy link</b>, then come back here. (Don’t click it: it would open your browser.)');
                app.boardClip().then(t => { lastClip = t; }).catch(() => {});      // a link already copied before is not the one
                waitT = setInterval(checkClip, 1500);
                setTimeout(() => { if (waiting) waitFor(false); }, 30 * 60e3);
            }
            async function checkClip() {
                if (!waiting) return;
                const t = await app.boardClip().catch(() => '');
                if (t && t !== lastClip) openLink(t);
            }
            function openLink(u) {
                waiting = false; clearInterval(waitT);
                app.board('go', u);
                $('.bd-wait', box).hidden = false;
                say('✓ <b>Opened the link here.</b> When 4chan says you’re verified, go back to the thread and post again.');
                setTimeout(() => { if (!waiting) $('.bd-wait', box).hidden = true; }, 20000);
            }
            /** The paste box: whatever link you copied, filled in, to check and open here (or paste it yourself). */
            async function pasteLink() {
                const was = waiting;
                const t = await app.boardClip(true).catch(() => '');
                waiting = false; clearInterval(waitT);
                UI.sheet('<form><h2>📋 Open 4chan’s link here</h2>' +
                    '<p>' + (t ? 'This is the link you copied. Press <b>Open</b> to open it in the board window.' : 'In 4chan’s e-mail, right-click the link → <b>Copy link</b>, then paste it here (<b>Ctrl+V</b>).') + '</p>' +
                    '<input name="u" placeholder="https://…4chan.org/…" autocomplete="off" value="' + esc(t) + '">' +
                    '<div class="row"><button class="btn go">Open</button><button type="button" class="btn" data-close>Cancel</button></div></form>',
                    (f) => {
                        const u = f.u.value.trim();
                        if (!isChan(u)) { let host = ''; try { host = new URL(u).host; } catch { /* not a link */ } return UI.toast(host ? 'That link goes to ' + host + ', not 4chan. Copy the link from 4chan’s e-mail.' : 'Paste the link from 4chan’s e-mail.'); }
                        UI.closeSheet(); openLink(u);
                    }, () => { if (was && !waiting && $('.bd-wait', box).textContent.includes('Waiting')) waitFor(true); });
            }
            function verifyGuide(blocked) {
                UI.sheet('<form><h2>📧 Verify your e-mail with 4chan, here</h2>' +
                    (blocked ? '<p>4chan says your connection is blocked from posting until you verify an e-mail address. ' : '<p>') +
                    'Verifying in your browser doesn’t count here: this window keeps its own cookies. Do it in this window:</p>' +
                    '<ol class="bd-steps"><li>Press <b>Start</b>. In 4chan’s message, click <b>verify your e-mail address</b> and enter your e-mail. (Verified already in your browser? Do it again here.)</li>' +
                    '<li>Open 4chan’s e-mail. <b>Don’t click the link</b>: right-click it and choose <b>Copy link</b> (<i>Copy link address</i>).</li>' +
                    '<li>Come back here. The board window notices the copied link and opens it itself (or press <b>📋 Paste the link…</b> to paste it yourself).</li></ol>' +
                    '<p class="dim">Already have the link? Paste it here:</p><input name="u" placeholder="https://…4chan.org/…" autocomplete="off">' +
                    '<div class="row"><button class="btn go">Start</button><button type="button" class="btn" data-close>Not now</button></div></form>',
                    (f) => {
                        const u = f.u.value.trim();
                        UI.closeSheet();
                        if (u) { if (isChan(u)) openLink(u); else UI.toast('That isn’t a 4chan link.'); return; }
                        waitFor(true);
                    });
            }
            app.onBoardBlocked(() => { if (!waiting && Date.now() - guided > 10 * 60e3) { guided = Date.now(); verifyGuide(true); } });
            window.addEventListener('focus', checkClip);

            const tint = () => app.board('tint', $('.tint', box).checked ? (TINT[UI.skin] || '') : '');
            tint(); UI.onLook(tint);
            $('.tint', box).onchange = () => { tint(); app.setUi({ boardTint: $('.tint', box).checked }); };
            box.onclick = (e) => {
                const k = e.target.dataset && e.target.dataset.b;
                if (k === 'out') app.board('out');
                else if (k === 'link') verifyGuide(false);
                else if (k === 'paste') pasteLink();
                else if (k === 'stopwait') waitFor(false);
                else if (k === 'scripts') scripts();
                else if (k) app.board(k);
            };
        }

        /* Userscripts (Tampermonkey-style), run only in the board's view. */
        async function scripts(note) {
            let list = [];
            try { list = await app.scripts.list(); } catch (e) { return UI.toast(e.message); }
            const have = (u) => list.some(s => s.source === u || s.code === u);
            const sugg = (b().scripts || []).filter(x => x && /^https:\/\//.test(x.url || '') && !have(x.url));
            const card = UI.sheet('<form class="us"><h2>🧩 Board scripts</h2>' +
                (note ? '<p>' + esc(note) + '</p>' : '') +
                (list.length ? '<ul class="list us-list">' + list.map(s => '<li><label class="grow"><input type="checkbox" data-on="' + s.id + '"' + (s.on ? ' checked' : '') + '> <b>' + esc(s.name) + '</b> <span class="dim">' + esc(s.version || '') + '</span>' +
                    (s.description ? '<span class="us-about dim">' + esc(s.description) + '</span>' : '') + '</label>' +
                    '<span class="us-act">' + (s.code ? '<button type="button" class="btn" data-up="' + s.id + '" title="Get the newest version">Update</button>' : '') + '<button type="button" class="btn" data-rm="' + s.id + '" title="Remove">✕</button></span></li>').join('') + '</ul>'
                    : '<p class="dim">No scripts yet.</p>') +
                (sugg.length ? '<h3>Suggested by the station</h3><ul class="list us-list">' + sugg.map((x, i) => '<li><span class="grow"><b>' + esc(x.title || x.url) + '</b>' + (x.about ? '<span class="us-about dim">' + esc(x.about) + '</span>' : '') + '</span><button type="button" class="btn" data-sg="' + i + '">Add…</button></li>').join('') + '</ul>' : '') +
                '<h3>Add a script</h3><div class="row"><input name="url" class="grow" placeholder="Greasy Fork page or .user.js link"><button class="btn go">Add…</button></div>' +
                '<p class="dim us-warn">A script can read and change everything on the board pages, including what you post. Add only scripts you trust. They run here only, never in the rest of the app.</p>' +
                '<div class="row"><button type="button" class="btn" data-close>Done</button></div></form>',
                (f) => { const u = f.url.value.trim(); if (u) add(u); });
            card.onclick = async (e) => {
                const t = e.target.closest('button'); if (!t) return;
                try {
                    if (t.dataset.rm) { const s = list.find(x => x.id === t.dataset.rm); if (confirm('Remove ' + (s ? s.name : 'this script') + '?')) { await app.scripts.remove(t.dataset.rm); scripts('Removed. The board reloaded.'); } }
                    else if (t.dataset.up) { const s = list.find(x => x.id === t.dataset.up); add(s.code || s.source); }
                    else if (t.dataset.sg) add(sugg[+t.dataset.sg].url);
                } catch (err) { UI.toast(err.message); }
            };
            card.onchange = async (e) => {
                const id = e.target.dataset && e.target.dataset.on;
                if (id) { try { await app.scripts.set(id, e.target.checked); UI.toast((e.target.checked ? 'On' : 'Off') + ' — the board reloaded.'); } catch (err) { UI.toast(err.message); } }
            };
        }
        // Fetch it, show what it asks for, install only on a yes.
        async function add(url) {
            UI.sheet('<div><h2>🧩 Getting the script…</h2><p class="dim">' + esc(url) + '</p></div>');
            let got;
            try { got = await app.scripts.fetch(url); } catch (e) { UI.toast(e.message); return scripts(); }
            const i = got.info, where = (i.match || []).concat(i.include || []);
            if (got.replaces && got.replaces.version === i.version) { UI.toast(i.name + ' is up to date (' + (i.version || '?') + ').'); return scripts(); }
            UI.sheet('<form><h2>' + (got.replaces ? 'Update' : 'Add') + ' “' + esc(i.name) + '”?</h2>' +
                '<p>' + (got.replaces ? 'Version ' + esc(got.replaces.version || '?') + ' → ' : 'Version ') + esc(i.version || '?') + (i.author ? ' · by ' + esc(i.author) : '') + '</p>' +
                (i.description ? '<p class="dim">' + esc(i.description) + '</p>' : '') +
                '<p><b>Runs on:</b> ' + (where.length ? where.map(esc).join(', ') : 'nowhere (it names no pages)') + '</p>' +
                '<p><b>Talks to:</b> ' + ((i.connect || []).filter(c => c !== '*').map(esc).join(', ') || 'only the board') + ((i.connect || []).includes('*') ? ' <span class="dim">(it also asks for any site; the app doesn’t allow that)</span>' : '') + '</p>' +
                '<p class="dim us-from">From ' + esc(i.code) + '</p>' +
                '<p class="dim us-warn">It can read and change everything on the board pages, including what you post.</p>' +
                '<div class="row"><button class="btn go">' + (got.replaces ? 'Update' : 'Add it') + '</button><button type="button" class="btn" data-back>Cancel</button></div></form>',
                async () => { try { await app.scripts.install(got.key); scripts((got.replaces ? 'Updated ' : 'Added ') + i.name + '. The board reloaded.'); } catch (e) { UI.toast(e.message); } });
            $('.sheet-card [data-back]').onclick = () => scripts();
        }
        if (UI.info.ui.boardOk) show(); else gate();
    }

    /* =========================================================
       TV — the station's video stream (the radio pauses while it plays)
       ========================================================= */
    function tv(box) {
        const wasPlaying = core.pauseForVideo();
        let vid = '';
        function show(s) {
            const t = s.tv || {};
            if (t.live && t.videoId) {
                if (vid === t.videoId) return;
                vid = t.videoId;
                UI.setTitle(t.title || (s.name ? s.name + ' TV' : 'TV'), '📺');
                box.classList.add('flush');
                box.innerHTML = '<iframe class="yt" src="https://www.youtube.com/embed/' + encodeURIComponent(vid) + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
            } else if (vid !== 'off') {
                vid = 'off';
                box.classList.remove('flush');
                const ch = s.extras && s.extras.tv && s.extras.tv.channel;
                box.innerHTML = '<div class="empty">The video stream is off right now.' + (ch ? '<p><button type="button" class="btn" data-ch>Open the channel</button></p>' : '') + '</div>';
                const b = $('[data-ch]', box); if (b) b.onclick = () => app.openExternal(ch);
            }
        }
        on('state', show); show(core.state);
        // Full screen, and back to the window as it was (Esc too).
        const full = $('.bar [data-tv="full"]');
        full.onclick = () => app.winCmd('fullscreen');
        app.onFullscreen((on) => {
            full.textContent = on ? '🗗' : '⛶';
            full.title = on ? 'Exit full screen (Esc)' : 'Full screen';
            document.body.classList.toggle('is-full', on);
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('is-full')) app.winCmd('fullscreen'); });
        window.addEventListener('pagehide', () => { if (wasPlaying) core.play(); });
    }

    /* =========================================================
       LINKS — the station's friends
       ========================================================= */
    function links(box) {
        let key = '';
        function show(s) {
            const groups = (s.extras && s.extras.links) || [];
            const k = JSON.stringify(groups);
            if (k === key) return;
            key = k;
            box.innerHTML = groups.length ? groups.map(g => '<section class="lk"><h3>' + esc(g.title || '') + '</h3><ul class="list">' +
                (g.items || []).map(l => '<li><button type="button" class="linkish grow" data-url="' + esc(l.url) + '" title="' + esc(l.url) + '">' + esc(l.title || l.url) + '</button>' + (l.nsfw ? '<span class="tag nsfw">NSFW</span>' : '') + '</li>').join('') +
                '</ul></section>').join('') : '<div class="empty">No links yet.</div>';
        }
        box.onclick = (e) => { const b = e.target.closest('[data-url]'); if (b) app.openExternal(b.dataset.url); };
        on('state', show); show(core.state);
    }

    /* =========================================================
       SETTINGS — for the whole app (each window's title menu has
       its own look, text size, see-through and on-top)
       ========================================================= */
    function settings(box) {
        const skins = ((window.LOOKS && window.LOOKS.skins) || [{ id: '', name: 'Classic', swatch: '#333' }]).slice();
        skins.push({ id: 'hud', name: 'HUD (see-through)', swatch: 'repeating-conic-gradient(#666 0 25%, #999 0 50%) 0 0 / 10px 10px' });
        const els = ELEMENTS.filter(e => !e.always && !e.hidden && (!e.secret || UI.info.ui.ifaceOn));
        box.innerHTML =
            '<section><h3>Look</h3><div class="skin-grid">' + skins.map(s => '<button type="button" class="btn" data-skin="' + esc(s.id) + '"><span class="sw" style="background:' + esc(s.swatch) + '"></span>' + esc(s.name) + '</button>').join('') + '</div>' +
            '<label><input type="checkbox" data-ui="holidays"> Holiday looks on their day — Spooky on Halloween, Crimbus, the board’s birthdays and more (pick any look that day to skip it)</label>' +
            '<p class="hint">Right-click any window’s title for its own look, text size, see-through and always-on-top.</p></section>' +
            '<section><h3>Effects</h3><div class="row seg" data-set="fx"><button type="button" class="btn" data-v="simple">Simple</button><button type="button" class="btn" data-v="mid">Mid</button><button type="button" class="btn" data-v="advanced">Advanced</button></div>' +
            '<p class="hint">Simple has no animation at all — best for older computers. Mid adds a little motion; Advanced adds backdrops.</p></section>' +
            '<section><h3>Text size</h3><div class="row seg" data-set="font"><button type="button" class="btn" data-v="small">Small</button><button type="button" class="btn" data-v="normal">Normal</button><button type="button" class="btn" data-v="large">Large</button><button type="button" class="btn" data-v="huge">Larger</button></div></section>' +
            '<section><h3>Layout</h3><div class="row seg" data-set="layout"><button type="button" class="btn" data-v="windows">Separate windows</button><button type="button" class="btn" data-v="one">One window</button></div>' +
                '<p class="hint">Separate windows: the little radio, and each part in its own window. One window: everything together, laid out like the station’s site.</p></section>' +
            '<section><h3>Windows</h3><p class="hint">Switch off what you don’t use — its button leaves the radio.</p><div class="els">' +
                els.map(e => '<label><input type="checkbox" data-el="' + e.id + '"> ' + e.icon + ' ' + esc(e.label) + ' <span class="dim">— ' + esc(e.about) + '</span></label>').join('') + '</div>' +
                '<label><input type="checkbox" data-ui="onTop"> New windows stay on top of other programs</label>' +
                '<label><input type="checkbox" data-ui="hideWithRadio"> Minimising the radio tucks the other windows away too</label>' +
                '<label><input type="checkbox" data-ui="bannerInRadio"> Show the LED sign in the radio</label>' +
                '<label><input type="checkbox" data-ui="sideLeft"> Buttons on the left of the radio</label>' +
                '<label><input type="checkbox" data-ui="boardAsk"> Warn me before showing the board (18+)</label></section>' +
            '<section><h3>Updates</h3><label><input type="checkbox" data-ui="updates"> Get new versions by themselves (downloaded quietly; you choose when to restart)</label>' +
                '<p class="hint upd"></p><div class="row"><button type="button" class="btn" data-upd="check">Check now</button><button type="button" class="btn" data-upd="install" hidden>Restart to update</button><button type="button" class="btn" data-upd="page">Release notes ↗</button></div></section>' +
            '<section><h3>Alerts</h3><label><input type="checkbox" data-ui="alerts"> Tell me when the station goes live, and when the host sends a 📣 Ping</label>' +
                '<label><input type="checkbox" data-ui="chatSound"> A sound for new chat messages (🔔 in the Chat window does the same)</label>' +
                '<label><input type="checkbox" data-ui="openAtLogin"> Start with the computer, quietly in the tray</label></section>' +
            '<section><h3>Album downloads</h3><p class="dl-dir"></p><div class="row"><button type="button" class="btn" data-dl="pick">Change folder…</button><button type="button" class="btn" data-dl="open">Open folder</button></div>' +
                '<label><input type="checkbox" data-ui="askWhere"> Ask where to save each time</label>' +
                '<label><input type="checkbox" data-ui="lossless"> Lossless (FLAC or WAV) when the album has it — much bigger</label></section>' +
            '<section><h3>You</h3><form class="row me"><input name="n" maxlength="32" placeholder="Your name in chat and on calls" class="grow" style="width:auto"><button class="btn">Save</button></form>' +
            '<div class="row name-colors" title="Your name colour in chat and blug.dj/jej"></div></section>' +
            '<section><h3>Station</h3><p class="st dim"></p><div class="row"><button type="button" class="btn" data-st="stations">Stations…</button></div>' +
                '<form class="row ssh" hidden><input name="a" maxlength="120" placeholder="you@server" class="grow" style="width:auto" title="The station’s server, for its Studio (through SSH, with your key from ssh-agent)"><button class="btn">Save</button></form>' +
                '<p class="hint ssh-hint" hidden>Studio on a server: the tray’s Studio connects to it when this PC isn’t running the station. Empty to stop.</p></section>';

        function paint(i) {
            const ui = i.ui;
            const hol = UI.holidayOn();
            box.querySelectorAll('[data-skin]').forEach(b => b.classList.toggle('on', b.dataset.skin === (hol ? hol.skin : ui.skin || '')));
            box.querySelectorAll('.seg').forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === (ui[g.dataset.set] || (g.dataset.set === 'fx' ? 'simple' : 'normal')))));
            box.querySelectorAll('[data-el]').forEach(c => { c.checked = !ui.off.includes(c.dataset.el); });
            const v = { onTop: ui.onTop, hideWithRadio: ui.hideWithRadio, bannerInRadio: ui.bannerInRadio, sideLeft: ui.side === 'left', boardAsk: !ui.boardOk, alerts: i.alerts, openAtLogin: i.openAtLogin, askWhere: ui.askWhere, lossless: ui.lossless, updates: i.updates, holidays: ui.holidays !== false, chatSound: !!ui.chatSound };
            box.querySelectorAll('[data-ui]').forEach(c => { c.checked = !!v[c.dataset.ui]; });
            $('.dl-dir', box).innerHTML = 'Albums go to <b>' + esc(i.downloads) + '</b>';
            $('.st', box).textContent = (i.station ? i.station.name + ' — ' + i.station.pageUrl : 'No station') + ' · On Air ' + i.version;
            const u = i.update || {};
            $('.upd', box).textContent = 'You have ' + i.version + '. ' + ({ checking: 'Checking…', downloading: 'Downloading ' + u.version + '…', ready: u.version + ' is ready.', installing: 'Installing ' + u.version + '…', none: 'That’s the newest.', manual: u.version + ' is out — download it from the release page.', error: 'Couldn’t check just now.' }[u.status] || '');
            $('[data-upd="install"]', box).hidden = u.status !== 'ready';
            const sf = $('.ssh', box);
            sf.hidden = $('.ssh-hint', box).hidden = !i.ui.travelOn;
            if (document.activeElement !== sf.a) sf.a.value = i.studioSsh || '';
        }
        paint(UI.info); UI.onUi(paint);
        $('.me', box).n.value = core.name;
        // Your name colour, from the station's palette (the same one blug.dj/jej's Look offers).
        const nc = $('.name-colors', box);
        const paintColors = () => {
            nc.innerHTML = '<span class="hint">Name colour</span>' + ['', ...(window.HallNameColors || [])].map(c =>
                '<button type="button" class="nc' + (core.color === c ? ' on' : '') + '" data-c="' + c + '" title="' + (c || 'The usual') + '" style="' + (c ? 'background:' + c : '') + '">' + (c ? '' : '✕') + '</button>').join('');
        };
        paintColors();
        nc.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; core.setColor(b.dataset.c); paintColors(); };
        $('.me', box).onsubmit = (e) => { e.preventDefault(); if (core.setName(e.target.n.value)) UI.toast('Saved.'); };
        $('.ssh', box).onsubmit = async (e) => {
            e.preventDefault();
            const a = e.target.a.value.trim();
            if (a && !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(a)) return UI.toast('That should look like you@server.');
            const i = await app.setUi({ studioSsh: a });
            UI.toast(i.studioSsh ? 'Saved. Studio in the tray connects to ' + i.studioSsh + '.' : 'Saved: no server.');
        };
        box.onclick = async (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.skin != null) { const h = UI.holiday(); app.setUi(h ? { skin: b.dataset.skin, holidaySkip: h.day } : { skin: b.dataset.skin }); }
            else if (b.dataset.v && b.closest('.seg')) app.setUi({ [b.closest('.seg').dataset.set]: b.dataset.v });
            else if (b.dataset.dl === 'pick') app.pickFolder();
            else if (b.dataset.dl === 'open') app.showFolder(UI.info.downloads);
            else if (b.dataset.st === 'stations') app.stationsWindow();
            else if (b.dataset.upd) app.updateCmd(b.dataset.upd);
        };
        box.onchange = (e) => {
            const c = e.target;
            if (c.dataset.el) {
                const off = new Set(UI.info.ui.off);
                if (c.checked) off.delete(c.dataset.el); else off.add(c.dataset.el);
                app.setUi({ off: [...off] });
            } else if (c.dataset.ui) {
                const k = c.dataset.ui;
                if (k === 'sideLeft') app.setUi({ side: c.checked ? 'left' : 'right' });
                else if (k === 'boardAsk') app.setUi({ boardOk: !c.checked });
                else app.setUi({ [k]: c.checked });
            }
        };
    }
})();
