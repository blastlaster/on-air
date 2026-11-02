/* =============================================================
   THE HALL — a pixel room to hang out in while the station
   plays. Walk (click, WASD/arrows or a controller), dance and
   wave (1–5), and talk: what you say is the station's chat,
   and it comes out of your character's mouth. Radioman runs
   the show from his desk: he nods to the music and talks when
   someone is talking on air.

   The engine keeps only who is here and where they are going
   (engine/hall.js); each app animates the walking itself.
   ============================================================= */
(function () {
    'use strict';

    const EMOTES = [['wave', '👋', 'Wave'], ['dance', '💃', 'Dance'], ['jump', '⤴️', 'Jump'], ['sit', '🪑', 'Sit'], ['cheer', '🙌', 'Cheer'],
        ['clap', '👏', 'Clap'], ['point', '👉', 'Point'], ['spin', '🌀', 'Spin'], ['headbang', '🤘', 'Headbang'], ['sleep', '💤', 'Sleep']];
    // Seconds; the rest (dance, sit, headbang, sleep) last until you move.
    const ONE_SHOT = { wave: 2.4, jump: 1.2, cheer: 2.4, clap: 2.4, point: 2.4, spin: 1.6 };
    const HANDS = { rock: '✊', paper: '✋', scissors: '✌️' };
    // The emoji picker: anything to say, and things to carry (the same list as engine/hall.js HOLDS).
    const HOLDS = '🔪 🗡️ 🪓 🔨 🔫 🍳 🥖 🧹 🏹 💣 🏏 🎸 🎤 🥁 🎺 📻 📢 🍕 🍔 🌭 🍩 🍌 🐟 🍺 🥤 ☕ 🌹 💐 🎈 🎁 🏆 💰 💎 🔦 🕯️ 🎊 ⚽ 🏀 🎮 📱 🧸 🐸 🐈 👻 💀 🔥 ⭐ 🚩 📌 🛡️'.split(' ');
    // Name colours (the same list as engine/hall.js NAME_COLORS); Settings → You uses it too.
    const NAME_COLORS = window.HallNameColors = ['#ff6b6b', '#ff9f43', '#ffd34a', '#7ee36b', '#4fe0c0', '#00e0ff', '#5aa0ff', '#9f80ff', '#ff7ccc', '#ff4fd8', '#ffffff', '#c0c0c0'];
    const SAY = '😂 🤣 😭 😎 🤔 😳 😡 🥺 😈 🤡 😱 🥴 🤠 😴 🙄 😏 😤 🤝 👀 🙏 👍 👎 👋 👏 🙌 💪 🤘 ✌️ 👉 🤙 💯 ❤️ 💔 ✨ 🎉 🎶 💤 💢 ❓ ❗ 🆗 🔞 💩 🗿 🦀 🐸 🍆 🍑 🍀 7️⃣'.split(' ');
    const HAND_NAMES = { rock: 'rock', paper: 'paper', scissors: 'scissors' };
    const SPEED = 52;                                         // room pixels a second
    const FPS = 30;

    /**
     * Draws the Hall into `box`. `core` is the station connection (the app's
     * radio, or the FunpostFM page's listen.js); `ui` gives $, esc, askName
     * and toast (the app's UI by default). Returns { close } to leave.
     */
    window.HallView = function (box, { core, ui }) {
        const U = ui || window.UI, A = window.HallArt, { $, esc } = U, F = A.FLOOR;
        // Everything to undo on close (the app just closes the window; a page keeps going).
        const offs = [];
        let stopped = false;
        const sub = (ev, fn) => { const off = core.on(ev, fn, window); if (typeof off === 'function') offs.push(off); };
        const listen = (type, fn) => { window.addEventListener(type, fn); offs.push(() => window.removeEventListener(type, fn)); };
        box.classList.add('flush');
        box.innerHTML = '<div class="hall">' +
            '<div class="hall-stage"><canvas></canvas><div class="hall-tv" hidden></div><div class="hall-log"><div class="hall-log-top"><label><input type="checkbox" data-games> ⚔ games</label>' +
            '<button type="button" data-chatmove title="Move the chat">⇄</button><button type="button" data-chatsize="-1" title="Smaller">–</button>' +
            '<button type="button" data-chatsize="1" title="Bigger">+</button></div><ol class="hall-lines"></ol></div>' +
            '<div class="hall-pop" hidden></div><div class="hall-rps" hidden></div><div class="hall-msg" hidden></div></div>' +
            '<form class="hall-bar"><input maxlength="400" placeholder="Say something… (Enter)" autocomplete="off">' +
            '<button class="btn go">Say</button>' +
            '<span class="hall-emotes">' + EMOTES.map(([id, icon, name], i) => '<button type="button" class="btn" data-e="' + id + '" title="' + name + ' (' + (i + 1) + ')">' + icon + '</button>').join('') + '</span>' +
            '<button type="button" class="btn" data-emoji title="Emoji: put one in what you say, or carry one around">😀</button>' +
            '<button type="button" class="btn" data-chat title="Show or hide the chat">💬</button>' +
            '<button type="button" class="btn" data-look title="Change how you look">🎨 Look</button></form>' +
            '<div class="hall-emoji" hidden></div><div class="hall-look" hidden></div></div>';
        const stage = $('.hall-stage', box), cv = $('canvas', box), ctx = cv.getContext('2d');
        const popEl = $('.hall-pop', box), rpsEl = $('.hall-rps', box), emojiEl = $('.hall-emoji', box);
        const tvEl = $('.hall-tv', box), msgEl = $('.hall-msg', box), logBox = $('.hall-log', box), logEl = $('.hall-lines', box), bar = $('.hall-bar', box), input = $('input', bar), lookEl = $('.hall-look', box);
        const low = document.createElement('canvas'); low.width = A.W; low.height = A.H;
        const lc = low.getContext('2d');

        /* ---------- you ---------- */
        let look;
        try { look = JSON.parse(localStorage.getItem('ltl.hallLook') || 'null'); } catch { look = null; }
        if (!look || typeof look !== 'object') { look = A.randomLook(); saveLook(); }
        function saveLook() { try { localStorage.setItem('ltl.hallLook', JSON.stringify(look)); } catch { /* full */ } }

        /* ---------- the room's state ---------- */
        const people = new Map();         // h → { h, n, l, x, y, tx, ty, e, et, face, walking, say, sayUntil }
        let me = '', joined = false, pending = false, refused = false, air = { live: false, talking: false, music: false };
        let hostSay = null;               // Radioman's bubble: { text, until }
        const now = () => performance.now() / 1000;
        const toPx = (u, v) => [F.x0 + u / 1000 * (F.x1 - F.x0), F.y0 + v / 1000 * (F.y1 - F.y0)];
        const toU = (x, y) => [Math.round((x - F.x0) / (F.x1 - F.x0) * 1000), Math.round((y - F.y0) / (F.y1 - F.y0) * 1000)];
        const clampX = (x) => Math.max(F.x0, Math.min(F.x1, x)), clampY = (y) => Math.max(F.y0, Math.min(F.y1, y));

        function add(p) {
            const [x, y] = toPx(p.x, p.y);
            const old = people.get(p.h);
            people.set(p.h, { h: p.h, n: p.n, c: p.c || '', l: p.l, o: p.o || '', x: old ? old.x : x, y: old ? old.y : y, tx: x, ty: y, e: p.e || '', et: now(), face: 1, walking: false, say: '', sayUntil: 0 });
        }
        function notice(text) { msgEl.textContent = text || ''; msgEl.hidden = !text; }

        /* ---------- joining ---------- */
        function join() {
            if (refused || pending) return;
            if (!core.state.engineUp) return notice('blug.dj/jej opens when the station’s PC is on.');
            if (!core.name) { notice('Pick a name to walk in.'); return U.askName(core, join); }
            if (!core.send({ t: 'hall-join', look })) return notice('Connecting to the station…');
            pending = true;
            notice('Walking in…');
        }
        // Turned away (full, or closed): a click on the notice tries again.
        msgEl.addEventListener('click', (e) => { e.stopPropagation(); if (refused) { refused = false; join(); } });
        sub('connected', () => { joined = false; pending = false; join(); }, window);
        sub('state', (s) => {
            if (!s.engineUp) { joined = false; pending = false; people.clear(); me = ''; notice('blug.dj/jej opens when the station’s PC is on.'); }
            else if (!joined) join();
        }, window);
        listen('beforeunload', () => { if (joined) core.send({ t: 'hall-leave' }); });

        sub('hall', (m) => {
            switch (m.t) {
                case 'hall-welcome':
                    people.clear();
                    for (const p of m.people || []) add(p);
                    me = m.you; joined = true; pending = false; air = m.air || air;
                    games.clear();
                    for (const g of m.games || []) onGame(g, true);
                    notice('');
                    break;
                case 'hall-add': add(m.p); break;
                case 'hall-del': people.delete(m.h); break;
                case 'hall-at':
                    for (const [h, xy] of Object.entries(m.at || {})) {
                        const p = people.get(h);
                        if (!p || h === me) continue;
                        [p.tx, p.ty] = toPx(xy[0], xy[1]);
                        if (Math.hypot(p.tx - p.x, p.ty - p.y) > 120) { p.x = p.tx; p.y = p.ty; }     // too far behind: catch up
                        if (!ONE_SHOT[p.e]) p.e = '';                // dancing, sitting… stop when they walk
                    }
                    break;
                case 'hall-emote': { const p = people.get(m.h); if (p && m.h !== me) { p.e = m.e; p.et = now(); } break; }
                case 'hall-look': { const p = people.get(m.h); if (p) p.l = m.l; break; }
                case 'hall-name': { const p = people.get(m.h); if (p) { p.n = m.n; p.c = m.c || ''; } break; }
                case 'hall-hold': { const p = people.get(m.h); if (p) p.o = m.o; if (m.h === me) paintEmoji(); break; }
                case 'hall-rps': onGame(m); break;
                case 'hall-air': air = { live: m.live, talking: m.talking, music: m.music, screen: m.screen }; break;
                case 'hall-closed':
                    joined = false; pending = false; refused = true; people.clear(); me = '';
                    notice((m.reason || 'blug.dj/jej is closed right now.') + ' Click to try again.');
                    break;
            }
        }, window);

        /* ---------- chat: bubbles, and the whole conversation in a panel ---------- */
        // Everything said on the station (the app's Chat window too, and the show), kept while you're here.
        let chatOn = true;
        try { chatOn = localStorage.getItem('ltl.hallChat') !== '0'; } catch { /* default */ }
        logBox.hidden = !chatOn;
        /* Where the chat sits and how big: beside the room (right or left), or over the
           floor (bottom left or right); small, medium or large. Remembered. */
        const CHAT_POS = ['right', 'left', 'floatL', 'floatR'];
        const CHAT_POS_NAMES = { right: 'Chat beside the room, right', left: 'Chat beside the room, left', floatL: 'Chat over the floor, bottom left', floatR: 'Chat over the floor, bottom right' };
        const CHAT_SIZES = ['s', 'm', 'l'], CHAT_DIM = { s: [200, 22], m: [264, 32], l: [340, 46] };     // column width (px), floating height (%)
        let chatPos = 'right', chatSize = 'm';
        try { chatPos = localStorage.getItem('ltl.hallChatPos') || chatPos; chatSize = localStorage.getItem('ltl.hallChatSize') || chatSize; } catch { /* defaults */ }
        if (!CHAT_POS.includes(chatPos)) chatPos = 'right';
        if (!CHAT_SIZES.includes(chatSize)) chatSize = 'm';
        function layoutChat() {
            const [w, h] = CHAT_DIM[chatSize], sw = stage.clientWidth;
            // Beside the room only when there's still room for the room; otherwise over the floor.
            const docked = !logBox.hidden && (chatPos === 'right' || chatPos === 'left') && sw - w >= 480;
            const side = chatPos === 'left' || chatPos === 'floatL' ? 'left' : 'right';
            logBox.classList.toggle('docked', docked);
            logBox.classList.toggle('floating', !docked);
            logBox.classList.toggle('at-left', side === 'left');
            logBox.classList.toggle('at-right', side === 'right');
            logBox.style.width = (docked ? w : Math.min(w + 80, Math.round(sw * 0.6))) + 'px';
            logBox.style.maxHeight = docked ? '' : h + '%';
            stage.style.paddingLeft = docked && side === 'left' ? (w + 6) + 'px' : '';
            stage.style.paddingRight = docked && side === 'right' ? (w + 6) + 'px' : '';
        }
        $('.hall-log-top', logBox).addEventListener('click', (e) => {
            const mv = e.target.closest('[data-chatmove]'), sz = e.target.closest('[data-chatsize]');
            if (!mv && !sz) return;
            if (mv) { chatPos = CHAT_POS[(CHAT_POS.indexOf(chatPos) + 1) % CHAT_POS.length]; U.toast(CHAT_POS_NAMES[chatPos]); }
            if (sz) chatSize = CHAT_SIZES[Math.max(0, Math.min(2, CHAT_SIZES.indexOf(chatSize) + Number(sz.dataset.chatsize)))];
            try { localStorage.setItem('ltl.hallChatPos', chatPos); localStorage.setItem('ltl.hallChatSize', chatSize); } catch { /* full */ }
            layoutChat();
            logEl.scrollTop = logEl.scrollHeight;
        });
        listen('resize', layoutChat);
        // Rock paper scissors results in the chat: on unless you switch them off (the badges stay).
        const gamesBox = $('[data-games]', logBox);
        try { gamesBox.checked = localStorage.getItem('ltl.hallGames') !== '0'; } catch { gamesBox.checked = true; }
        logBox.classList.toggle('no-games', !gamesBox.checked);
        gamesBox.addEventListener('change', () => {
            logBox.classList.toggle('no-games', !gamesBox.checked);
            try { localStorage.setItem('ltl.hallGames', gamesBox.checked ? '1' : '0'); } catch { /* full */ }
            logEl.scrollTop = logEl.scrollHeight;
        });
        function logLine(m, cls) {
            if ((m.role === 'system' && !cls) || !m.text) return;
            const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
            const li = document.createElement('li');
            if (m.id) li.dataset.mid = m.id;
            if (cls) li.className = cls;
            // Links you can click (they open in a new tab, or the browser in the app); the game lines are plain.
            const text = !cls && window.LT && LT.linkText ? LT.linkText(m.text) : esc(m.text);
            li.innerHTML = (m.name ? '<b style="color:' + esc(m.color || '') + '">' + esc(m.name) + '</b> ' : '') + text;
            logEl.appendChild(li);
            while (logEl.children.length > 150) logEl.removeChild(logEl.firstChild);
            if (atBottom) logEl.scrollTop = logEl.scrollHeight;
        }
        logBox.addEventListener('click', (e) => e.stopPropagation());       // reading isn't walking
        for (const m of core.chat || []) logLine(m);                       // what was said before you came in
        const sayFor = (text) => Math.min(9, 3 + text.length * 0.06);
        sub('chat', (c) => {
            if (c.reset) { logEl.innerHTML = ''; c.reset.forEach((m) => logLine(m)); logEl.scrollTop = logEl.scrollHeight; return; }
            if (c.hide) {
                const li = logEl.querySelector('[data-mid="' + CSS.escape(String(c.hide)) + '"]');
                if (li) li.remove(); for (const p of people.values()) if (p.sayId === c.hide) p.sayUntil = 0; if (hostSay && hostSay.id === c.hide) hostSay = null; return; }
            const m = c.add;
            if (!m) return;
            logLine(m);
            const p = m.hid && people.get(m.hid);
            if (p) { p.say = m.text; p.sayId = m.id; p.sayUntil = now() + sayFor(m.text); }
            else if (m.role === 'host') hostSay = { text: m.text, id: m.id, until: now() + sayFor(m.text) };
        }, window);

        bar.onsubmit = (e) => {
            e.preventDefault();
            const text = input.value;
            if (!text.trim()) { input.blur(); return; }
            const go = () => { if (core.chatSend(text)) input.value = ''; else U.toast('Chat is reconnecting…'); };
            if (!core.name) U.askName(core, go); else go();
        };

        /* ---------- moving ---------- */
        const keys = new Set();
        let sentAt = 0, lastSent = '', padWas = [];
        function mine() { return people.get(me); }
        function sendGo(x, y) {
            const [u, v] = toU(x, y), k = u + ',' + v;
            if (k === lastSent) return;
            lastSent = k; sentAt = now();
            core.send({ t: 'hall-go', x: u, y: v });
        }
        function emote(id) {
            const p = mine();
            if (!p) return;
            const next = p.e === id && !ONE_SHOT[id] ? '' : id;
            p.e = next; p.et = now();
            core.send({ t: 'hall-emote', e: next });
        }
        /** Someone (not you) under the pointer: their feet are at (x, y), about 9×20 room pixels above that. */
        function personAt(x, y) {
            let hit = null;
            for (const q of people.values()) if (q.h !== me && Math.abs(q.x - x) <= 5 && y <= q.y + 2 && y >= q.y - 20 && (!hit || q.y > hit.y)) hit = q;
            return hit;
        }
        stage.addEventListener('click', (e) => {
            const p = mine();
            if (!p) return;
            const r = cv.getBoundingClientRect();
            const rx = (e.clientX - r.left) / r.width * A.W, ry = (e.clientY - r.top) / r.height * A.H;
            const q = personAt(rx, ry);
            if (q) return openPop(q, e);
            popEl.hidden = true;
            const x = clampX(rx), y = clampY(ry);
            p.tx = x; p.ty = y; p.e = '';
            sendGo(x, y);
        });

        /* ---------- emoji: in what you say, or in your hand ---------- */
        let emojiTab = 'say';
        function paintEmoji() {
            if (emojiEl.hidden) return;
            const held = (mine() || {}).o || '';
            const list = emojiTab === 'hold' ? HOLDS : SAY.concat(HOLDS);
            emojiEl.innerHTML = '<div class="he-tabs"><button type="button" class="btn' + (emojiTab === 'say' ? ' on' : '') + '" data-tab="say">💬 Say</button>' +
                '<button type="button" class="btn' + (emojiTab === 'hold' ? ' on' : '') + '" data-tab="hold">✋ Hold</button>' +
                (held ? '<button type="button" class="btn" data-drop>Drop ' + held + '</button>' : '') +
                '<span class="he-hint">' + (emojiTab === 'hold' ? 'Carry it around — everyone sees it' : 'Adds it to what you’re typing') + '</span>' +
                '<button type="button" class="btn he-x" data-close title="Close">✕</button></div>' +
                '<div class="he-grid">' + list.map(e => '<button type="button" class="he-e' + (e === held ? ' on' : '') + '" data-em="' + e + '">' + e + '</button>').join('') + '</div>';
        }
        function hold(o) {
            const p = mine();
            if (!p) return;
            p.o = o;
            core.send({ t: 'hall-hold', o });
            paintEmoji();
        }
        emojiEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const t = e.target.closest('[data-tab]'), em = e.target.closest('[data-em]');
            if (t) { emojiTab = t.dataset.tab; return paintEmoji(); }
            if (e.target.closest('[data-close]')) { emojiEl.hidden = true; return; }
            if (e.target.closest('[data-drop]')) return hold('');
            if (!em) return;
            const v = em.dataset.em;
            if (emojiTab === 'hold') { hold((mine() || {}).o === v ? '' : v); emojiEl.hidden = true; return; }
            // Into the message, where the cursor is; the picker stays open for more.
            const a = input.selectionStart == null ? input.value.length : input.selectionStart, b = input.selectionEnd == null ? a : input.selectionEnd;
            input.value = (input.value.slice(0, a) + v + input.value.slice(b)).slice(0, 400);
            input.focus();
            input.setSelectionRange(a + v.length, a + v.length);
        });
        /** What everyone is carrying, in the hand on the side they face. */
        function drawHeld(sorted, heads, u) {
            const fs = Math.max(14, Math.round(5.5 * u / dpr)) * dpr;
            ctx.font = fs + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (const p of sorted) {
                if (!p.o || !heads.has(p.h)) continue;
                const f = p.face < 0 ? -1 : 1, x = (p.x + f * 6) * u, y = (heads.get(p.h) + 10) * u;
                ctx.save();
                ctx.translate(Math.round(x), Math.round(y));
                ctx.scale(-f, 1);                     // emoji face left; turn them the way their holder faces
                ctx.fillText(p.o, 0, 0);
                ctx.restore();
            }
        }

        /* ---------- rock paper scissors ---------- */
        // id → { id, a, b, state, picks, win, until }: shown over both players, finished ones for a few seconds.
        const games = new Map();
        let myPick = '';
        const nameOf = (h) => (people.get(h) || {}).n || 'someone';
        function openPop(q, e) {
            const sr = stage.getBoundingClientRect();
            popEl.innerHTML = '<b>' + esc(q.n) + '</b><button type="button" class="btn" data-rps="' + esc(q.h) + '">✊✋✌️ Rock paper scissors</button>';
            popEl.style.left = Math.min(sr.width - 220, Math.max(4, e.clientX - sr.left + 8)) + 'px';
            popEl.style.top = Math.max(4, e.clientY - sr.top - 30) + 'px';
            popEl.hidden = false;
        }
        popEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const b = e.target.closest('[data-rps]');
            if (!b) return;
            core.send({ t: 'hall-rps', to: b.dataset.rps });
            popEl.hidden = true;
        });
        function onGame(g, quiet) {
            const t = now(), old = games.get(g.id);
            const keep = { asked: 21, picking: 16, done: 7, declined: 3.5, expired: 3.5, gone: 0 }[g.state] || 0;
            if (!keep) games.delete(g.id); else games.set(g.id, { ...g, until: t + keep, at: old ? old.at : t });
            if (g.a === me || g.b === me) {
                if (g.state !== 'picking') myPick = '';
                if (g.state === 'asked' && g.b === me) U.toast(nameOf(g.a) + ' challenges you to rock paper scissors!');
            }
            if (quiet) return;
            const A_ = nameOf(g.a), B_ = nameOf(g.b);
            let text = '';
            if (g.state === 'asked') text = A_ + ' challenges ' + B_ + ' to rock paper scissors…';
            else if (g.state === 'declined') text = B_ + ' said no to ' + A_ + '.';
            else if (g.state === 'expired') text = 'The game between ' + A_ + ' and ' + B_ + ' ran out of time.';
            else if (g.state === 'done') {
                const pa = g.picks[g.a], pb = g.picks[g.b];
                text = A_ + ' ' + HANDS[pa] + ' vs ' + HANDS[pb] + ' ' + B_ + ' — ' +
                    (!g.win ? 'a draw!' : nameOf(g.win) + ' wins (' + HAND_NAMES[g.win === g.a ? pa : pb] + ' beats ' + HAND_NAMES[g.win === g.a ? pb : pa] + ')!');
            }
            if (text) logLine({ text: '⚔ ' + text }, 'game');
            paintRps();
        }
        /** Your part in a game: answer a challenge, or pick. */
        function paintRps() {
            const g = [...games.values()].find(x => (x.a === me || x.b === me) && (x.state === 'asked' || x.state === 'picking'));
            let html = '';
            if (g && g.state === 'asked' && g.b === me) {
                html = '<p><b>' + esc(nameOf(g.a)) + '</b> challenges you to rock paper scissors!</p>' +
                    '<div><button type="button" class="btn go" data-ans="1">Accept</button><button type="button" class="btn" data-ans="0">No thanks</button></div>';
            } else if (g && g.state === 'asked') {
                html = '<p>Waiting for <b>' + esc(nameOf(g.b)) + '</b> to accept…</p>';
            } else if (g && g.state === 'picking' && !myPick) {
                html = '<p>Rock, paper or scissors? (vs <b>' + esc(nameOf(g.a === me ? g.b : g.a)) + '</b>)</p><div>' +
                    Object.keys(HANDS).map(k => '<button type="button" class="btn hand" data-pick="' + k + '" title="' + k + '">' + HANDS[k] + '</button>').join('') + '</div>';
            } else if (g && g.state === 'picking') {
                html = '<p>You picked ' + HANDS[myPick] + ' — waiting for <b>' + esc(nameOf(g.a === me ? g.b : g.a)) + '</b>…</p>';
            }
            if (rpsEl.innerHTML !== html) rpsEl.innerHTML = html;
            rpsEl.hidden = !html;
            rpsEl.dataset.id = g ? g.id : '';
        }
        rpsEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = rpsEl.dataset.id, a = e.target.closest('[data-ans]'), p = e.target.closest('[data-pick]');
            if (a) core.send({ t: 'hall-rps-answer', id, ok: a.dataset.ans === '1' });
            if (p) { myPick = p.dataset.pick; core.send({ t: 'hall-rps-pick', id, pick: myPick }); paintRps(); }
        });
        /** Over the players' heads: who's playing, and how it came out. */
        function gameBadges(t, u, heads) {
            for (const [id, g] of games) {
                if (t > g.until) { games.delete(id); paintRps(); continue; }
                for (const h of [g.a, g.b]) {
                    const p = people.get(h);
                    if (!p || !heads.has(h)) continue;
                    let label = '', win = false;
                    if (g.state === 'asked') label = h === g.a ? '⚔' : '⚔?';
                    else if (g.state === 'picking') label = Math.floor(t * 2) % 2 ? '✊' : '✌️';
                    else if (g.state === 'done') { label = HANDS[g.picks[h]] + (g.win === h ? ' WIN!' : !g.win ? ' DRAW' : ''); win = g.win === h; }
                    else if (g.state === 'declined') label = h === g.b ? '🙅' : '';
                    else if (g.state === 'expired') label = '⌛';
                    if (label) badge(label, (p.x + 8) * u, (heads.get(h) - 2) * u, u, win);
                }
            }
        }
        function badge(text, x, y, u, gold) {
            const fs = Math.max(12, Math.round(3.6 * u / dpr)) * dpr;
            ctx.font = 'bold ' + fs + 'px "Courier New", monospace';
            const w = ctx.measureText(text).width + fs * 0.6, h = fs * 1.3;
            ctx.fillStyle = gold ? '#ffd34a' : 'rgba(0,0,0,0.75)';
            ctx.fillRect(Math.round(x), Math.round(y - h), Math.round(w), Math.round(h));
            ctx.fillStyle = gold ? '#1a1206' : '#ffffff';
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(text, Math.round(x + fs * 0.3), Math.round(y - h / 2));
        }
        const typing = () => document.activeElement && /input|textarea/i.test(document.activeElement.tagName);
        listen('keydown', (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (typing()) { if (e.key === 'Escape') input.blur(); return; }
            if (!lookEl.hidden && e.key === 'Escape') { lookEl.hidden = true; return; }
            if (!emojiEl.hidden && e.key === 'Escape') { emojiEl.hidden = true; return; }
            if (e.key === 'Enter') { input.focus(); e.preventDefault(); return; }
            const k = e.key.toLowerCase();
            if (/^[0-9]$/.test(k)) { emote(EMOTES[(+k + 9) % 10][0]); return; }      // 1–9, then 0 for the tenth
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); }
        });
        listen('keyup', (e) => keys.delete(e.key.toLowerCase()));
        listen('blur', () => keys.clear());
        bar.addEventListener('click', (e) => {
            const b = e.target.closest('[data-e]');
            if (b) { emote(b.dataset.e); return; }
            if (e.target.closest('[data-emoji]')) { emojiEl.hidden = !emojiEl.hidden; if (!emojiEl.hidden) paintEmoji(); return; }
            if (e.target.closest('[data-chat]')) {
                chatOn = !chatOn; logBox.hidden = !chatOn; layoutChat();
                if (chatOn) logEl.scrollTop = logEl.scrollHeight;
                try { localStorage.setItem('ltl.hallChat', chatOn ? '1' : '0'); } catch { /* full */ }
                return;
            }
            if (e.target.closest('[data-look]')) openLook();
        });

        /** Keys or a controller: which way you're pushing, or null. */
        function pushing() {
            let dx = 0, dy = 0;
            if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
            if (keys.has('d') || keys.has('arrowright')) dx += 1;
            if (keys.has('w') || keys.has('arrowup')) dy -= 1;
            if (keys.has('s') || keys.has('arrowdown')) dy += 1;
            const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
            const g = pads[0];
            if (g) {
                const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
                if (Math.abs(ax) > 0.25) dx += ax;
                if (Math.abs(ay) > 0.25) dy += ay;
                const b = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
                if (b(14)) dx -= 1; if (b(15)) dx += 1; if (b(12)) dy -= 1; if (b(13)) dy += 1;
                // Face buttons: dance, wave, jump, cheer (on press, not while held).
                [[0, 'dance'], [2, 'wave'], [1, 'jump'], [3, 'cheer']].forEach(([i, id]) => { if (b(i) && !padWas[i]) emote(id); padWas[i] = b(i); });
            }
            const len = Math.hypot(dx, dy);
            return len > 0.1 ? [dx / Math.max(1, len), dy / Math.max(1, len)] : null;
        }

        function step(dt) {
            const t = now(), p = mine();
            if (p) {
                const push = pushing();
                if (push) {
                    p.x = clampX(p.x + push[0] * SPEED * dt);
                    p.y = clampY(p.y + push[1] * SPEED * 0.7 * dt);
                    p.tx = p.x; p.ty = p.y; p.walking = true; p.e = '';
                    if (Math.abs(push[0]) > 0.2) p.face = push[0] < 0 ? -1 : 1;
                    // Tell the room where you'll be a moment from now, a few times a second.
                    if (t - sentAt > 0.22) sendGo(clampX(p.x + push[0] * SPEED * 0.3), clampY(p.y + push[1] * SPEED * 0.2));
                    p.pushed = true;
                } else if (p.pushed) { p.pushed = false; sendGo(p.x, p.y); }
            }
            for (const q of people.values()) {
                if (q.pushed) continue;
                const dx = q.tx - q.x, dy = q.ty - q.y, d = Math.hypot(dx, dy);
                q.walking = d > 0.6;
                if (q.walking) {
                    const s = Math.min(d, SPEED * dt);
                    q.x += dx / d * s; q.y += dy / d * s;
                    if (Math.abs(dx) > 0.5) q.face = dx < 0 ? -1 : 1;
                }
                if (ONE_SHOT[q.e] && t - q.et > ONE_SHOT[q.e]) q.e = '';
            }
        }

        /* ---------- drawing ---------- */
        let scale = 3, dpr = 1;
        function fit() {
            // The room's space: the stage less any padding (the chat column takes some when the window is wide).
            const r = stage.getBoundingClientRect(), cs = getComputedStyle(stage);
            const w = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), hgt = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
            let k = Math.min(w / A.W, hgt / A.H);
            if (k >= 2) k = Math.floor(k);                                  // whole pixels when there's room
            scale = Math.max(0.5, k);
            dpr = Math.min(2, window.devicePixelRatio || 1);
            cv.style.width = Math.round(A.W * scale) + 'px';
            cv.style.height = Math.round(A.H * scale) + 'px';
            cv.width = Math.round(A.W * scale * dpr);
            cv.height = Math.round(A.H * scale * dpr);
        }
        layoutChat();
        const ro = new ResizeObserver(fit);
        ro.observe(stage);
        offs.push(() => ro.disconnect());

        function wrap(text, maxW, lines) {
            const words = String(text).replace(/\s+/g, ' ').trim().split(' '), out = [];
            let cur = '';
            for (const w of words) {
                const next = cur ? cur + ' ' + w : w;
                if (ctx.measureText(next).width <= maxW || !cur) cur = next;
                else { out.push(cur); cur = w; if (out.length === lines) break; }
            }
            if (out.length < lines && cur) out.push(cur);
            if (out.length === lines && words.join(' ').length > out.join(' ').length) out[lines - 1] = out[lines - 1].replace(/.?.?.?$/, '…');
            return out.map(s => { while (ctx.measureText(s).width > maxW && s.length > 2) s = s.slice(0, -2) + '…'; return s; });
        }
        function bubble(text, x, y, u) {
            const fs = Math.max(11, Math.round(3.3 * u / dpr)) * dpr;
            ctx.font = 'bold ' + fs + 'px "Courier New", monospace';
            const lines = wrap(text, 70 * u, 3), lh = fs * 1.15, pad = Math.round(fs * 0.45);
            const w = Math.max(...lines.map(s => ctx.measureText(s).width)) + pad * 2, h = lines.length * lh + pad * 1.4;
            let bx = Math.round(x - w / 2), by = Math.round(y - h - 3 * u);
            bx = Math.max(2, Math.min(cv.width - w - 2, bx)); by = Math.max(2, by);
            const s = Math.max(1, Math.round(u / 2));
            ctx.fillStyle = '#000'; ctx.fillRect(bx - s, by - s, w + 2 * s, h + 2 * s);
            ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, w, h);
            const tx = Math.max(bx + s * 2, Math.min(bx + w - s * 4, Math.round(x - s)));
            ctx.fillRect(tx, by + h, s * 2, s * 2); ctx.fillStyle = '#000'; ctx.fillRect(tx - s, by + h, s, s * 2); ctx.fillRect(tx + s * 2, by + h, s, s * 2); ctx.fillRect(tx, by + h + s * 2, s * 2, s);
            ctx.fillStyle = '#141018'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            lines.forEach((ln, i) => ctx.fillText(ln, bx + w / 2, by + pad * 0.8 + i * lh));
        }

        /* FunpostTV on the stage screen, when the studio chose it and the stream is on.
           Sound off: everyone keeps listening to the radio. Clicks go through to the floor. */
        let tvVid = '';
        function screenTv(on, vid) {
            const want = on && vid ? vid : '';
            if (want !== tvVid) {
                tvVid = want;
                tvEl.innerHTML = want ? '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(want) +
                    '?autoplay=1&mute=1&controls=0&rel=0&playsinline=1&modestbranding=1" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" tabindex="-1" title="FunpostTV"></iframe>' : '';
                tvEl.hidden = !want;
            }
            if (!want) return false;
            const r = cv.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = r.width / A.W, S = A.SCREEN;
            const css = 'left:' + (r.left - sr.left + S.x * k) + 'px;top:' + (r.top - sr.top + S.y * k) + 'px;width:' + (S.w * k) + 'px;height:' + (S.h * k) + 'px';
            if (tvEl.style.cssText !== css) tvEl.style.cssText = css;
            return true;
        }

        let last = 0;
        function frame(ms) {
            if (stopped) return;
            requestAnimationFrame(frame);
            if (document.hidden || ms - last < 1000 / FPS - 2) return;
            const dt = Math.min(0.1, (ms - (last || ms)) / 1000);
            last = ms;
            step(dt);
            const t = now(), s = core.state, tr = s.track;
            // In the room, the station says; outside it, the radio's own idea of what's on.
            const onAir = joined ? air : { live: s.live, talking: false, music: !!tr };
            const tv = screenTv(joined && air.screen === 'tv' && s.tv && s.tv.live, s.tv && s.tv.videoId);
            const sign = s.banner && s.banner.on ? { items: s.banner.items || [], color: s.banner.color } : null;
            A.room(lc, t, onAir, { station: s.name, song: tr ? [tr.artist, tr.title].filter(Boolean).join(' - ') : '', tv, sign });
            A.radioman(lc, t, onAir);
            const sorted = [...people.values()].sort((a, b) => a.y - b.y);
            const heads = new Map();
            for (const p of sorted) {
                heads.set(p.h, A.person(lc, p.l, { x: p.x, y: p.y, face: p.face, step: p.walking ? Math.floor(t * 8) % 2 : undefined, emote: p.e, et: t - p.et, t, talk: p.sayUntil > t }));
            }
            A.lights(lc, t, onAir);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(low, 0, 0, cv.width, cv.height);
            // Names under feet, bubbles over heads, at screen resolution.
            const u = cv.width / A.W, nfs = Math.max(10, Math.round(2.6 * u / dpr)) * dpr;
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            for (const p of sorted) {
                ctx.font = 'bold ' + nfs + 'px "Courier New", monospace';
                const nx = p.x * u, ny = (p.y + 1.5) * u;
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(p.n, nx + dpr, ny + dpr);
                ctx.fillStyle = p.c || (p.h === me ? '#ffd34a' : '#e6e0f2'); ctx.fillText(p.n, nx, ny);
                if (p.h === me) ctx.fillRect(Math.round(nx - ctx.measureText(p.n).width / 2), Math.round(ny + nfs + dpr), Math.round(ctx.measureText(p.n).width), Math.max(1, dpr));   // underlined: that's you
            }
            drawHeld(sorted, heads, u);
            for (const p of sorted) if (p.sayUntil > t) bubble(p.say, p.x * u, heads.get(p.h) * u, u);
            gameBadges(t, u, heads);
            if (hostSay && hostSay.until > t) bubble(hostSay.text, (A.RADIOMAN_MOUTH.x + 16) * u, (A.RADIOMAN_MOUTH.y - 6) * u, u);
        }

        /* ---------- your look ---------- */
        let lookSendT = null, lookSentAt = 0;
        function sendLook() {
            clearTimeout(lookSendT);
            const wait = Math.max(0, 1600 - (Date.now() - lookSentAt));
            lookSendT = setTimeout(() => { lookSentAt = Date.now(); core.send({ t: 'hall-look', look }); }, Math.max(400, wait));
        }
        function openLook() {
            lookEl.hidden = false;
            lookEl.onsubmit = (e) => {
                e.preventDefault();
                const v = e.target.n.value;
                if (core.setName && core.setName(v)) { U.toast('You’re ' + v.trim().slice(0, 32) + ' now.'); paintLook(); }
            };
            lookEl.innerHTML = '<div class="hl-card"><canvas class="hl-prev" width="24" height="26"></canvas><div class="hl-parts">' +
                A.PARTS.map(p => '<div class="hl-row"><span>' + p.label + '</span><div>' +
                    (p.colors ? p.colors.map((c, i) => '<button type="button" class="hl-sw" data-k="' + p.key + '" data-v="' + i + '" style="background:' + c + '" title="' + p.label + ' ' + (i + 1) + '"></button>').join('')
                        : p.names.map((n, i) => '<button type="button" class="btn hl-nm" data-k="' + p.key + '" data-v="' + i + '">' + n + '</button>').join('')) +
                    '</div></div>').join('') +
                '<div class="hl-row"><span>Name</span><form class="hl-name"><input name="n" maxlength="32" value="' + esc(core.name || '') + '" placeholder="Your name">' +
                    '<button class="btn">Save</button></form></div>' +
                '<div class="hl-row"><span>Name colour</span><div>' + ['', ...NAME_COLORS].map(c =>
                    '<button type="button" class="hl-sw hl-nc" data-nc="' + c + '" title="' + (c || 'The usual') + '" style="background:' + (c || '#2a2438') + '">' + (c ? '' : '✕') + '</button>').join('') + '</div></div>' +
                '</div><div class="hl-foot"><button type="button" class="btn" data-rand>🎲 Surprise me</button><button type="button" class="btn btn-primary" data-done>Done</button></div></div>';
            paintLook();
        }
        function paintLook() {
            for (const b of lookEl.querySelectorAll('[data-k]')) b.classList.toggle('on', look[b.dataset.k] === +b.dataset.v);
            for (const b of lookEl.querySelectorAll('[data-nc]')) b.classList.toggle('on', (core.color || '') === b.dataset.nc);
            const pc = $('.hl-prev', lookEl);
            if (!pc) return;
            const g = pc.getContext('2d');
            g.clearRect(0, 0, 24, 26);
            A.person(g, look, { x: 12, y: 24, face: 1, t: now(), emote: 'wave', et: 0 });
        }
        lookEl.addEventListener('click', (e) => {
            const b = e.target.closest('[data-k]'), nc = e.target.closest('[data-nc]');
            if (nc) {
                // Your name colour, for chat and your tag here: it goes with your name, so the station knows it.
                if (core.setColor) core.setColor(nc.dataset.nc);
                const p = mine(); if (p) p.c = nc.dataset.nc;
                return paintLook();
            }
            if (b) { look[b.dataset.k] = +b.dataset.v; }
            else if (e.target.closest('[data-rand]')) look = A.randomLook();
            else if (e.target.closest('[data-done]') || e.target === lookEl) { lookEl.hidden = true; return; }
            else return;
            saveLook(); paintLook();
            const p = mine(); if (p) p.l = { ...look };
            sendLook();
        });
        const lookT = setInterval(() => { if (!lookEl.hidden) paintLook(); }, 160);
        offs.push(() => clearInterval(lookT));

        fit();
        join();
        requestAnimationFrame(frame);

        return {
            close() {
                if (stopped) return;
                stopped = true;
                if (joined) core.send({ t: 'hall-leave' });
                joined = false;
                for (const off of offs) { try { off(); } catch { /* gone */ } }
                tvEl.innerHTML = '';
            }
        };
    };
})();
