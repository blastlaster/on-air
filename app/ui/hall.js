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

    const EMOTES = [['wave', '👋', 'Wave'], ['dance', '💃', 'Dance'], ['jump', '⤴️', 'Jump'], ['sit', '🪑', 'Sit'], ['cheer', '🙌', 'Cheer']];
    const ONE_SHOT = { wave: 2.4, jump: 1.2, cheer: 2.4 };      // seconds; dance and sit last until you move
    const SPEED = 52;                                         // room pixels a second
    const FPS = 30;

    window.HallView = function (box, { core }) {
        const A = window.HallArt, { $, esc } = UI, F = A.FLOOR;
        box.classList.add('flush');
        box.innerHTML = '<div class="hall">' +
            '<div class="hall-stage"><canvas></canvas><div class="hall-tv" hidden></div><ol class="hall-log"></ol><div class="hall-msg" hidden></div></div>' +
            '<form class="hall-bar"><input maxlength="400" placeholder="Say something… (Enter)" autocomplete="off">' +
            '<button class="btn go">Say</button>' +
            '<span class="hall-emotes">' + EMOTES.map(([id, icon, name], i) => '<button type="button" class="btn" data-e="' + id + '" title="' + name + ' (' + (i + 1) + ')">' + icon + '</button>').join('') + '</span>' +
            '<button type="button" class="btn" data-look title="Change how you look">🎨 Look</button></form>' +
            '<div class="hall-look" hidden></div></div>';
        const stage = $('.hall-stage', box), cv = $('canvas', box), ctx = cv.getContext('2d');
        const tvEl = $('.hall-tv', box), msgEl = $('.hall-msg', box), logEl = $('.hall-log', box), bar = $('.hall-bar', box), input = $('input', bar), lookEl = $('.hall-look', box);
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
            people.set(p.h, { h: p.h, n: p.n, l: p.l, x: old ? old.x : x, y: old ? old.y : y, tx: x, ty: y, e: p.e || '', et: now(), face: 1, walking: false, say: '', sayUntil: 0 });
        }
        function notice(text) { msgEl.textContent = text || ''; msgEl.hidden = !text; }

        /* ---------- joining ---------- */
        function join() {
            if (refused || pending) return;
            if (!core.state.engineUp) return notice('The Hall opens when the station’s PC is on.');
            if (!core.name) { notice('Pick a name to walk in.'); return UI.askName(core, join); }
            if (!core.send({ t: 'hall-join', look })) return notice('Connecting to the station…');
            pending = true;
            notice('Walking in…');
        }
        // Turned away (full, or closed): a click on the notice tries again.
        msgEl.addEventListener('click', (e) => { e.stopPropagation(); if (refused) { refused = false; join(); } });
        core.on('connected', () => { joined = false; pending = false; join(); }, window);
        core.on('state', (s) => {
            if (!s.engineUp) { joined = false; pending = false; people.clear(); me = ''; notice('The Hall opens when the station’s PC is on.'); }
            else if (!joined) join();
        }, window);
        window.addEventListener('beforeunload', () => { if (joined) core.send({ t: 'hall-leave' }); });

        core.on('hall', (m) => {
            switch (m.t) {
                case 'hall-welcome':
                    people.clear();
                    for (const p of m.people || []) add(p);
                    me = m.you; joined = true; pending = false; air = m.air || air;
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
                        if (p.e === 'sit' || p.e === 'dance') p.e = '';
                    }
                    break;
                case 'hall-emote': { const p = people.get(m.h); if (p && m.h !== me) { p.e = m.e; p.et = now(); } break; }
                case 'hall-look': { const p = people.get(m.h); if (p) p.l = m.l; break; }
                case 'hall-name': { const p = people.get(m.h); if (p) p.n = m.n; break; }
                case 'hall-air': air = { live: m.live, talking: m.talking, music: m.music }; break;
                case 'hall-closed':
                    joined = false; pending = false; refused = true; people.clear(); me = '';
                    notice((m.reason || 'The Hall is closed right now.') + ' Click to try again.');
                    break;
            }
        }, window);

        /* ---------- chat: bubbles, and a few lines along the bottom ---------- */
        function logLine(m) {
            if (m.role === 'system' || !m.text) return;
            const li = document.createElement('li');
            li.innerHTML = '<b style="color:' + esc(m.color || '') + '">' + esc(m.name) + '</b> ' + esc(m.text);
            logEl.appendChild(li);
            while (logEl.children.length > 5) logEl.removeChild(logEl.firstChild);
            setTimeout(() => li.classList.add('old'), 15000);
        }
        const sayFor = (text) => Math.min(9, 3 + text.length * 0.06);
        core.on('chat', (c) => {
            if (c.reset) { logEl.innerHTML = ''; c.reset.slice(-3).forEach(logLine); return; }
            if (c.hide) { for (const p of people.values()) if (p.sayId === c.hide) p.sayUntil = 0; if (hostSay && hostSay.id === c.hide) hostSay = null; return; }
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
            const go = () => { if (core.chatSend(text)) input.value = ''; else UI.toast('Chat is reconnecting…'); };
            if (!core.name) UI.askName(core, go); else go();
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
        stage.addEventListener('click', (e) => {
            const p = mine();
            if (!p) return;
            const r = cv.getBoundingClientRect();
            const x = clampX((e.clientX - r.left) / r.width * A.W), y = clampY((e.clientY - r.top) / r.height * A.H);
            p.tx = x; p.ty = y; p.e = '';
            sendGo(x, y);
        });
        const typing = () => document.activeElement && /input|textarea/i.test(document.activeElement.tagName);
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (typing()) { if (e.key === 'Escape') input.blur(); return; }
            if (!lookEl.hidden && e.key === 'Escape') { lookEl.hidden = true; return; }
            if (e.key === 'Enter') { input.focus(); e.preventDefault(); return; }
            const k = e.key.toLowerCase();
            if (/^[1-5]$/.test(k)) { emote(EMOTES[+k - 1][0]); return; }
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); }
        });
        window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
        window.addEventListener('blur', () => keys.clear());
        bar.addEventListener('click', (e) => {
            const b = e.target.closest('[data-e]');
            if (b) { emote(b.dataset.e); return; }
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
            const r = stage.getBoundingClientRect();
            let k = Math.min(r.width / A.W, r.height / A.H);
            if (k >= 2) k = Math.floor(k);                                  // whole pixels when there's room
            scale = Math.max(0.5, k);
            dpr = Math.min(2, window.devicePixelRatio || 1);
            cv.style.width = Math.round(A.W * scale) + 'px';
            cv.style.height = Math.round(A.H * scale) + 'px';
            cv.width = Math.round(A.W * scale * dpr);
            cv.height = Math.round(A.H * scale * dpr);
        }
        new ResizeObserver(fit).observe(stage);

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
                    '?autoplay=1&mute=1&controls=0&rel=0&playsinline=1&modestbranding=1" allow="autoplay; encrypted-media" tabindex="-1" title="FunpostTV"></iframe>' : '';
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
            requestAnimationFrame(frame);
            if (document.hidden || ms - last < 1000 / FPS - 2) return;
            const dt = Math.min(0.1, (ms - (last || ms)) / 1000);
            last = ms;
            step(dt);
            const t = now(), s = core.state, tr = s.track;
            // In the room, the station says; outside it, the radio's own idea of what's on.
            const onAir = joined ? air : { live: s.live, talking: false, music: !!tr };
            const tv = screenTv(joined && air.screen === 'tv' && s.tv && s.tv.live, s.tv && s.tv.videoId);
            A.room(lc, t, onAir, { station: s.name, song: tr ? [tr.artist, tr.title].filter(Boolean).join(' - ') : '', tv });
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
                ctx.fillStyle = p.h === me ? '#ffd34a' : '#e6e0f2'; ctx.fillText(p.n, nx, ny);
            }
            for (const p of sorted) if (p.sayUntil > t) bubble(p.say, p.x * u, heads.get(p.h) * u, u);
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
            lookEl.innerHTML = '<div class="hl-card"><canvas class="hl-prev" width="24" height="26"></canvas><div class="hl-parts">' +
                A.PARTS.map(p => '<div class="hl-row"><span>' + p.label + '</span><div>' +
                    (p.colors ? p.colors.map((c, i) => '<button type="button" class="hl-sw" data-k="' + p.key + '" data-v="' + i + '" style="background:' + c + '" title="' + p.label + ' ' + (i + 1) + '"></button>').join('')
                        : p.names.map((n, i) => '<button type="button" class="btn hl-nm" data-k="' + p.key + '" data-v="' + i + '">' + n + '</button>').join('')) +
                    '</div></div>').join('') +
                '</div><div class="hl-foot"><button type="button" class="btn" data-rand>🎲 Surprise me</button><button type="button" class="btn btn-primary" data-done>Done</button></div></div>';
            paintLook();
        }
        function paintLook() {
            for (const b of lookEl.querySelectorAll('[data-k]')) b.classList.toggle('on', look[b.dataset.k] === +b.dataset.v);
            const pc = $('.hl-prev', lookEl);
            if (!pc) return;
            const g = pc.getContext('2d');
            g.clearRect(0, 0, 24, 26);
            A.person(g, look, { x: 12, y: 24, face: 1, t: now(), emote: 'wave', et: 0 });
        }
        lookEl.addEventListener('click', (e) => {
            const b = e.target.closest('[data-k]');
            if (b) { look[b.dataset.k] = +b.dataset.v; }
            else if (e.target.closest('[data-rand]')) look = A.randomLook();
            else if (e.target.closest('[data-done]') || e.target === lookEl) { lookEl.hidden = true; return; }
            else return;
            saveLook(); paintLook();
            const p = mine(); if (p) p.l = { ...look };
            sendLook();
        });
        setInterval(() => { if (!lookEl.hidden) paintLook(); }, 160);

        fit();
        join();
        requestAnimationFrame(frame);
    };
})();
