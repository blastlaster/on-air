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
    // Where this file came from: the room's own sounds sit next to it in the app (on the listener site they come from the station).
    const HERE = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*(\?.*)?$/, '');

    const EMOTES = [['wave', '👋', 'Wave'], ['dance', '💃', 'Dance'], ['jump', '⤴️', 'Jump'], ['sit', '🪑', 'Sit'], ['cheer', '🙌', 'Cheer'],
        ['clap', '👏', 'Clap'], ['point', '👉', 'Point'], ['spin', '🌀', 'Spin'], ['headbang', '🤘', 'Headbang'], ['sleep', '💤', 'Sleep']];
    // Seconds; the rest (dance, sit, headbang, sleep) last until you move.
    // Poses stay on until you pick them again (or another one), and keep going while you walk.
    const ONE_SHOT = {};
    // How you feel: a face, and a little emoji over your head (the same list as engine/hall.js MOODS).
    const MOODS = [['happy', '😄', '✨'], ['sad', '😞', '💧'], ['angry', '😠', '💢'], ['surprised', '😮', '❗'], ['love', '😍', '❤️'],
        ['cry', '😭', '💦'], ['smug', '😏', ''], ['cool', '😎', '✨'], ['confused', '😕', '❓'], ['sick', '🤢', '🤢']];
    const MOOD_BUBBLE = Object.fromEntries(MOODS.map(([id, , b]) => [id, b]));
    const JUMP_S = 0.6, DASH_S = 0.3, DASH_SPEED = 2.6;
    // Holding the dash key sprints (engine/hall.js SPRINT, which keeps everyone's breath too): a tap still dashes.
    const SPRINT = { mult: 1.7, maxS: 3, regen: 0.6, minS: 0.8 };
    const HANDS = { rock: '✊', paper: '✋', scissors: '✌️' };
    // Bonk and slap up close (you walk over first), a snowball from anywhere (engine/hall.js HITS).
    const HITS = [['bonk', '🔨', 'Bonk'], ['slap', '🐟', 'Fish slap'], ['snowball', '⛄', 'Snowball']];
    const MELEE = { bonk: 1, slap: 1 };
    const HIT_LINE = { bonk: (a, b) => '🔨 ' + a + ' bonked ' + b, slap: (a, b) => '🐟 ' + a + ' slapped ' + b + ' with a fish', snowball: (a, b) => '⛄ ' + a + ' threw a snowball at ' + b };
    // Teching a snowball: dash or jump in the last moment before it lands (seconds after it's thrown; it lands at SNOW_S).
    const SNOW_S = 0.45, TECH_FROM = 0.2;
    // Duels (engine/hall-duel.js): slaps in a row are with a fish, a salmon, then a tuna (that one takes the round):
    // [name, pop word, its colour, how big, a tint on the fish]. Snowballs slow you: DUEL_SLOW[level] (1–3, how many in a row).
    const DUEL_FISH = [['fish', 'SLAP!', '#7ee3ff', 1, ''], ['salmon', 'SALMON SLAP!!', '#ff9a7a', 1.35, 'hue-rotate(160deg) saturate(1.6)'],
        ['tuna', 'TUNA SLAP!!!', '#b9c6ff', 1.8, 'saturate(0.45) brightness(0.75)']];
    const DUEL_SLOW = [1, 0.75, 0.55, 0.35];
    // Glowsticks (engine/hall.js GLOWS); rainbow goes round the colours.
    const GLOWS = [['green', '#39ff14'], ['pink', '#ff2fd0'], ['cyan', '#00e5ff'], ['yellow', '#ffe600'], ['orange', '#ff7a00'], ['purple', '#b04fff'], ['rainbow', '']];
    const GLOW_COLOR = Object.fromEntries(GLOWS);
    // Auras (the same tab: one glow thing at a time). The first four take a colour.
    const AURAS = [['glow', '✨', 'Glow'], ['super', '🔥', 'Super'], ['charge', '⚡', 'Charge'], ['rings', '⭕', 'Halo rings'],
        ['rainbow', '🌈', 'Rainbow'], ['shadow', '🌑', 'Shadow'], ['ultra', '💠', 'Ultra'], ['petals', '🌸', 'Petals'],
        ['hearts', '💕', 'Hearts'], ['butterflies', '🦋', 'Butterflies'], ['twinkle', '🌟', 'Twinkle'], ['heaven', '😇', 'Heaven'],
        ['fire', '🔥', 'Fire'], ['brimstone', '🌋', 'Brimstone'], ['hellfire', '👹', 'Hellfire'], ['storm', '⛈️', 'Storm']];
    /* What nice points (giving people what you're holding; engine/hall.js NICE) and ebil points (passing
       a lit bomb; engine/hall-potato.js) unlock, all the way to 999: [points, at, what, which, name]. */
    const POINTS = { nice: ['😇', 'nice'], ebil: ['😈', 'ebil'] };
    const REWARDS = [
        ['nice', 11, 'aura', 'petals', 'the Petals aura'], ['nice', 33, 'extra', 12, 'the Flower crown'], ['nice', 66, 'aura', 'hearts', 'the Hearts aura'],
        ['nice', 111, 'back', 1, 'Angel wings'], ['nice', 222, 'aura', 'butterflies', 'the Butterflies aura'], ['nice', 333, 'extra', 13, 'the Tiara'],
        ['nice', 555, 'back', 2, 'Fairy wings'], ['nice', 666, 'face', 5, 'Glowing eyes'], ['nice', 777, 'aura', 'twinkle', 'the Twinkle aura'], ['nice', 999, 'aura', 'heaven', 'the Heaven aura'],
        ['nice', 999, 'back', 3, 'Seraph wings'],
        ['ebil', 11, 'aura', 'fire', 'the Fire aura'], ['ebil', 33, 'back', 4, 'a Devil tail'], ['ebil', 66, 'extra', 14, 'the Skull mask'],
        ['ebil', 111, 'back', 5, 'Bat wings'], ['ebil', 222, 'aura', 'brimstone', 'the Brimstone aura'], ['ebil', 333, 'extra', 15, 'Demon horns'],
        ['ebil', 555, 'back', 6, 'the Villain cape'], ['ebil', 666, 'aura', 'hellfire', 'the Hellfire aura'], ['ebil', 777, 'aura', 'storm', 'the Storm aura'],
        ['ebil', 999, 'extra', 16, 'the Crown of flames']
    ];
    const rewardFor = (what, which) => REWARDS.find(r => r[2] === what && r[3] === which) || null;
    const AURA_TINTED = { glow: 1, super: 1, charge: 1, rings: 1 };
    const RAINBOW_BG = 'linear-gradient(90deg,#ff3b6b,#ffe600,#39ff14,#00e5ff,#d14fff)';
    const auraOf = (a) => (a ? ['aura', ...a.split(':')] : null);                      // ['aura', kind, colour?]
    // Stage effects anyone can set off, when the host allows it (engine/hall.js CROWD_BURSTS).
    const BURSTS = [['fire', '🔥', 'Fire on the stage'], ['confetti', '🎊', 'Confetti']];
    const BURST_LINE = { fire: '🔥 {n} set the stage on fire', confetti: '🎊 {n} threw confetti' };
    // The emoji picker: anything to say, and things to carry (the same list as engine/hall.js HOLDS).
    // 🧴 is a bottle of water: drawn by hand (there's no water-bottle emoji before Unicode 13; Windows 10 would show a box).
    const WATER = '🧴', HOLD_NAME = { [WATER]: 'a bottle of water' };
    const holdName = (o) => HOLD_NAME[o] || o;
    /** The bottle of water, (cx, cy) its middle, px a pixel: clear plastic, water two-thirds up, a blue cap and label. */
    function waterBottle(ctx, cx, cy, px) {
        const rows = ['  cc  ', '  cc  ', ' nnnn ', 'bbbbbb', 'bhbbbb', 'bhbbbb', 'wwwwww', 'LLLLLL', 'LLLLLL', 'whwwww', 'wwwwww', 'wwwwww', ' wwww '];
        const C = { c: '#1f5fc8', n: '#d8f0ff', b: '#cfeaff', h: '#ffffff', w: '#4aa8ec', L: '#2f7fe0' };
        const x0 = Math.round(cx - 3 * px), y0 = Math.round(cy - 6.5 * px);
        ctx.save();
        ctx.fillStyle = 'rgba(10,30,60,0.55)';                         // an outline so it reads on any floor
        ctx.fillRect(x0 - px, y0 + 2 * px, 8 * px, 11 * px); ctx.fillRect(x0 + px, y0 - px, 4 * px, 3 * px);
        rows.forEach((r, j) => [...r].forEach((k, i) => { if (C[k]) { ctx.fillStyle = C[k]; ctx.fillRect(x0 + i * px, y0 + j * px, px, px); } }));
        ctx.restore();
    }
    let waterPic = '';
    const waterImg = () => {
        if (!waterPic) { const c = document.createElement('canvas'); c.width = 24; c.height = 24; waterBottle(c.getContext('2d'), 12, 12, 1.6); waterPic = c.toDataURL(); }
        return '<img src="' + waterPic + '" alt="Bottle of water" width="22" height="22" style="image-rendering:pixelated;vertical-align:middle">';
    };
    const HOLDS = '🔪 🗡️ 🪓 🔨 🔫 🍳 🥖 🧹 🏹 💣 🏏 🎸 🎤 🥁 🎺 📻 📢 🍕 🍔 🌭 🍩 🍌 🐟 🍺 🥤 ☕ 🧴 🌹 💐 🎈 🎁 🏆 💰 💎 🔦 🕯️ 🎊 ⚽ 🏀 🎮 📱 🧸 🐸 🐈 👻 💀 🔥 ⭐ 🚩 📌 🛡️ 💩'.split(' ');
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
            '<div class="hall-stage"><canvas></canvas><div class="hall-tv" hidden></div><div class="hall-log"><div class="hall-log-top"><label><input type="checkbox" data-games> ⚔ games</label><label class="hl-times" title="Show the time on each line"><input type="checkbox" data-times> 🕒</label>' +
            '<button type="button" data-chatmove title="Move the chat">⇄</button><button type="button" data-chatsize="-1" title="Smaller">–</button>' +
            '<button type="button" data-chatsize="1" title="Bigger">+</button></div><ol class="hall-lines"></ol></div>' +
            '<div class="hall-pop" hidden></div><div class="hall-rps" hidden></div><div class="hall-duel" hidden></div><div class="hall-db" hidden></div><div class="hall-msg" hidden></div></div>' +
            '<form class="hall-bar"><input maxlength="400" placeholder="Say something… (Enter)" autocomplete="off">' +
            '<button class="btn go">Say</button><div class="hall-acts"></div></form>' +
            '<div class="hall-emoji" hidden></div><div class="hall-games" hidden></div><div class="hall-look" hidden></div><div class="hall-dpad" hidden></div></div>';
        const stage = $('.hall-stage', box), cv = $('canvas', box), ctx = cv.getContext('2d');
        const popEl = $('.hall-pop', box), rpsEl = $('.hall-rps', box), duelEl = $('.hall-duel', box), padEl = $('.hall-dpad', box), emojiEl = $('.hall-emoji', box);
        const tvEl = $('.hall-tv', box), msgEl = $('.hall-msg', box), logBox = $('.hall-log', box), logEl = $('.hall-lines', box), bar = $('.hall-bar', box), input = $('input', bar), lookEl = $('.hall-look', box);
        if (window.LT && LT.stickToBottom) LT.stickToBottom(logEl);       // the chat opens at its newest line
        /* [s4s] beside the room, on the left: on the FunpostFM site, when its [s4s] board is switched on.
           📋 in the room's top bar shows or hides it (remembered). */
        (function s4s() {
            const pageTop = box.parentNode && box.parentNode.querySelector('.hall-page-top'), frame = document.getElementById('boardFrame');
            if (!pageTop || !frame || document.body.classList.contains('no-s4s')) return;
            const src = frame.dataset.src || frame.src || 'https://boards.4chan.org/s4s/';
            let on = window.innerWidth >= 900;
            try { const v = localStorage.getItem('ltl.hallS4s'); if (v) on = v === '1'; } catch { /* the usual */ }
            const side = document.createElement('aside');
            side.className = 'hall-s4s';
            side.innerHTML = '<div class="hs-top"><b>📋 [s4s]</b> <span class="nsfw-tag">NSFW</span><a href="https://boards.4chan.org/s4s/" target="_blank" rel="noopener">Open ↗</a>' +
                '<button type="button" data-s4sx title="Hide [s4s]">✕</button></div><iframe title="[s4s] - Shit 4chan Says" referrerpolicy="no-referrer"></iframe>';
            box.insertBefore(side, box.firstChild);
            const ifr = $('iframe', side), btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'hp-s4s'; btn.title = 'Show or hide [s4s] beside the room';
            btn.innerHTML = '📋<span class="hn"> [s4s]</span>';
            pageTop.insertBefore(btn, pageTop.querySelector('[data-play]'));
            const paint = () => {
                side.hidden = !on; box.classList.toggle('with-s4s', on); btn.classList.toggle('on', on);
                if (on && !ifr.src) ifr.src = src;
            };
            const flip = () => { on = !on; try { localStorage.setItem('ltl.hallS4s', on ? '1' : '0'); } catch { /* full */ } paint(); };
            btn.addEventListener('click', flip);
            $('[data-s4sx]', side).addEventListener('click', flip);
            offs.push(() => { btn.remove(); side.remove(); box.classList.remove('with-s4s'); });
            paint();
        })();
        const low = document.createElement('canvas'); low.width = A.W; low.height = A.H;
        const lc = low.getContext('2d');

        /* ---------- you ---------- */
        let look;
        try { look = JSON.parse(localStorage.getItem('ltl.hallLook') || 'null'); } catch { look = null; }
        if (!look || typeof look !== 'object') { look = A.randomLook(); saveLook(); }
        function saveLook() { try { localStorage.setItem('ltl.hallLook', JSON.stringify(look)); } catch { /* full */ } }
        // Out of bonks, slaps and snowballs (both ways), and your glowstick: remembered.
        let safe = false, glow = '', aura = '';
        try { safe = localStorage.getItem('ltl.hallSafe') === '1'; glow = localStorage.getItem('ltl.hallGlow') || ''; aura = localStorage.getItem('ltl.hallAura') || ''; } catch { /* defaults */ }
        if (glow.startsWith('aura:')) { aura = glow.slice(5); glow = ''; }      // (from when it was one or the other)
        if (!GLOW_COLOR.hasOwnProperty(glow)) glow = '';
        if (!/^[a-z]+(:[a-z]+)?$/.test(aura)) aura = '';

        /* ---------- the room's state ---------- */
        const people = new Map();         // h → { h, n, l, x, y, tx, ty, e, et, face, walking, say, sayUntil }
        let me = '', joined = false, pending = false, refused = false, air = { live: false, talking: false, music: false, fx: { level: 0, on: {}, crowd: false } };
        const hits = [], bursts = [];      // { a, b, k, at } being drawn; { k, at } going off
        let hostSay = null;               // Radioman's bubble: { text, until }
        // On a call (or a voicemail on air): who's in the speaker boxes, and how far each has slid in.
        let booth = { host: false, calls: [], vm: null };
        // The go-live countdown: when it reaches zero, on this page's clock (0 = none), and how long it is.
        let introEnd = 0, introSecs = 0;
        // FunpostTV taking the middle of the stage while live: 0 (on the wall) → 1 (big, desk aside).
        let tvK = 0, wasLive = false, tvHold = 0;
        function setIntro(i) {
            if (i && i.left >= 0) { introEnd = now() + i.left / 1000; introSecs = Number(i.secs) || 0; }
            else if (introEnd > now()) introEnd = 0;                // called off
        }
        const boxes = new Map();          // key → { k, want, side, name, who, talk, strip }
        // The studio's room delay (engine/hall.js roomDelay): what's on air shows when listeners hear it, in order.
        // Each listener's own player holds back some more (or less): the studio's delay is as heard on a
        // usual player (about LAG_USUAL s buffered), so this one adds how far it is behind that.
        // core.streamLag(): seconds buffered ahead of what's playing, null when not playing the stream.
        const LAG_USUAL = 2.5;
        let delay = 0, streamDue = 0, lagAvg = null;
        const streamTimers = new Set();
        function sampleLag() {
            let v = null;
            try { v = core.streamLag ? core.streamLag() : null; } catch { v = null; }
            if (typeof v !== 'number' || !isFinite(v) || v < 0) { lagAvg = null; return; }
            lagAvg = lagAvg == null ? v : lagAvg * 0.8 + v * 0.2;       // smoothed: a buffer refill doesn't jolt the room
        }
        sampleLag();
        const lagT = setInterval(sampleLag, 1000);
        offs.push(() => clearInterval(lagT));
        /** How long this room waits: 0 when the studio says straight away; otherwise its delay plus this player's extra. */
        const roomWait = () => delay > 0 ? Math.max(0, Math.min(30, delay + (lagAvg == null ? 0 : lagAvg - LAG_USUAL))) : 0;
        function onStream(fn) {
            const at = Math.max(Date.now() + roomWait() * 1000, streamDue);
            streamDue = at;
            if (at - Date.now() < 30) return fn();
            const tm = setTimeout(() => { streamTimers.delete(tm); fn(); }, at - Date.now());
            streamTimers.add(tm);
        }
        offs.push(() => { for (const tm of streamTimers) clearTimeout(tm); });
        // The room's clock, in seconds: it runs slow for a moment when a tuna lands (slowMo).
        let clockReal = 0, clockAt = 0, clockRate = 1;
        const now = () => clockAt + (performance.now() / 1000 - clockReal) * clockRate;
        function setRate(r) { const t = now(); clockReal = performance.now() / 1000; clockAt = t; clockRate = r; }
        let slowTimer = 0;
        function slowMo(secs, rate) { setRate(rate); clearTimeout(slowTimer); slowTimer = setTimeout(() => setRate(1), secs * 1000); }
        const toPx = (u, v) => [F.x0 + u / 1000 * (F.x1 - F.x0), F.y0 + v / 1000 * (F.y1 - F.y0)];
        const toU = (x, y) => [Math.round((x - F.x0) / (F.x1 - F.x0) * 1000), Math.round((y - F.y0) / (F.y1 - F.y0) * 1000)];
        // Dodgeball (engine/hall-dodge.js): the game as the station last said, and throws in the air (id → { a, b, at, res, resAt, tried }).
        let db = { state: '' }, dbAt = 0;
        // Duels: id → the duel as the station last said, with st: when each thing on each of them wears off (this page's clock).
        const duels = new Map();
        const FIGHT = { ready: 1, fighting: 1, round: 1 };
        const duelOf = (h) => [...duels.values()].find(d => (d.a === h || d.b === h) && FIGHT[d.state]) || null;
        const foeOf = (d, h) => (d.a === h ? d.b : d.a);
        /** Rooted to the spot: stunned, or waiting for a round to start. */
        const btStun = new Map();                       // h → when they can walk again: flattened by Daniel's Burger Smash
        function held(h, t = now()) {
            const d = duelOf(h), s = d && d.st[h];
            if ((btStun.get(h) || 0) > t) return true;
            return !!d && (d.state === 'ready' || (d.state === 'fighting' && !!s && s.stun > t));
        }
        const slowOf = (h, t = now()) => { const d = duelOf(h), s = d && d.st[h]; return s && d.state === 'fighting' && s.slow > t ? DUEL_SLOW[Math.max(1, Math.min(3, s.lvl || 2))] : 1; };
        const flights = new Map();
        const DB_ZONE = { team: [[60, 470, 180, 1000], [530, 940, 180, 1000]], out: [[0, 45, 180, 1000], [955, 1000, 180, 1000]], side: [0, 1000, 0, 110] };
        // The ball rolls along the floor (in the floor's own pixels, F's size): the same sums as engine/hall-dodge.js (BALL, ballAt).
        const BALL = { v0: 160, vMax: 400, drag: 0.9, vMin: 25, w: F.x1 - F.x0, h: F.y1 - F.y0, hitX: 5, hitY: 4 };
        const bounceIn = (u, L) => { const m = ((u % (2 * L)) + 2 * L) % (2 * L); return m <= L ? m : 2 * L - m; };
        function ballPos(b, s) {
            const v0 = Math.hypot(b.vx, b.vy), k = BALL.drag, end = Math.log(Math.max(v0, BALL.vMin) / BALL.vMin) / k, st = Math.max(0, Math.min(s, end));
            const d = (1 - Math.exp(-k * st)) / k;
            return { x: bounceIn(b.x + b.vx * d, BALL.w), y: bounceIn(b.y + b.vy * d, BALL.h), v: v0 * Math.exp(-k * st), dead: s >= end };
        }
        const CHARGE_AFTER = 0.2, CHARGE_FULL = 1.0;        // hold this long and it's a charged throw; this long more, fully charged
        const PERFECT = 1.3, PERFECT_S = 0.15;               // let go within this long of it being full: a perfect throw (engine/hall-dodge.js PERFECT)
        let charging = null;                                 // { at, x, y }: your wind-up, and where you're aiming (room pixels)
        const chargeOf = new Map();                          // someone's wind-up: h → when it began
        const DB_TEAMS = [['Red', '#ff4f6a'], ['Blue', '#4fa3ff']];
        const dbOn = () => !!db.state && db.state !== 'asking';
        const dbTeam = (h) => !db.teams ? -1 : db.teams[0].includes(h) ? 0 : db.teams[1].includes(h) ? 1 : -1;
        const dbOut = (h) => (db.out || []).includes(h);
        /** Where you may walk while a game's on: your half, your end once you're out, or along the back. */
        function zoneOf(h) {
            if (!dbOn() || db.state === 'over') return F;
            const t = dbTeam(h), z = t < 0 ? DB_ZONE.side : dbOut(h) ? DB_ZONE.out[t] : DB_ZONE.team[t];
            const [x0, y0] = toPx(z[0], z[2]), [x1, y1] = toPx(z[1], z[3]);
            return { x0, x1, y0, y1 };
        }
        const clampX = (x) => { const z = zoneOf(me); return Math.max(z.x0, Math.min(z.x1, x)); };
        const clampY = (y) => { const z = zoneOf(me); return Math.max(z.y0, Math.min(z.y1, y)); };

        function add(p) {
            const [x, y] = toPx(p.x, p.y);
            const old = people.get(p.h);
            people.set(p.h, { h: p.h, n: p.n, c: p.c || '', l: p.l, o: p.o || '', f: p.f || '', s: !!p.s, g: p.g || '', a: p.a || '', star: starTill(p.star) || (old ? old.star : 0), trail: [], atrail: [],
                x: old ? old.x : x, y: old ? old.y : y, tx: x, ty: y, e: p.e || '', et: now(), face: 1, walking: false, say: '', sayUntil: 0 });
        }
        // The gold star for surviving Burgertime: up for BT_STAR_MS (real time). Older engines send true.
        const BT_STAR_MS = 15000;
        function starTill(s) { return s === true ? performance.now() + BT_STAR_MS : s > 0 ? performance.now() + s : 0; }
        function notice(text) { msgEl.textContent = text || ''; msgEl.hidden = !text; }

        /* ---------- joining ---------- */
        function join() {
            if (refused || pending) return;
            if (!core.state.engineUp) return notice('blug.dj/jej opens when the station’s PC is on.');
            if (!core.name) { notice('Pick a name to walk in.'); return U.askName(core, join); }
            // v: this room's version (engine/hall-dodge.js DODGE.roomV): 2 = can play dodgeball.
            // 3 = can duel too (engine/hall-duel.js DUEL.roomV), and sees Burgertime (engine/hall-burger.js BT.roomV).
            // 4: hot potato and Burger Smash.
            if (!core.send({ t: 'hall-join', look, safe, glow, aura, v: 4 })) return notice('Connecting to the station…');
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
                    me = m.you; joined = true; pending = false; air = m.air || air; booth = m.booth || booth; delay = Number(air.delay) || 0; setIntro(air.intro); onDodge(m.dodge || { state: '' }, true);
                    paintBursts();
                    games.clear();
                    for (const g of m.games || []) onGame(g, true);
                    tables.clear();
                    for (const tb of m.tables || []) onTable(tb, true);
                    duels.clear();
                    for (const d of m.duels || []) onDuel(d, true);
                    onBt(m.bt || { state: '' }, true);
                    onBomb(m.bomb || { h: '' }, true);
                    notice('');
                    break;
                case 'hall-bt': onBt(m); break;
                case 'hall-give': {
                    logLine({ text: '🎁 ' + nameOf(m.a) + ' gave ' + nameOf(m.b) + ' ' + holdName(m.o) }, 'game');
                    if (m.b === me) U.toast(nameOf(m.a) + ' gave you ' + holdName(m.o) + '!');
                    if (m.a === me && m.nice) gotPoint('nice');
                    break;
                }
                case 'hall-bomb': onBomb(m); break;
                case 'hall-bt-smash': onSmash(m); break;
                case 'hall-bt-d': {
                    const [x, y] = toPx(m.x, m.y), [tx, ty] = toPx(m.tx, m.ty);
                    if (!btD || Math.hypot(btD.x - x, btD.y - y) > 30) btD = { x, y };          // far off: straight there
                    Object.assign(btD, { sx: x, sy: y, sat: now(), tx, ty, v: (m.v || 0) * (F.x1 - F.x0) / 1000, lunge: !!m.lunge, f: m.f || 0 });
                    if (m.f && !btFrenzy && bt.state === 'chase') { btFrenzy = now(); logLine({ text: '🦛 Daniel goes into a FEEDING FRENZY!' }, 'announce'); }
                    break;
                }
                case 'hall-bt-zap': btZap.set(m.h, now()); break;
                case 'hall-bt-eat': {
                    btEat = { h: m.h, at: now() }; bt.score = m.score;
                    if (!bt.eaten.includes(m.h)) bt.eaten.push(m.h);
                    logLine({ text: '😋 Daniel ate ' + nameOf(m.h) + '! (+111)' }, 'announce');
                    if (m.h === me) { keys.clear(); U.toast('Daniel ate you! You’ll be back when he’s gone.'); }
                    break;
                }
                case 'hall-bt-back': {
                    bt.eaten = bt.eaten.filter(h => h !== m.h);
                    btBack.set(m.h, now());
                    const p = people.get(m.h);
                    if (p) { const [x, y] = toPx(m.x, m.y); Object.assign(p, { x, y, tx: x, ty: y, walking: false }); }
                    break;
                }
                case 'hall-add': add(m.p); break;
                case 'hall-del': people.delete(m.h); break;
                case 'hall-at':
                    for (const [h, xy] of Object.entries(m.at || {})) {
                        const p = people.get(h);
                        if (!p || (h === me && !m.put)) continue;
                        [p.tx, p.ty] = toPx(xy[0], xy[1]);
                        p.run = !!xy[2];                       // sprinting there
                        if (m.put) { p.x = p.tx; p.y = p.ty; p.pushed = false; p.real = null; if (h === me) lastSent = ''; continue; }     // put there (a game's places)
                        // Where the station has them right now (on their way): drawn behind that, they walk faster
                        // till they've caught up (step()) — no jumping there. Only miles off (back from another tab) do they jump.
                        if (xy.length >= 5) {
                            const [rx, ry] = toPx(xy[3], xy[4]);
                            p.real = { x: rx, y: ry, at: now() };
                            if (Math.hypot(rx - p.x, ry - p.y) > 100) { p.x = rx; p.y = ry; }
                        } else p.real = null;
                        // (their pose carries on while they walk)
                    }
                    break;
                case 'hall-emote': { const p = people.get(m.h); if (p && m.h !== me) { p.e = m.e; p.et = now(); } break; }
                case 'hall-look': {
                    const p = people.get(m.h);
                    if (p) p.l = m.l;
                    if (m.h === me && m.l && m.l.extra !== look.extra) { look.extra = m.l.extra; saveLook(); if (!lookEl.hidden) paintLook(); }
                    break;
                }
                case 'hall-name': { const p = people.get(m.h); if (p) { p.n = m.n; p.c = m.c || ''; } break; }
                case 'hall-hold': { const p = people.get(m.h); if (p) p.o = m.o; if (m.h === me) paintEmoji(); break; }
                case 'hall-mood': { const p = people.get(m.h); if (p) p.f = m.f; if (m.h === me) paintEmoji(); break; }
                case 'hall-act': {
                    const p = people.get(m.h);
                    if (p && m.a === 'jump') p.jumpAt = now();
                    if (p && m.a === 'dash') p.dashUntil = now() + DASH_S;
                    break;
                }
                case 'hall-rps': onGame(m); break;
                case 'hall-rps-again': { const g = games.get(m.id); if (g) { g.again = [...(g.again || []), m.h]; if (m.h !== me && (g.a === me || g.b === me)) U.toast(nameOf(m.h) + ' wants a rematch!'); paintRps(); } break; }
                case 'hall-table': onTable(m.table); break;
                case 'hall-table-del': onTableGone(m.id); break;
                case 'hall-safe': { const p = people.get(m.h); if (p) p.s = m.s; break; }
                case 'hall-glow': { const p = people.get(m.h); if (p) { p.g = m.g; p.trail = []; } break; }
                case 'hall-aura': { const p = people.get(m.h); if (p) { p.a = m.a; p.atrail = []; } break; }
                case 'hall-hit': onHit(m); break;
                case 'hall-tech': onTech(m); break;
                case 'hall-duel': onDuel(m); break;
                case 'hall-duel-del': duels.delete(m.id); paintDuel(); paintActs(); break;
                case 'hall-db': onDodge(m); break;
                case 'hall-db-charge': if (m.on) chargeOf.set(m.h, now()); else chargeOf.delete(m.h); break;
                case 'hall-db-ball': {
                    // Your own throw has been flying on your screen since you let go: the station's takes over from there.
                    chargeOf.delete(m.a);
                    const own = m.a === me && flights.get('mine');
                    flights.delete('mine');
                    flights.set(m.id, { a: m.a, x: m.x, y: m.y, vx: m.vx, vy: m.vy, at: own ? own.at : now(), res: '', resAt: 0, perfect: !!m.perfect });
                    break;
                }
                case 'hall-db-res': {
                    const f = flights.get(m.id) || { a: m.a, x: m.x, y: m.y, vx: 0, vy: 0, at: now() };
                    Object.assign(f, { res: m.k, resAt: now(), b: m.b || '', rx: m.x, ry: m.y }); flights.set(m.id, f);
                    // A catch knocks them back a step.
                    const kp = m.to && people.get(m.b);
                    if (kp) { const [kx, ky] = toPx(m.to[0], m.to[1]); Object.assign(kp, { knock: { x0: kp.x, y0: kp.y, x1: kx, y1: ky, at: now() }, tx: kx, ty: ky, pushed: false }); if (m.b === me) lastSent = ''; }
                    if (m.k === 'catch') logLine({ text: '🏐 ' + nameOf(m.b) + ' caught ' + nameOf(m.a) + '’s throw!' }, 'game');
                    else if (m.k === 'hit') logLine({ text: '🏐 ' + nameOf(m.a) + ' hit ' + nameOf(m.b) + ' — OUT!' }, 'game');
                    break;
                }
                case 'hall-fx':
                    // Its clock starts when it's first drawn (`at`), not now: a room that's hidden or behind
                    // another window isn't drawing, and would miss the whole thing.
                    bursts.push({ k: m.k, got: now(), at: null });
                    startCool(m.h === me);
                    while (bursts.length > 12) bursts.shift();
                    if (m.h && BURST_LINE[m.k]) logLine({ text: BURST_LINE[m.k].replace('{n}', nameOf(m.h)) }, 'game');
                    break;
                case 'hall-booth': { const b = { host: !!m.host, calls: m.calls || [], vm: m.vm || null }; onStream(() => { booth = b; }); break; }
                case 'hall-air': {
                    // The studio's settings straight away; going live, talk and music when listeners hear them.
                    delay = Number(m.delay) || 0;
                    air = { ...air, screen: m.screen, fx: m.fx || air.fx, tag: m.tag };
                    paintBursts();
                    const heard = { live: m.live, talking: m.talking, music: m.music };
                    onStream(() => { air = { ...air, ...heard }; setIntro(m.intro); paintBursts(); });
                    break;
                }
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
            // Beside the room when the room still fits nearly as big as the height allows (a short, wide screen: a phone on its side).
            const docked = !logBox.hidden && (chatPos === 'right' || chatPos === 'left') && sw - w - 6 >= Math.min(480, stage.clientHeight * A.W / A.H * 0.9);
            // Upright phone: the room across the top, the chat in the space under it (instead of over the room).
            const sh = stage.clientHeight, roomH = Math.round(sw * A.H / A.W), below = !logBox.hidden && !docked && sh - roomH >= 150;
            const side = chatPos === 'left' || chatPos === 'floatL' ? 'left' : 'right';
            logBox.classList.toggle('docked', docked);
            logBox.classList.toggle('floating', !docked && !below);
            logBox.classList.toggle('below', below);
            stage.style.paddingBottom = below ? (sh - roomH) + 'px' : '';
            logBox.style.height = below ? (sh - roomH - 4) + 'px' : '';
            // The actions: beside the room on the chat's side (between them) when it's wide enough; along the bottom otherwise.
            const canSide = !below && sw - (docked ? w + 6 : 0) >= 640, sideActs = actsMode === 'side' && canSide;
            actsEl.classList.toggle('no-side', !canSide);           // (then there's no point offering to move them)
            if (sideActs && actsEl.parentNode !== stage) stage.appendChild(actsEl);
            if (!sideActs && actsEl.parentNode !== bar) bar.appendChild(actsEl);
            actsEl.classList.toggle('side', sideActs);
            const aw = sideActs ? actsEl.offsetWidth + 6 : 0, chatW = docked ? w + 6 : 0;
            actsEl.style.left = sideActs && side === 'left' ? chatW + 'px' : '';
            actsEl.style.right = sideActs && side === 'right' ? chatW + 'px' : '';
            if (below) { logBox.style.width = ''; logBox.style.maxHeight = ''; stage.style.paddingLeft = stage.style.paddingRight = ''; return; }
            logBox.classList.toggle('at-left', side === 'left');
            logBox.classList.toggle('at-right', side === 'right');
            logBox.style.width = (docked ? w : Math.min(w + 80, Math.round(sw * 0.6))) + 'px';
            logBox.style.maxHeight = docked ? '' : h + '%';
            stage.style.paddingLeft = side === 'left' && (chatW || aw) ? (chatW + aw) + 'px' : '';
            stage.style.paddingRight = side === 'right' && (chatW || aw) ? (chatW + aw) + 'px' : '';
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
        // The time on each line: off unless you switch it on (shared with the Chat window).
        const timesBox = $('[data-times]', logBox);
        const timesOn = () => { try { return localStorage.getItem('ltl.chatTimes') === '1'; } catch { return false; } };
        const paintTimes = () => { timesBox.checked = timesOn(); logBox.classList.toggle('times', timesBox.checked); };
        paintTimes();
        timesBox.addEventListener('change', () => {
            try { localStorage.setItem('ltl.chatTimes', timesBox.checked ? '1' : '0'); } catch { /* full */ }
            paintTimes();
        });
        listen('storage', (e) => { if (e.key === 'ltl.chatTimes') paintTimes(); });
        const lineTime = (ts) => { const d = new Date(ts), h = d.getHours(), mi = d.getMinutes(); return (h % 12 || 12) + ':' + (mi < 10 ? '0' : '') + mi + (h < 12 ? ' am' : ' pm'); };
        function logLine(m, cls) {
            if ((m.role === 'system' && !cls) || !m.text) return;
            const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
            const li = document.createElement('li');
            if (m.id) li.dataset.mid = m.id;
            if (cls) li.className = cls;
            // Links you can click (they open in a new tab, or the browser in the app); the game lines are plain.
            const text = !cls && window.LT && LT.chatHtml ? LT.chatHtml(m.text) : esc(m.text);
            li.innerHTML = (m.ts ? '<span class="hl-when">' + lineTime(m.ts) + '</span>' : '') + (m.name ? '<b style="color:' + esc(m.color || '') + '">' + esc(m.name) + '</b> ' : '') + text;
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
            else if (m.role === 'host') hostSay = { text: m.text, id: m.id, at: now(), until: now() + sayFor(m.text) };
        }, window);

        const sayBox = window.LT && LT.chatInput ? LT.chatInput(input) : null;      // :emoji: suggestions, Shift+↑ history
        bar.onsubmit = (e) => {
            e.preventDefault();
            const typed = input.value, text = window.LT && LT.emojiCodes ? LT.emojiCodes(typed) : typed;
            if (!text.trim()) { input.blur(); return; }
            const go = () => { if (core.chatSend(text)) { input.value = ''; if (sayBox) sayBox.sent(typed); } else U.toast('Chat is reconnecting…'); };
            if (!core.name) U.askName(core, go); else go();
        };

        /* ---------- moving ---------- */
        const keys = new Set();
        let sentAt = 0, lastSent = '', padWas = [];
        function mine() { return people.get(me); }
        function sendGo(x, y) {
            if (isEaten(me)) return;                  // inside Daniel till it's over
            const [u, v] = toU(x, y), k = u + ',' + v + (running ? 'r' : '');
            if (k === lastSent) return;
            lastSent = k; sentAt = now();
            core.send({ t: 'hall-go', x: u, y: v, ...(running ? { r: 1 } : {}) });
        }
        /* Sprinting: your breath (seconds of it), used while you sprint and back while you don't.
           Run right out and you need SPRINT.minS back before you can go again. */
        let sprintKey = false, running = false, stam = SPRINT.maxS, tired = false;
        function breathe(dt, moving) {
            const was = running;
            running = sprintKey && moving && !tired && stam > 0.05;
            stam = Math.max(0, Math.min(SPRINT.maxS, stam + (running ? -dt : dt * SPRINT.regen)));
            if (stam <= 0.05) { tired = true; running = false; }
            if (tired && stam >= SPRINT.minS) tired = false;
            return running !== was;
        }
        function emote(id) {
            const p = mine();
            if (!p) return;
            const next = p.e === id && !ONE_SHOT[id] ? '' : id;
            p.e = next; p.et = now();
            core.send({ t: 'hall-emote', e: next });
            paintPoses();
        }
        /** Your pose's button stays lit while it's on. */
        function paintPoses() {
            const e = (mine() || {}).e || '';
            for (const b of actsEl.querySelectorAll('[data-act^="e:"]')) b.classList.toggle('on', b.dataset.act === 'e:' + e);
        }
        /** Space: jump. Shift: dash (a burst of speed the way you're going); held down, a sprint (see breathe). */
        let jumpReady = 0, dashReady = 0;
        function act(a) {
            const p = mine(), t = now();
            if (!p || held(me, t)) return;
            if (a === 'jump' || a === 'dash') { tryTech(t); trySmashTech(t); }
            if (a === 'jump') { if (t < jumpReady) return; jumpReady = t + JUMP_S + 0.1; p.jumpAt = t; }
            if (a === 'dash') { if (t < dashReady) return; dashReady = t + 1; p.dashUntil = t + DASH_S; }
            core.send({ t: 'hall-act', a });
        }
        /** Someone (not you) under the pointer: their feet are at (x, y), about 9×20 room pixels above that. */
        function personAt(x, y) {
            let hit = null;
            for (const q of people.values()) if (q.h !== me && Math.abs(q.x - x) <= 5 && y <= q.y + 2 && y >= q.y - 20 && (!hit || q.y > hit.y)) hit = q;
            return hit;
        }
        stage.addEventListener('click', (e) => floorClick(e));
        function floorClick(e) {
            const p = mine();
            if (!p) return;
            const r = cv.getBoundingClientRect();
            const rx = (e.clientX - r.left) / r.width * A.W, ry = (e.clientY - r.top) / r.height * A.H;
            const q = personAt(rx, ry);
            if (skipClick) { skipClick = false; return; }          // that was a throw
            if (q && dodgeThrow(q)) return;
            if (q) return openPop(q, e);
            popEl.hidden = true;
            pendingHit = null;
            const x = clampX(rx), y = clampY(ry);
            p.tx = x; p.ty = y;
            sendGo(x, y);
        }
        // The Look panel closes by itself when you click the room or start walking (unless you switch that off in it).
        let lookAuto = true;
        try { lookAuto = localStorage.getItem('ltl.hallLookAuto') !== '0'; } catch { /* default */ }
        const lookAway = () => { if (lookAuto && !lookEl.hidden) lookEl.hidden = true; };

        /* ---------- emoji: in what you say, or in your hand ---------- */
        let emojiTab = 'say';
        function paintEmoji() {
            if (emojiEl.hidden) return;
            const held = (mine() || {}).o || '';
            const feel = (mine() || {}).f || '';
            const pics = stationEmotes();
            const tab = (id, label) => '<button type="button" class="btn' + (emojiTab === id ? ' on' : '') + '" data-tab="' + id + '">' + label + '</button>';
            const emo = (e, on) => '<button type="button" class="he-e' + (on ? ' on' : '') + '" data-em="' + e + '"' + (e === WATER ? ' title="Bottle of water">' + waterImg() : '>' + e) + '</button>';
            emojiEl.innerHTML = '<div class="he-tabs">' + tab('say', '😀 Emote') + tab('hold', '✋ Hold') + tab('feel', '😊 Feel') +
                (held ? '<button type="button" class="btn" data-drop>Drop ' + (held === WATER ? waterImg() : held) + '</button>' : '') +
                '<span class="he-hint">' + (emojiTab === 'hold' ? 'Carry it around — everyone sees it' : emojiTab === 'feel' ? 'Your face shows it (pick again to stop)' : 'Adds it to what you’re typing') + '</span>' +
                '<button type="button" class="btn he-x" data-close title="Close">✕</button></div>' +
                '<div class="he-grid">' + (emojiTab === 'feel'
                    ? MOODS.map(([id, icon]) => '<button type="button" class="he-e' + (id === feel ? ' on' : '') + '" data-mood="' + id + '" title="' + id + '">' + icon + '</button>').join('')
                    : emojiTab === 'hold' ? HOLDS.map(e => emo(e, e === held)).join('')
                    // Emote: the station's own pictures first, then the emoji.
                    : (pics.length ? '<div class="he-sub">Memeoji</div>' + pics.map(k => '<button type="button" class="he-e he-pic" data-em=":' + esc(k) + ':" title=":' + esc(k) + ':"><img alt=":' + esc(k) + ':" src="' + esc(LT.EMOTES[k]) + '"></button>').join('') +
                        '<div class="he-sub">Emoji</div>' : '') + SAY.concat(HOLDS.filter(e => e !== WATER)).map(e => emo(e, false)).join('')) + '</div>';
        }
        const stationEmotes = () => Object.keys((window.LT && LT.EMOTES) || {});
        let auraColor = 'yellow';
        try { auraColor = localStorage.getItem('ltl.hallAuraColor') || 'yellow'; } catch { /* default */ }
        if (!A.AURA_COLORS[auraColor] && auraColor !== 'rainbow') auraColor = 'yellow';
        /** Your glowstick (a colour, or '' for none) and your aura ('super:pink', 'ultra', or ''): the room sees both. */
        function setStick(g) {
            glow = g;
            try { localStorage.setItem('ltl.hallGlow', glow); } catch { /* full */ }
            const p = mine(); if (p) { p.g = glow; p.trail = []; }
            core.send({ t: 'hall-glow', g: glow });
        }
        function setAura(a) {
            aura = a;
            try { localStorage.setItem('ltl.hallAura', aura); } catch { /* full */ }
            const p = mine(); if (p) { p.a = aura; p.atrail = []; }
            core.send({ t: 'hall-aura', a: aura });
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
            const md = e.target.closest('[data-mood]');
            if (md) {
                const p = mine();
                if (!p) return;
                p.f = p.f === md.dataset.mood ? '' : md.dataset.mood;
                core.send({ t: 'hall-mood', f: p.f });
                return paintEmoji();
            }
            if (!em) return;
            const v = em.dataset.em;
            if (emojiTab === 'hold') { hold((mine() || {}).o === v ? '' : v); emojiEl.hidden = true; return; }
            // Into the message, where the cursor is; the picker stays open for more.
            const a = input.selectionStart == null ? input.value.length : input.selectionStart, b = input.selectionEnd == null ? a : input.selectionEnd;
            input.value = (input.value.slice(0, a) + v + input.value.slice(b)).slice(0, 400);
            input.focus();
            input.setSelectionRange(a + v.length, a + v.length);
        });
        /** How people feel: a little emoji bobbing beside their head. */
        function drawMoods(sorted, heads, u, t) {
            const fs = Math.max(11, Math.round(4 * u / dpr)) * dpr;
            ctx.font = fs + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (const p of sorted) {
                const b = p.f && MOOD_BUBBLE[p.f];
                if (!b || !heads.has(p.h)) continue;
                const f = p.face < 0 ? -1 : 1;
                ctx.fillText(b, Math.round((p.x - f * 6) * u), Math.round((heads.get(p.h) - 1 + Math.sin(t * 3 + p.x) * 1.2) * u));
            }
        }
        /** What everyone is carrying, in the hand on the side they face. */
        function drawHeld(sorted, heads, u) {
            const fs = Math.max(14, Math.round(5.5 * u / dpr)) * dpr;
            ctx.font = fs + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (const p of sorted) {
                if (!p.o || !heads.has(p.h)) continue;
                const f = p.face < 0 ? -1 : 1, x = (p.x + f * 6) * u, y = (heads.get(p.h) + 10) * u;
                const lit = p.o === BOMB && bomb && bomb.h === p.h, red = lit && bombBlink(x, y, fs, now());
                ctx.save();
                ctx.translate(Math.round(x), Math.round(y));
                ctx.scale(-f, 1);                     // emoji face left; turn them the way their holder faces
                if (p.o === WATER) waterBottle(ctx, 0, 0, Math.max(1, Math.round(fs / 13)));
                else ctx.fillText(p.o, 0, 0);
                if (red) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#ff1a1a'; ctx.beginPath(); ctx.arc(0, fs * 0.08, fs * 0.36, 0, Math.PI * 2); ctx.fill(); }
                if (lit) { ctx.globalAlpha = 1; ctx.fillStyle = Math.floor(now() * 20) % 2 ? '#fff3a0' : '#ff9a20'; ctx.fillRect(Math.round(fs * 0.22), Math.round(-fs * 0.5), Math.max(2, Math.round(fs / 7)), Math.max(2, Math.round(fs / 7))); }
                ctx.restore();
            }
        }

        /* ---------- hot potato (engine/hall-potato.js) ---------- */
        const BOMB = '💣', BOMB_REACH = [160, 230];      // how close to pass it (the room's units)
        let bomb = null;                                 // { h, from, end, n }: who has it and when it goes off (this page's clock)
        const booms = [];                                // { x, y, at }: going off
        const bombMine = () => !!bomb && bomb.h === me;
        function onBomb(m, quiet) {
            const t = now();
            if (m.boom) {
                bomb = null;
                const [x, y] = toPx(m.boom.x, m.boom.y);
                booms.push({ x, y, at: t });
                for (const [h, xy] of Object.entries(m.boom.hits || {})) {
                    const q = people.get(h);
                    if (!q) continue;
                    const [kx, ky] = toPx(xy[0], xy[1]);
                    Object.assign(q, { knock: { x0: q.x, y0: q.y, x1: kx, y1: ky, at: t, dur: 0.85, arc: 24 }, tx: kx, ty: ky, pushed: false, real: null });
                    if (h === me) { lastSent = ''; pendingHit = null; }
                }
                if (!quiet) logLine({ text: '💥 BOOM! ' + nameOf(m.boom.h) + ' was holding the bomb. 😇' }, 'announce');
            } else if (m.fizzle) {
                bomb = null;
                if (!quiet) logLine({ text: '💣 The bomb fizzled out.' }, 'game');
            } else if (m.h) {
                const first = !bomb;
                bomb = { h: m.h, from: m.from, end: t + (m.left || 0) / 1000, n: m.n || 0 };
                if (!quiet && first) logLine({ text: '💣 ' + nameOf(m.from) + ' handed ' + nameOf(m.h) + ' a lit bomb! HOT POTATO!' }, 'announce');
                if (!quiet && m.h === me) U.toast('💣 You’ve got the bomb! Pass it on — J' + (touch ? ' or 💣 Pass' : '') + ' — before it goes off!');
                if (!quiet && m.from === me && m.ebil) gotPoint('ebil');
            } else bomb = null;
            paintBombBtn();
        }
        /** Pass it to whoever's closest (in reach), or the one you clicked (a bomb you're only holding: that lights it). */
        function passBomb(h) {
            const p = mine();
            if (!p || !(bombMine() || (h && p.o === BOMB && !bomb))) return;
            let q = h ? people.get(h) : null;
            if (!q) {
                let best = Infinity;
                for (const x of people.values()) {
                    if (x.h === me || x.s || isEaten(x.h)) continue;
                    const [ux, uy] = toU(x.x, x.y), [mx, my] = toU(p.x, p.y), dx = Math.abs(ux - mx) / BOMB_REACH[0], dy = Math.abs(uy - my) / BOMB_REACH[1];
                    if (dx > 1 || dy > 1) continue;
                    const d = Math.hypot(dx, dy);
                    if (d < best) { best = d; q = x; }
                }
            }
            if (!q) return U.toast('Nobody close enough — run at someone!');
            const [ax, ay] = toU(p.x, p.y), [bx, by] = toU(q.x, q.y);
            core.send({ t: 'hall-give', to: q.h, ax, ay, bx, by });
        }
        const bombBtn = document.createElement('button');
        bombBtn.type = 'button'; bombBtn.className = 'btn hall-bomb-btn'; bombBtn.hidden = true;
        bombBtn.innerHTML = '💣 Pass it! <kbd>J</kbd>';
        bombBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); passBomb(); });
        bombBtn.addEventListener('click', (e) => e.stopPropagation());
        stage.appendChild(bombBtn);
        function paintBombBtn() { bombBtn.hidden = !bombMine(); }
        /** The lit bomb: blinking red, faster the nearer it is to going off; a fizzing fuse. */
        function bombBlink(x, y, fs, t) {
            const left = Math.max(0, bomb.end - t), per = Math.max(0.06, Math.min(0.6, left / 14));
            const on = Math.floor(t / per) % 2 === 0;
            if (on) {
                const r = fs * (0.75 + 0.25 * Math.min(1, 6 / Math.max(1, left)));
                const g = ctx.createRadialGradient(x, y, 1, x, y, r);
                g.addColorStop(0, 'rgba(255,40,40,0.95)'); g.addColorStop(0.5, 'rgba(255,0,0,0.45)'); g.addColorStop(1, 'rgba(255,0,0,0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
            return on;
        }

        /* ---------- dodgeball ---------- */
        const dbEl = () => $('.hall-db', box);
        function onDodge(m, quiet) {
            const was = db.state, wasRound = db.round;
            db = m; dbAt = now();
            if (!m.state) flights.clear();
            if (!quiet) {
                const T = (i) => DB_TEAMS[i][0], sc = m.score && m.win >= 0 ? m.score[m.win] + '–' + m.score[1 - m.win] : '';      // the winner's score first
                if (m.state === 'asking' && was !== 'asking') { dodgeNo = false; logLine({ text: '🏐 Dodgeball! Everyone’s asked to play.' }, 'game'); U.toast('🏐 Dodgeball! Join in?'); }
                if (m.state === 'ready' && m.round !== wasRound) logLine({ text: '🏐 Round ' + m.round + ': ' + m.teams.map((tm, i) => T(i) + ' (' + tm.map(nameOf).join(', ') + ')').join(' vs ') }, 'game');
                if (m.state === 'round' && was !== 'round') logLine({ text: '🏐 ' + T(m.win) + ' takes round ' + m.round + ' (' + sc + ')' }, 'game');
                if (m.state === 'over' && was !== 'over') logLine({ text: '🏆 ' + T(m.win) + ' wins dodgeball ' + sc + '! (' + m.teams[m.win].map(nameOf).join(', ') + ')' }, 'game');
            }
            // Out, or moved to the back: keep walking only where you may.
            const p = mine();
            if (p && dbOn()) { p.tx = clampX(p.tx); p.ty = clampY(p.ty); }
            paintDodge();
        }
        const haveBall = () => db.state === 'playing' && db.ball === me && ![...flights.values()].some(f => !f.res);
        /** A quick click on someone on the other team with the ball in your hand: throw it straight at them. */
        function dodgeThrow(q) {
            if (!haveBall() || dbTeam(q.h) !== 1 - dbTeam(me) || dbOut(q.h)) return false;
            throwAt(q.x, q.y, 0);
            popEl.hidden = true;
            return true;
        }
        function throwAt(x, y, c) {
            const p = mine();
            if (!p) return;
            const [ax, ay] = toU(x, y), [sx, sy] = toU(p.x, p.y);
            core.send({ t: 'hall-db-throw', ax, ay, c: +c.toFixed(2), sx, sy });
            // It leaves your hand now, on your screen (the same sums as engine/hall-dodge.js throwAt);
            // the station's ball replaces it when it arrives, or it's gone if none does.
            const fx = p.x - F.x0, fy = p.y - F.y0;
            let dx = x - F.x0 - fx, dy = y - F.y0 - fy;
            if (Math.hypot(dx, dy) < 1) { dx = dbTeam(me) ? -1 : 1; dy = 0; }
            const ch = Math.max(0, Math.min(PERFECT, c)), v = BALL.v0 + (BALL.vMax - BALL.v0) * ch, n = Math.hypot(dx, dy);
            flights.set('mine', { a: me, x: fx, y: fy, vx: dx / n * v, vy: dy / n * v, at: now(), res: '', resAt: 0, perfect: ch > 1, pred: true });
        }
        /* Holding the ball: press and hold (anywhere in the room) to wind up, let go to throw that way.
           A quick click still walks (or throws at whoever's under it). */
        let press = null, skipClick = false;
        const roomXY = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * A.W, (e.clientY - r.top) / r.height * A.H]; };
        stage.addEventListener('pointerdown', (e) => {
            if (!haveBall() || e.button > 0 || e.target !== cv) return;
            const [x, y] = roomXY(e);
            press = { at: now(), x, y };
        });
        listen('pointermove', (e) => { if (!press) return; [press.x, press.y] = roomXY(e); if (charging) [charging.x, charging.y] = [press.x, press.y]; });
        listen('pointerup', (e) => {
            if (!press) return;
            const held = now() - press.at, [x, y] = roomXY(e);
            press = null;
            if (!charging) return;                                             // a click: floorClick has it
            const q = personAt(x, y), raw = (held - CHARGE_AFTER) / CHARGE_FULL;
            const c = raw >= 1 && raw - 1 <= PERFECT_S / CHARGE_FULL ? PERFECT : Math.min(1, Math.max(0, raw));      // just as it's full: perfect
            charging = null;
            skipClick = true; setTimeout(() => { skipClick = false; }, 400);
            if (haveBall()) throwAt(q ? q.x : x, q ? q.y : y, c);
            core.send({ t: 'hall-db-charge', on: false });
        });
        function chargeTick() {
            if (press && !charging && now() - press.at >= CHARGE_AFTER && haveBall()) {
                charging = { at: press.at + CHARGE_AFTER, x: press.x, y: press.y };
                core.send({ t: 'hall-db-charge', on: true });
            }
            if (charging && !haveBall()) charging = null;
        }
        /** The bar over the floor: the score, what's going on, and joining in. */
        function paintDodge() {
            const el = dbEl();
            if (!el) return;
            const left = Math.max(0, Math.ceil(((db.until || 0) - (now() - dbAt) * 1000) / 1000));
            let html = '';
            if (db.state === 'asking') {
                const asked = db.asked || [], inn = asked.includes(me);
                html = '<p>🏐 <b>Dodgeball!</b> ' + (inn ? 'You’re in — starting in ' + left + 's' : dodgeNo ? 'You’re sitting this one out (' + left + 's)' : 'Play? (' + left + 's)') +
                    ' · ' + asked.length + ' in</p>' + (inn ? '' : '<div><button type="button" class="btn go" data-db="1">I’m in</button>' + (dodgeNo ? '' : '<button type="button" class="btn" data-db="0">Sit out</button>') + '</div>');
            } else if (db.state) {
                const T = (i) => '<b style="color:' + DB_TEAMS[i][1] + '">' + DB_TEAMS[i][0].toUpperCase() + '</b>';
                const myT = dbTeam(me), hold = db.ball;
                let st = '';
                if (db.state === 'ready') st = 'Round ' + db.round + ' — get ready… ' + left;
                else if (db.state === 'playing') st = hold === me ? '<b>You have the ball!</b> Hold to wind up, let go to throw that way, or click someone (' + left + 's)'
                    : myT >= 0 && dbOut(me) ? 'You’re out — back in next round' : hold ? esc(nameOf(hold)) + ' has the ball (' + left + 's)' : '…';
                else if (db.state === 'round') st = T(db.win) + ' takes round ' + db.round + '!';
                else if (db.state === 'over') st = '🏆 ' + T(db.win) + ' wins!';
                if (db.state === 'playing' && myT >= 0 && !dbOut(me) && hold !== me) st += ' · <span class="hg-dim">Dash or jump just as it gets to you to catch it</span>';
                if (myT < 0 && db.state !== 'over') st += ' · <span class="hg-dim">watching from the back</span>';
                html = '<p>' + T(0) + ' ' + db.score[0] + ' – ' + db.score[1] + ' ' + T(1) + (myT >= 0 ? ' · you’re ' + T(myT) : '') + '</p><p>' + st + '</p>';
            }
            if (el.innerHTML !== html) el.innerHTML = html;
            el.hidden = !html;
        }
        let dodgeNo = false;
        const dbT = setInterval(() => { if (db.state) paintDodge(); else dodgeNo = false; }, 250);
        offs.push(() => clearInterval(dbT));
        /** The court on the floor: a line down the middle, each half its team's colour, the ends for the out, the back for the rest. */
        function court() {
            const [mx, y0] = toPx(500, 180), [, y1] = toPx(500, 1000), [lx] = toPx(45, 0), [rx] = toPx(955, 0), [, sy] = toPx(0, 110);
            lc.globalAlpha = 0.1; lc.fillStyle = DB_TEAMS[0][1]; lc.fillRect(Math.round(lx), Math.round(y0), Math.round(mx - lx), Math.round(y1 - y0));
            lc.fillStyle = DB_TEAMS[1][1]; lc.fillRect(Math.round(mx), Math.round(y0), Math.round(rx - mx), Math.round(y1 - y0));
            lc.globalAlpha = 0.25; lc.fillStyle = '#000000';
            lc.fillRect(F.x0, Math.round(y0), Math.round(lx - F.x0), Math.round(y1 - y0)); lc.fillRect(Math.round(rx), Math.round(y0), Math.round(F.x1 - rx), Math.round(y1 - y0));
            lc.fillRect(F.x0, F.y0, F.x1 - F.x0, Math.round(sy - F.y0));
            lc.globalAlpha = 0.7; lc.fillStyle = '#ffffff';
            for (let y = Math.round(y0); y < y1; y += 4) lc.fillRect(Math.round(mx), y, 1, 2);
            lc.globalAlpha = 1;
        }
        /* The ball in pixels, the room's own size (like the people): a disc of whole room pixels
           around (cx, cy), drawn u screen pixels a side. */
        function pixDisc(cx, cy, rx, ry, col, u) {
            const x0 = Math.round(cx), y0 = Math.round(cy), w = Math.ceil(u);
            ctx.fillStyle = col;
            for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++)
                if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.05) ctx.fillRect(Math.round((x0 + dx) * u), Math.round((y0 + dy) * u), w, w);
        }
        /** The ball at (x, y) screen pixels; `k` swells it (winding up). */
        function ballAt(x, y, u, k = 1) {
            const cx = x / u, cy = y / u, r = 1.6 * k;
            pixDisc(cx, cy, r + 1, r + 1, '#6e1208', u);                       // the outline
            pixDisc(cx, cy, r, r, '#e8402f', u);
            ctx.fillStyle = '#ffb3a3';                                          // where the light catches it
            ctx.fillRect(Math.round((Math.round(cx) - Math.round(r * 0.6)) * u), Math.round((Math.round(cy) - Math.round(r * 0.6)) * u), Math.ceil(u), Math.ceil(u));
        }
        /* How fast it's going, behind it: nothing for a normal throw, speed lines for a fast one,
           flames for a perfect one (both fading as it slows). In room pixels, like the ball. */
        const FAST_V = 250;                                   // px/s: about half charged, or more
        const FLAME = ['#fff3a0', '#ffc046', '#ff6a1f', '#c8102e'];
        function speedTrail(f, s, b, cx, cy, t, u) {
            const fast = b.v > FAST_V;
            if (!f.perfect && !fast) return;
            const back = ballPos(f, Math.max(0, s - 0.03)), mx = b.x - back.x, my = b.y - back.y, n = Math.hypot(mx, my);
            if (n < 0.01) return;
            const ux = -mx / n, uy = -my / n, px = -uy, py = ux, w = Math.ceil(u);           // pointing back the way it came
            const px1 = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(Math.round(x) * u), Math.round(Math.round(y) * u), w, w); };
            ctx.save();
            if (f.perfect && b.v > BALL.v0) {
                // Flames: hottest by the ball, flickering, narrowing as they trail off.
                const len = Math.min(16, 6 + (b.v - BALL.v0) / 20);
                for (let d = 2; d <= len; d++) {
                    const k = d / len, half = Math.max(0, Math.round((1 - k) * 3.5));
                    for (let j = -half; j <= half; j++) {
                        const flick = Math.sin(t * 40 + d * 1.7 + j * 2.3);
                        if (k > 0.5 && flick < -0.3) continue;
                        ctx.globalAlpha = 0.95 - k * 0.5;
                        px1(cx + ux * d + px * j + flick * 0.6, cy + uy * d + py * j, FLAME[Math.min(3, Math.floor(k * 4 + (flick > 0.6 ? 1 : 0)))]);
                    }
                }
            } else {
                // Speed lines: three short dashes behind it, longer the faster.
                const len = Math.min(9, 3 + (b.v - FAST_V) / 30);
                ctx.globalAlpha = Math.min(0.85, 0.3 + (b.v - FAST_V) / 200);
                for (const j of [-2, 0, 2]) {
                    const skip = Math.floor(t * 30 + j) % 2;                                  // a little shimmer
                    for (let d = 3 + skip + Math.abs(j); d <= len + 3 - Math.abs(j); d++) px1(cx + ux * d + px * j, cy + uy * d + py * j, '#ffffff');
                }
            }
            ctx.restore();
        }
        /** Your aim while winding up: a little pixel arrow from your feet, `len` room pixels long (longer the harder), outlined dark. */
        function aimArrow(x, y, ux, uy, len, col, u) {
            const px = -uy, py = ux, dots = new Set();
            const dot = (a, b) => dots.add(Math.round(a) + ',' + Math.round(b));
            for (let d = 5; d <= len - 3; d += 0.5) dot(x + ux * d, y + uy * d);                     // the shaft
            for (let k = 0; k <= 3; k++) for (let j = -k; j <= k; j += 0.5) dot(x + ux * (len - k) + px * j, y + uy * (len - k) + py * j);     // the head
            const w = Math.ceil(u), at = (s) => s.split(',').map(Number);
            ctx.save();
            ctx.globalAlpha = 0.7; ctx.fillStyle = '#120e1e';
            for (const s of dots) { const [a, b] = at(s); for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.fillRect(Math.round((a + ox) * u), Math.round((b + oy) * u), w, w); }
            ctx.globalAlpha = 1; ctx.fillStyle = col;
            for (const s of dots) { const [a, b] = at(s); ctx.fillRect(Math.round(a * u), Math.round(b * u), w, w); }
            ctx.restore();
        }
        const handOf = (p, heads, u) => [(p.x + (p.face < 0 ? -1 : 1) * 6) * u, (heads.get(p.h) + 10) * u];
        /** The ball: in someone's hand, or in the air on its way to someone (then caught, or bouncing off them). */
        function drawBall(t, u, heads) {
            chargeTick();
            // One ball: none in a hand while it's rolling, or bouncing off whoever it just hit.
            const flying = [...flights.values()].some(f => !f.res || (f.res === 'hit' && t - f.resAt < 0.6));
            const holder = people.get(db.ball);
            if (!flying && holder && heads.has(holder.h) && (db.state === 'playing' || db.state === 'ready')) {
                const [x, y] = handOf(holder, heads, u);
                // Winding up: the ball swells and glows (and for you, a line the way you're aiming, longer the harder).
                const since = holder.h === me ? (charging ? charging.at : 0) : chargeOf.get(holder.h) || 0;
                const c = since ? Math.min(1, (t - since) / CHARGE_FULL) : 0;
                const perfectNow = since && t - since >= CHARGE_FULL && t - since - CHARGE_FULL <= PERFECT_S;     // let go now!
                if (c > 0) {
                    ctx.save(); ctx.globalAlpha = perfectNow ? 0.95 : 0.25 + 0.35 * c + 0.15 * Math.sin(t * 20);
                    pixDisc(x / u, y / u, 3.5 + 3 * c, 3.5 + 3 * c, perfectNow ? '#ffffff' : c >= 1 ? '#fff3a0' : '#ff9f43', u);
                    ctx.restore();
                }
                if (holder.h === me && charging) {
                    const p = mine(), dx = charging.x - p.x, dy = (charging.y - p.y) * 0.6, n = Math.hypot(dx, dy) || 1;
                    aimArrow(p.x, p.y - 7, dx / n, dy / n, 10 + 18 * c, perfectNow ? (Math.floor(t * 16) % 2 ? '#ffffff' : '#ffd34a') : c >= 1 ? '#ffd34a' : '#ffffff', u);
                }
                ballAt(x, y - (c ? 0 : Math.round(Math.abs(Math.sin(t * 4)))) * u, u, 1 + 0.5 * c);
            }
            for (const [id, f] of flights) {
                const s = t - f.at;
                if (f.res && t - f.resAt > 1.4) { flights.delete(id); continue; }
                if (f.pred && s > 1.5) { flights.delete(id); continue; }                     // the station never took it
                if (f.res === 'dead') continue;                                              // stopped: it's in someone's hand now
                // On its way along the floor (its shadow on the floor, the ball a little above it); stopped where it got to.
                const b = f.res ? { x: f.rx, y: f.ry } : ballPos(f, s);
                const fx = (F.x0 + b.x) * u, fy = (F.y0 + b.y) * u;
                if (f.res === 'hit' || f.res === 'catch') {
                    const who = people.get(f.b), k = Math.min(1, (t - f.resAt) / 0.6);
                    if (f.res === 'hit') {
                        ctx.globalAlpha = 1 - k * 0.7;
                        ballAt(fx + (f.vx > 0 ? 1 : -1) * k * 14 * u, fy - 7 * u + (Math.pow(k, 2) * 9 - Math.sin(k * Math.PI) * 6) * u, u);
                        ctx.globalAlpha = 1;
                        if (who && heads.has(who.h)) popWord('OUT!', who.x * u, (heads.get(who.h) - 6 - k * 3) * u, u, '#ff6b6b');
                    } else if (who && heads.has(who.h)) popWord('CATCH!', who.x * u, (heads.get(who.h) - 6 - k * 3) * u, u, '#8dffb0');
                    continue;
                }
                if (f.perfect && s < 0.8) { const th = people.get(f.a); if (th && heads.has(th.h)) popWord('PERFECT!', th.x * u, (heads.get(th.h) - 6 - s * 4) * u, u, '#fff3a0'); }
                pixDisc(fx / u, fy / u, 2.4, 1, 'rgba(0,0,0,0.45)', u);
                if (!f.res) speedTrail(f, s, b, fx / u, fy / u - 7, t, u);
                ballAt(fx, fy - (f.res === 'dead' ? 2.3 : 7) * u, u);
            }
        }

        /* ---------- rock paper scissors ---------- */
        // id → { id, a, b, state, picks, win, until }: shown over both players, finished ones for a few seconds.
        const games = new Map();
        let myPick = '';
        const nameOf = (h) => (people.get(h) || {}).n || 'someone';
        function openPop(q, e) {
            const sr = stage.getBoundingClientRect();
            const their = tableOf(q.h);
            const mineHeld = (mine() || {}).o;
            popEl.innerHTML = '<b>' + esc(q.n) + '</b>' + (mineHeld ? '<button type="button" class="btn go" data-give="' + esc(q.h) + '">' +
                (bombMine() ? '💣 Pass them the bomb!' : mineHeld === BOMB && !bomb ? '💣 Hand them a lit bomb (hot potato!)' : '🎁 Give them your ' + mineHeld) + '</button>' : '') +
                '<button type="button" class="btn" data-rps="' + esc(q.h) + '">✊✋✌️ Rock paper scissors</button>' +
                (their && their.state === 'waiting' && their.seats.includes('') && !tableOf(me)
                    ? '<button type="button" class="btn go" data-join="' + their.id + '">🎲 Join their ' + GAME_NAMES[their.g] + '</button>'
                    : their ? '<button type="button" class="btn" data-watch="' + their.id + '">🎲 ' + (their.state === 'waiting' ? 'Their table (' + GAME_NAMES[their.g] + ')' : 'Watch their ' + GAME_NAMES[their.g]) + '</button>' : '') +
                (safe ? '<span class="hp-note">Bonks and slaps are off for you (🎨 Look)</span>'
                    : q.s ? '<span class="hp-note">' + esc(q.n) + ' doesn’t want to be hit</span>'
                    : (duelOf(me) ? '' : '<button type="button" class="btn go" data-duel="' + esc(q.h) + '">⚔ Duel</button>') +
                      HITS.map(([k, icon, name]) => '<button type="button" class="btn" data-hit="' + k + '" data-to="' + esc(q.h) + '">' + icon + ' ' + name + '</button>').join(''));
            popEl.style.left = Math.min(sr.width - 220, Math.max(4, e.clientX - sr.left + 8)) + 'px';
            popEl.style.top = Math.max(4, e.clientY - sr.top - 30) + 'px';
            popEl.hidden = false;
        }
        popEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const jb = e.target.closest('[data-join]');
            if (jb) { popEl.hidden = true; return core.send({ t: 'hall-table-sit', id: jb.dataset.join }); }
            const wb = e.target.closest('[data-watch]');
            if (wb) { popEl.hidden = true; view = wb.dataset.watch; sel = null; hops = []; gamesEl.hidden = false; return paintGames(); }
            const hb = e.target.closest('[data-hit]');
            if (hb) { popEl.hidden = true; return doHit(hb.dataset.to, hb.dataset.hit); }
            const du = e.target.closest('[data-duel]');
            if (du) { popEl.hidden = true; return core.send({ t: 'hall-duel', to: du.dataset.duel }); }
            const gv = e.target.closest('[data-give]');
            if (gv) {
                popEl.hidden = true;
                const p = mine(), q = people.get(gv.dataset.give);
                if (p && q && p.o === BOMB) return passBomb(q.h);           // (with where you both are: what you saw counts)
                return core.send({ t: 'hall-give', to: gv.dataset.give });
            }
            const b = e.target.closest('[data-rps]');
            if (!b) return;
            core.send({ t: 'hall-rps', to: b.dataset.rps });
            popEl.hidden = true;
        });

        /* ---------- bonk, fish slap, snowball ---------- */
        let pendingHit = null;            // walking over to someone to bonk or slap them: { h, k, until }
        const near = (p, q) => Math.abs(p.x - q.x) <= 14 && Math.abs(p.y - q.y) <= 9;
        /* Your swing starts on your screen the moment you press (`pred`); the station confirms it
           (and says which fish), or it fades. Where you and they were on your screen goes with it:
           the engine judges "close enough" by that, if it's believable (engine/hall.js seen()).
           The pauses are the engine's own (FUN.hitEveryMs; in a duel DUEL.hitEveryMs, bonkEveryMs). */
        let myHitAt = -9, myBonkAt = -9;
        function sendHit(q, k) {
            const p = mine(), t = now(), d = duelOf(me);
            if (!p || !q) return;
            const fight = !!d && d.state === 'fighting' && (q.h === d.a || q.h === d.b);
            if (t - myHitAt < (fight ? 0.45 : 1.5) || (fight && k === 'bonk' && t - myBonkAt < 3)) return;
            myHitAt = t;
            if (fight && k === 'bonk') myBonkAt = t;
            const [ax, ay] = toU(p.x, p.y), [bx, by] = toU(q.x, q.y);
            core.send({ t: 'hall-hit', to: q.h, k, ax, ay, bx, by });
            if (k !== 'snowball' || Math.abs(q.x - p.x) > 1) p.face = q.x < p.x ? -1 : 1;
            // Only what the station will surely take plays early (not someone safe, or busy in someone else's duel).
            if (safe || q.s || (!fight && (duelOf(q.h) || d))) return;
            let n = 0;
            if (fight && k === 'slap') {
                const c = (d.chain || {})[me] || {};
                n = Math.min(3, (c.slap || 0) + hits.filter(x => x.pred && x.a === me && x.k === 'slap').length + 1);
            }
            hits.push({ a: me, b: q.h, k, at: t, dir: q.x < p.x ? -1 : 1, n, pred: true });
            while (hits.length > 30) hits.shift();
        }
        function doHit(h, k) {
            const p = mine(), q = people.get(h);
            if (!p || !q || held(me)) return;
            if (MELEE[k] && !near(p, q)) {
                // Up close for these: walk over to their side first, then swing.
                const side = p.x < q.x ? -1 : 1, x = clampX(q.x + side * 9), y = clampY(q.y);
                p.tx = x; p.ty = y; sendGo(x, y);
                pendingHit = { h, k, until: now() + 5 };
                return;
            }
            pendingHit = null;
            sendHit(q, k);
        }
        /** Got there: swing (called every frame while walking over). */
        function hitWhenClose() {
            if (!pendingHit) return;
            const p = mine(), q = people.get(pendingHit.h);
            if (!p || !q || now() > pendingHit.until) { pendingHit = null; return; }
            if (!near(p, q)) return;
            sendHit(q, pendingHit.k);
            pendingHit = null;
        }
        function onHit(m) {
            const a = people.get(m.a), b = people.get(m.b);
            if (!a || !b) return;
            let x = m.a === me ? hits.find(h => h.pred && h.b === m.b && h.k === m.k) : null;
            if (x) { x.pred = false; x.n = m.n || 0; }            // yours, already swinging: the station agrees (and says which fish)
            else {
                if (m.k !== 'snowball' || Math.abs(b.x - a.x) > 1) a.face = b.x < a.x ? -1 : 1;
                x = { a: m.a, b: m.b, k: m.k, at: now(), dir: b.x < a.x ? -1 : 1, n: m.n || 0 };
                hits.push(x);
                while (hits.length > 30) hits.shift();
            }
            if (m.to) {
                // A duel's slap knocks them back a little; the tuna, in slow motion, throws them across the room.
                const [kx, ky] = toPx(m.to[0], m.to[1]), tuna = m.n === 3;
                if (tuna) { slowMo(1.8, 0.3); for (let i = hits.length - 1; i >= 0; i--) if (hits[i] !== x && hits[i].b === m.b && hits[i].k === 'slap') hits.splice(i, 1); }     // just the tuna's words
                Object.assign(b, { knock: { x0: b.x, y0: b.y, x1: kx, y1: ky, at: now() + (tuna ? 0.15 : 0), dur: tuna ? 0.9 : 0.25, arc: tuna ? 26 : 0 }, tx: kx, ty: ky, pushed: false });
                if (m.b === me) { lastSent = ''; pendingHit = null; }
            }
            const fish = m.k === 'slap' && m.n ? DUEL_FISH[m.n - 1] : null;
            logLine({ text: fish ? '🐟 ' + a.n + ' slapped ' + b.n + ' with a ' + fish[0] + (m.n === 3 ? '!' : '') : HIT_LINE[m.k](a.n, b.n) }, 'game');
        }
        /** A dash or jump with a snowball coming at you: one try each — in time, and it misses. */
        function tryTech(t) {
            // A dodgeball coming at you: in time, you catch it.
            // (Only when it's about to get to you: that's your one try. The station decides if it was in time.)
            const p = mine();
            for (const [id, f] of flights) {
                if (f.res || f.tried || !p || dbTeam(me) < 0 || dbOut(me) || dbTeam(f.a) === dbTeam(me)) continue;
                const mx = p.x - F.x0, my = p.y - F.y0;
                for (let k = 0; k <= 80; k++) {
                    const b = ballPos(f, t - f.at + k * 0.01);
                    if (Math.abs(b.x - mx) <= BALL.hitX + 1 && Math.abs(b.y - my) <= BALL.hitY + 1) { f.tried = true; core.send({ t: 'hall-db-catch', id, s: +(t - f.at).toFixed(3) }); break; }      // s: when, on your screen
                    if (b.dead) break;
                }
            }
            const x = hits.find(h => h.k === 'snowball' && h.b === me && !h.tried && t - h.at < SNOW_S);
            if (!x) return;
            x.tried = true;                                     // too early counts too: no mashing
            if (t - x.at < TECH_FROM) return;
            x.tech = t;
            core.send({ t: 'hall-tech' });
        }
        function onTech(m) {
            let x = null;
            for (const h of hits) if (h.k === 'snowball' && h.b === m.h && h.a === m.a) x = h;
            if (x && !x.tech) x.tech = now();
            const a = people.get(m.a), b = people.get(m.h);
            if (a && b) logLine({ text: '💨 ' + b.n + ' dodged ' + a.n + '’s snowball. TECH!' }, 'game');
        }
        /** Knocked about: where someone is drawn, just after a hit. */
        function hitOffset(p, t) {
            let ox = 0, oy = 0;
            for (const x of hits) {
                if (x.b !== p.h) continue;
                const s = t - x.at;
                if (x.k === 'slap' && s > 0.15 && s < 0.6) ox += x.dir * 5 * (1 - (s - 0.15) / 0.45);
                if (x.k === 'bonk' && s > 0.25 && s < 0.75) oy += 2;
                if (x.k === 'snowball' && !x.tech && s > SNOW_S && s < 0.7) ox += x.dir * 2;
            }
            return [ox, oy];
        }
        function emojiAt(ch, x, y, size, angle) {
            ctx.save();
            ctx.font = size + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.translate(Math.round(x), Math.round(y));
            if (angle) ctx.rotate(angle);
            ctx.fillText(ch, 0, 0);
            ctx.restore();
        }
        function popWord(text, x, y, u, color) {
            const fs = Math.max(12, Math.round(4 * u / dpr)) * dpr;
            ctx.font = 'bold ' + fs + 'px "Courier New", monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = Math.max(2, fs / 5); ctx.strokeStyle = '#000';
            ctx.strokeText(text, Math.round(x), Math.round(y));
            ctx.fillStyle = color; ctx.fillText(text, Math.round(x), Math.round(y));
        }
        function snowball(x, y, u) {
            ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#9ab8d8'; ctx.lineWidth = Math.max(1, u / 3);
            ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), 1.6 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        /** The swings, the fish and the snowballs, and what they do. */
        function drawHits(t, u, heads) {
            const es = Math.max(14, Math.round(6 * u / dpr)) * dpr;
            for (let i = hits.length - 1; i >= 0; i--) {
                const x = hits[i], s = t - x.at;
                if (s > 1.6 || (x.pred && s > 0.8)) { hits.splice(i, 1); continue; }         // (yours, and the station never took it)
                const a = people.get(x.a), b = people.get(x.b);
                if (!b || !heads.has(b.h)) continue;
                const hx = b.x * u, hy = heads.get(b.h) * u, d = x.dir;
                if (x.k === 'bonk') {
                    // The hammer comes down on their head, then stars.
                    if (s < 0.35) emojiAt('🔨', hx - d * 4 * u, hy - 5 * u, es, d * (-1.4 + Math.min(1, s / 0.25) * 1.7));
                    if (s > 0.25) {
                        for (let k = 0; k < 3; k++) {
                            const a2 = s * 7 + k * 2.1;
                            popWord('*', hx + Math.cos(a2) * 6 * u, hy - 2 * u + Math.sin(a2) * 2 * u, u * 0.8, '#ffd34a');
                        }
                        if (s < 1) popWord('BONK!', hx, hy - 9 * u - s * 3 * u, u, '#ffd34a');
                    }
                } else if (x.k === 'slap') {
                    // A fish swung across their face (in a duel: a fish, a salmon, a tuna — bigger each time).
                    const f = DUEL_FISH[Math.max(0, (x.n || 1) - 1)];
                    if (s < 0.4) {
                        if (f[4]) ctx.filter = f[4];
                        emojiAt('🐟', hx - d * (8 - Math.min(1, s / 0.2) * 9) * u, hy + 3 * u, Math.round(es * f[3]), d * (-0.6 + s * 3));
                        ctx.filter = 'none';
                    }
                    if (x.n === 3 && s > 0.12 && s < 0.7) {
                        // The tuna lands: a flash, a shockwave and rays out of where it hit.
                        const k = (s - 0.12) / 0.58, cx = hx + d * 2 * u, cy = hy + 4 * u;
                        ctx.save();
                        ctx.globalAlpha = Math.max(0, 1 - k);
                        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, 2 * u * (1 - k));
                        ctx.beginPath(); ctx.arc(cx, cy, (4 + k * 40) * u, 0, Math.PI * 2); ctx.stroke();
                        ctx.strokeStyle = '#ffd34a'; ctx.lineWidth = Math.max(1, u);
                        for (let j = 0; j < 12; j++) {
                            const a3 = j / 12 * Math.PI * 2 + 0.2, r0 = (3 + k * 12) * u, r1 = r0 + (6 + (j % 3) * 5) * u * (1 - k * 0.5);
                            ctx.beginPath(); ctx.moveTo(cx + Math.cos(a3) * r0, cy + Math.sin(a3) * r0); ctx.lineTo(cx + Math.cos(a3) * r1, cy + Math.sin(a3) * r1); ctx.stroke();
                        }
                        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = Math.max(0, 0.9 - k * 3);
                        ctx.beginPath(); ctx.arc(cx, cy, (6 + k * 10) * u, 0, Math.PI * 2); ctx.fill();
                        ctx.restore();
                    }
                    if (s > 0.15 && s < 1.1) popWord(x.n ? f[1] : 'SLAP!', hx + d * 6 * u, hy - 7 * u - s * 3 * u, u * (x.n === 3 ? 1.7 : 1), f[2]);
                } else {
                    // A snowball in an arc from their hand, then a splat (on them; or teched, on the floor behind them).
                    if (x.tech) {
                        if (s < 1.2) popWord('TECH!', hx, hy - 9 * u - Math.min(s, 0.8) * 4 * u, u, '#8dffb0');
                        const fx = (b.x + d * 26) * u, fy = (b.y - 1) * u, past = 0.3;
                        if (a && heads.has(a.h) && s < SNOW_S) {
                            const k = s / SNOW_S, ax = (a.x + (b.x < a.x ? -5 : 5)) * u, ay = (heads.get(a.h) + 8) * u;
                            snowball(ax + (hx - ax) * k, ay + (hy + 3 * u - ay) * k - Math.sin(k * Math.PI) * 14 * u, u);
                        } else if (s < SNOW_S + past) {
                            const k = (s - SNOW_S) / past;                      // on past them, down to the floor
                            snowball(hx + (fx - hx) * k, hy + 3 * u + (fy - hy - 3 * u) * k * k, u);
                        } else {
                            const k = s - SNOW_S - past;
                            ctx.fillStyle = '#ffffff';
                            for (let j = 0; j < 6; j++) {
                                const a3 = j / 6 * Math.PI * 2;
                                ctx.globalAlpha = Math.max(0, 1 - k / 0.5);
                                ctx.fillRect(Math.round(fx + Math.cos(a3) * (2 + k * 10) * u), Math.round(fy + Math.sin(a3) * (0.5 + k * 3) * u), Math.ceil(u * 0.8), Math.ceil(u * 0.8));
                            }
                            ctx.globalAlpha = 1;
                        }
                    } else if (a && heads.has(a.h) && s < 0.45) {
                        const k = s / 0.45, ax = (a.x + (b.x < a.x ? -5 : 5)) * u, ay = (heads.get(a.h) + 8) * u;
                        snowball(ax + (hx - ax) * k, ay + (hy + 3 * u - ay) * k - Math.sin(k * Math.PI) * 14 * u, u);
                    } else if (s >= 0.45) {
                        const k = s - 0.45;
                        ctx.fillStyle = '#ffffff';
                        for (let j = 0; j < 8; j++) {
                            const a3 = j / 8 * Math.PI * 2;
                            ctx.globalAlpha = Math.max(0, 1 - k / 0.6);
                            ctx.fillRect(Math.round(hx + Math.cos(a3) * (2 + k * 14) * u), Math.round(hy + 3 * u + Math.sin(a3) * (1 + k * 8) * u), Math.ceil(u * 0.8), Math.ceil(u * 0.8));
                        }
                        ctx.globalAlpha = 1;
                        if (k < 1.1) emojiAt('❄️', hx + d * 5 * u, hy - 3 * u, Math.round(es * 0.7), 0);
                    }
                }
            }
        }

        /* ---------- glowsticks: waved about, with trails ---------- */
        function drawGlows(sorted, heads, u, t) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            for (const p of sorted) {
                if (!p.g || !heads.has(p.h)) { p.trail.length = 0; continue; }
                const f = p.face < 0 ? -1 : 1, hx = p.x - f * 4, hy = heads.get(p.h) + 9;
                // Dancing (any pose) or walking: big loops; standing about: a gentle sway.
                const busy = p.e || p.walking, a = t * (busy ? 7 : 2.2) + p.x, r = busy ? 4.5 : 2;
                const tip = [hx + Math.cos(a) * r, hy - 3 + Math.sin(a) * r * 0.8];
                p.trail.push([tip[0], tip[1], t]);
                while (p.trail.length && t - p.trail[0][2] > 0.4) p.trail.shift();
                const colorAt = (k) => p.g === 'rainbow' ? 'hsl(' + Math.round((t * 220 + k * 40) % 360) + ',100%,60%)' : GLOW_COLOR[p.g];
                for (let k = 1; k < p.trail.length; k++) {
                    const [x0, y0] = p.trail[k - 1], [x1, y1, at] = p.trail[k];
                    ctx.globalAlpha = Math.max(0, 1 - (t - at) / 0.4) * 0.8;
                    ctx.strokeStyle = colorAt(k); ctx.lineWidth = Math.max(1, u * 0.9);
                    ctx.beginPath(); ctx.moveTo(x0 * u, y0 * u); ctx.lineTo(x1 * u, y1 * u); ctx.stroke();
                }
                ctx.globalAlpha = 1;
                ctx.shadowColor = colorAt(0); ctx.shadowBlur = 6 * u;
                ctx.strokeStyle = colorAt(0); ctx.lineWidth = Math.max(1.5, u * 1.1);
                ctx.beginPath(); ctx.moveTo(hx * u, hy * u); ctx.lineTo(tip[0] * u, tip[1] * u); ctx.stroke();
                ctx.shadowBlur = 0;
            }
            ctx.restore();
        }

        /* ---------- stage effects anyone can set off (when the host allows) ---------- */
        function paintBursts() {
            const fx = air.fx || {}, ok = joined && fx.crowd && fx.level;
            for (const [k] of BURSTS) {
                const b = actsEl.querySelector('[data-act="burst:' + k + '"]');
                if (b) b.hidden = !ok || (k === 'fire' && !(fx.on && fx.on.fire));
            }
        }
        // Waits (engine/hall.js FUN): yours after you set one off, and the room's after anyone does.
        const BURST_WAIT = { mine: 30, room: 6 };
        const cool = { mine: 0, room: 0, total: 0 };
        function burst(k) {
            if (Math.max(cool.mine, cool.room) > now()) return;
            core.send({ t: 'hall-fx', k });
        }
        function startCool(byMe) {
            const t = now();
            cool.room = t + BURST_WAIT.room;
            if (byMe) cool.mine = t + BURST_WAIT.mine;
            cool.total = Math.max(cool.mine, cool.room) - t;
            paintCool();
        }
        /** 🔥 and 🎊 greyed while they're waiting, with a sweep and the seconds left. */
        function paintCool() {
            const t = now(), until = Math.max(cool.mine, cool.room), left = until - t;
            for (const [k] of BURSTS) {
                const b = actsEl.querySelector('[data-act="burst:' + k + '"]');
                if (!b) continue;
                b.classList.toggle('cool', left > 0);
                b.disabled = left > 0 && !editingKeys;
                if (left > 0) { b.dataset.left = String(Math.ceil(left)); b.style.setProperty('--cool', String(Math.min(1, left / (cool.total || 1)))); }
                else { delete b.dataset.left; b.style.removeProperty('--cool'); }
            }
        }
        const coolT = setInterval(() => { if (cool.mine > now() - 1 || cool.room > now() - 1) paintCool(); }, 250);
        offs.push(() => clearInterval(coolT));
        function onGame(g, quiet) {
            const t = now(), old = games.get(g.id);
            // A new game (or a rematch) between either of them: the last one's WIN / DRAW comes down.
            if (!old && (g.state === 'asked' || g.state === 'picking'))
                for (const [id, x] of games) if (x.state !== 'asked' && x.state !== 'picking' && [x.a, x.b].some(h => h === g.a || h === g.b)) games.delete(id);
            const keep = { asked: 21, picking: 16, done: 20, declined: 3.5, expired: 3.5, gone: 0 }[g.state] || 0;
            if (!keep) games.delete(g.id); else games.set(g.id, { ...g, until: t + keep, at: old ? old.at : t, at2: t });
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
        /** Your part in a game: answer a challenge, or pick; after one, a rematch. */
        function paintRps() {
            const g = [...games.values()].find(x => (x.a === me || x.b === me) && (x.state === 'asked' || x.state === 'picking'));
            const done = !g && [...games.values()].reverse().find(x => (x.a === me || x.b === me) && x.state === 'done' && now() < x.until);
            let html = '';
            if (done) {
                const other = done.a === me ? done.b : done.a, asked = done.again || [];
                html = !people.has(other) ? '' : asked.includes(me)
                    ? '<p>Rematch? Waiting for <b>' + esc(nameOf(other)) + '</b>…</p>'
                    : '<p>' + (asked.includes(other) ? '<b>' + esc(nameOf(other)) + '</b> wants a rematch!' : 'Again?') + '</p>' +
                      '<div><button type="button" class="btn go" data-again>Rematch</button><button type="button" class="btn" data-nah>No thanks</button></div>';
            }
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
            rpsEl.dataset.id = g ? g.id : done ? done.id : '';
        }
        box.addEventListener('click', (e) => {
            const b = e.target.closest('.hall-db [data-db]');
            if (!b) return;
            e.stopPropagation();
            dodgeNo = b.dataset.db !== '1';
            core.send({ t: 'hall-db-join', yes: !dodgeNo });
        }, true);
        rpsEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = rpsEl.dataset.id, a = e.target.closest('[data-ans]'), p = e.target.closest('[data-pick]');
            if (a) core.send({ t: 'hall-rps-answer', id, ok: a.dataset.ans === '1' });
            if (e.target.closest('[data-again]')) core.send({ t: 'hall-rps-again', id });
            if (e.target.closest('[data-nah]')) { const g = games.get(id); if (g) g.until = 0; paintRps(); }
            if (p) { myPick = p.dataset.pick; core.send({ t: 'hall-rps-pick', id, pick: myPick }); paintRps(); }
        });
        /* ---------- Burgertime (engine/hall-burger.js) ---------- */
        // bt: as the station last said (plus `at`, when on this clock); btD: Daniel (room pixels, heading for tx, ty);
        // btZap / btBack: who was zapped / came back, when; btEat: his last mouthful.
        let bt = { state: '', burgers: [], eaten: [], stars: [], score: 0 }, btD = null, btEat = null, btStart = 0, btBurp = 0, btZapAt = 0, btFrenzy = 0;
        const btZap = new Map(), btBack = new Map();
        const BT_YELLS = ['HEY EVERYBODY, IT’S ME, DANIEL!', 'IT’S BURGERTIME!'];
        // His yell (daniel-burgertime.mp3): when each line is said, in seconds into it — the bubbles follow the sound.
        const BT_CLIP = 'daniel-burgertime.mp3', BT_SAID = [[0.2, 3.65], [4.0, 7.0]];
        let btAudio = null, btClipUrl = null;
        /** Where his yell is: next to this file in the app; from the station on the website (its address is in station.json, beside us). */
        function clipUrl() {
            if (!btClipUrl) btClipUrl = (async () => {
                if (core.engine) return core.engine.replace(/\/+$/, '') + '/js/' + BT_CLIP;
                try {
                    const j = await (await fetch(HERE + 'station.json', { cache: 'no-cache' })).json();
                    if (j && j.engine) return String(j.engine).replace(/\/+$/, '') + '/js/' + BT_CLIP;
                } catch { /* served by the station itself: it's right here */ }
                return HERE + BT_CLIP;
            })();
            return btClipUrl;
        }
        async function yell() {
            try {
                if (btAudio) btAudio.pause();
                const a = btAudio = new Audio(window.onairApp ? HERE + BT_CLIP : await clipUrl());
                const v = Number(core.state && core.state.volume);
                a.volume = Number.isFinite(v) ? Math.max(0.15, Math.min(1, v)) : 0.85;
                await a.play();
            } catch { /* no sound (the browser won't, or it isn't there): the bubbles keep to the clock */ }
        }
        /** Which line he's saying now (-1 none): by the sound while it plays, else by the clock. */
        function yellLine(t) {
            const s = btAudio && !btAudio.paused && btAudio.currentTime > 0 ? btAudio.currentTime : t - btStart;
            return BT_SAID.findIndex(([a, b]) => s >= a && s < b);
        }
        const btOn = () => !!bt.state;
        const isBurger = (h) => btOn() && (bt.state === 'zap' || bt.state === 'chase' || bt.state === 'burp') && (bt.burgers.includes(h) || btZap.has(h)) && !bt.eaten.includes(h);
        const isEaten = (h) => btOn() && bt.eaten.includes(h);
        let nice = 0, ebil = 0;                       // nice points (things you've given people) and ebil points (bombs you've passed): REWARDS
        try { nice = Number(localStorage.getItem('ltl.hallNice')) || 0; ebil = Number(localStorage.getItem('ltl.hallEbil')) || 0; } catch { /* none yet */ }
        const pointsOf = (kind) => (kind === 'ebil' ? ebil : nice);
        /** A point more: kept, and whatever it unlocks announced. */
        function gotPoint(kind) {
            if (kind === 'ebil') ebil++; else nice++;
            const n = pointsOf(kind), [icon, word] = POINTS[kind];
            try { localStorage.setItem(kind === 'ebil' ? 'ltl.hallEbil' : 'ltl.hallNice', String(n)); } catch { /* this time only */ }
            const got = REWARDS.filter(r => r[0] === kind && r[1] === n), next = REWARDS.find(r => r[0] === kind && r[1] > n);
            if (got.length) U.toast(icon + ' ' + n + ' ' + word + ' points! ' + got.map(r => r[4]).join(' and ') + (got.length > 1 ? ' are' : ' is') + ' yours: 🎨 Look.');
            else U.toast(icon + ' +1 ' + word + ' point (' + n + (next ? ' of ' + next[1] + ' for ' + next[4] : '') + ')');
            if (!lookEl.hidden) openLook();
        }
        const unlocked = (what, which) => { const r = rewardFor(what, which); return !r || pointsOf(r[0]) >= r[1]; };
        let burgerLook = false;                       // the secret burger (extra 11): yours once you've survived
        try { burgerLook = localStorage.getItem('ltl.hallBurger') === '1'; } catch { /* not yet */ }
        function onBt(m, quiet) {
            const t = now(), was = bt.state;
            bt = { state: m.state || '', burgers: m.burgers || [], eaten: m.eaten || [], stars: m.stars || [], score: m.score || 0, until: t + (m.until || 0) / 1000 };
            if (!bt.state) { btD = null; btZap.clear(); btEat = null; btFrenzy = 0; if (btAudio) { btAudio.pause(); btAudio = null; } return; }
            if (m.d && !btD) { const [x, y] = toPx(m.d[0], m.d[1]); btD = { x, y, tx: x, ty: y, v: 0 }; }
            if (bt.state === was) return;
            if (bt.state === 'enter') {
                btStart = t; btZap.clear(); btBack.clear(); btFrenzy = 0;
                if (!quiet) yell();
                if (!quiet) logLine({ text: '🦛 Daniel: ' + BT_YELLS[0] }, 'announce');
            }
            if (bt.state === 'zap') { btZapAt = t; if (!quiet) logLine({ text: '🦛 Daniel: ' + BT_YELLS[1] }, 'announce'); }
            if (bt.state === 'burp') {
                btBurp = t;
                for (const h of bt.stars) { const p = people.get(h); if (p) p.star = starTill(true); }
                if (!quiet) logLine({ text: '🍔 ' + (bt.stars.length ? bt.stars.map(nameOf).join(', ') + ' survived Burgertime! ⭐' : 'Daniel ate everybody.') + ' (Daniel: ' + bt.score + ')' }, 'announce');
                if (bt.stars.includes(me) && !burgerLook) {
                    burgerLook = true;
                    try { localStorage.setItem('ltl.hallBurger', '1'); } catch { /* this time only */ }
                    if (!quiet) U.toast('You survived Burgertime! ⭐ The secret burger look is yours: 🎨 Look → Extra.');
                }
            }
        }
        /** Daniel on his way, between the station's word on where he is. */
        function btStep(dt) {
            if (!btD || btD.sx == null) return;
            // Where he must be by now: from where the station last had him, on towards where he's headed at his speed...
            const ex = btD.tx - btD.sx, ey = btD.ty - btD.sy, en = Math.hypot(ex, ey), go = Math.min(en, (btD.v || 0) * (now() - btD.sat));
            const px = en > 0.01 ? btD.sx + ex / en * go : btD.sx, py = en > 0.01 ? btD.sy + ey / en * go : btD.sy;
            // ...and he glides there, rather than jumping.
            const k = 1 - Math.exp(-dt * 12), dx = px - btD.x;
            btD.x += dx * k; btD.y += (py - btD.y) * k;
            if (Math.abs(ex) > 0.5) btD.face = ex < 0 ? -1 : 1;
        }
        /* Burger Smash: he leaps (where he'll land is marked on the floor), then slams down. A dash or a jump
           just before he lands, close by, is a TECH (one try). */
        const swaves = [];                              // { x, y, at }: landings
        let btSmash = null;                             // { id, x, y, from, at, tried }
        const SMASH = { rx: 26, ry: 12, stun: 1.1, tech: 0.3, up: 16 };
        function onSmash(m) {
            const t = now();
            if (!m.land) {
                const [x, y] = toPx(m.x, m.y);
                btSmash = { id: m.id, x, y, from: t, at: t + (m.in || 750) / 1000, tried: false };
                return;
            }
            if (btSmash && btSmash.id === m.id) btSmash.done = true;
            for (const [h, xy] of Object.entries(m.hits || {})) {
                const q = people.get(h);
                if (!q) continue;
                const [kx, ky] = toPx(xy[0], xy[1]);
                Object.assign(q, { knock: { x0: q.x, y0: q.y, x1: kx, y1: ky, at: t, dur: 0.55, arc: 14 }, tx: kx, ty: ky, pushed: false, real: null });
                btStun.set(h, t + SMASH.stun);
                if (h === me) { lastSent = ''; U.toast('💫 SMASHED! Dash or jump just before he lands to TECH it.'); }
            }
            for (const h of m.tech || []) { btTech.set(h, t); logLine({ text: '💨 ' + nameOf(h) + ' teched Daniel’s Burger Smash!' }, 'game'); }
        }
        const btTech = new Map();                       // h → when they teched one
        /** A dash or jump: if Daniel's about to land on you, that's your one try at a tech. */
        function trySmashTech(t) {
            const s = btSmash, p = mine();
            if (!s || s.tried || s.done || !p || !isBurger(me)) return;
            if (Math.abs(p.x - s.x) > SMASH.rx + 6 || Math.abs(p.y - s.y) > SMASH.ry + 4) return;      // not in it: no try used
            s.tried = true;                                                                         // too early counts too: no mashing
            if (t < s.at - SMASH.tech || t > s.at + 0.08) return;
            core.send({ t: 'hall-bt-tech' });
        }
        /** Daniel's height off the floor in a smash (and the slam when he lands). */
        function smashLift(t) {
            const s = btSmash;
            if (!s) return 0;
            if (t >= s.at) {
                if (!s.slam) { s.slam = true; swaves.push({ x: s.x, y: s.y, at: s.at }); }
                if (t > s.at + 1.5) btSmash = null;
                return 0;
            }
            const k = (t - s.from) / (s.at - s.from);
            return 4 * SMASH.up * k * (1 - k);
        }
        /** Where he'll come down: a red ring on the floor, more solid as he falls. */
        function smashMark(t) {
            const s = btSmash;
            if (!s || t >= s.at) return;
            const k = Math.max(0, Math.min(1, (t - s.from) / (s.at - s.from)));
            lc.strokeStyle = 'rgba(255,40,60,' + (0.3 + 0.6 * k) + ')'; lc.lineWidth = 1;
            lc.setLineDash([2, 2]); lc.beginPath(); lc.ellipse(s.x, s.y, SMASH.rx, SMASH.ry, 0, 0, Math.PI * 2); lc.stroke(); lc.setLineDash([]);
            lc.fillStyle = 'rgba(255,40,60,' + 0.12 * k + ')'; lc.beginPath(); lc.ellipse(s.x, s.y, SMASH.rx, SMASH.ry, 0, 0, Math.PI * 2); lc.fill();
        }
        /** Daniel himself (drawn among everyone, by how far forward he is), the lasers, the burp and the jump. */
        function drawDaniel(t) {
            if (!btD) return null;
            const s = bt.state;
            let mode = 'chase', open = 0, lift = 0;
            if (s === 'enter') mode = Math.hypot(btD.tx - btD.x, btD.ty - btD.y) > 1 ? 'run' : 'dance';
            else if (s === 'zap') mode = 'zap';
            else if (s === 'chase') {
                if (btEat && t - btEat.at < 1) { mode = 'chomp'; open = Math.abs(Math.sin((t - btEat.at) * 12)); }
                else if (btSmash && t < btSmash.at + 0.35) { mode = t < btSmash.at ? 'zap' : 'chomp'; open = t < btSmash.at ? 1 : 0.2; lift = smashLift(t); }   // BURGER SMASH
                else if (btD.f) { mode = 'frenzy'; open = Math.abs(Math.sin(t * (14 + btD.f * 10))); }        // chomping at the air
                else { mode = btD.lunge ? 'lunge' : 'chase'; open = btD.lunge ? 0.8 : 0.25; }
            } else if (s === 'burp') {
                const k = t - btBurp;
                if (k < 2.2) { mode = 'burp'; open = 1; }
                else if (k < 2.9) { mode = 'run'; lift = Math.pow((k - 2.2) / 0.7, 2) * 160; }      // up through the ceiling
                else return null;
            } else return null;
            if (s === 'enter' && mode === 'dance') open = 0.5 + Math.sin(t * 10) * 0.5;
            if (s === 'enter' && mode === 'dance') btD.face = Math.floor(t * 2) % 2 ? 1 : -1;
            const eyes = A.hippo(lc, btD.x, btD.y - lift, t, { face: btD.face || -1, mode, open, f: btD.f || 0 });
            // The laser eyes: on whoever was just zapped.
            if (s === 'zap' || s === 'chase') {
                for (const [h, at] of btZap) {
                    const k = (t - at) / 0.45, p = people.get(h);
                    if (k < 0 || k > 1 || !p) continue;
                    btD.face = p.x < btD.x ? -1 : 1;
                    A.hippoLasers(lc, eyes, p.x, p.y - 7, t, k);
                }
            }
            return { x: btD.x, y: btD.y - lift - 50 };
        }
        /** The words: his yells over his head, BURGERTIME!, BUUUURP!, his score. */
        function drawBtWords(t, u, top) {
            if (!btOn()) return;
            const s = bt.state;
            const line = (s === 'enter' || s === 'zap') ? yellLine(t) : -1;
            if (top && line >= 0) bubble(BT_YELLS[line], top.x * u, top.y * u, u);
            const big = (str, y, c) => {
                const fs = Math.max(16, Math.round(9 * u / dpr)) * dpr;
                ctx.font = 'bold ' + fs + 'px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = '#000'; ctx.fillText(str, cv.width / 2 + 2 * dpr, y + 2 * dpr);
                ctx.fillStyle = c; ctx.fillText(str, cv.width / 2, y);
            };
            if (s === 'zap' && t - btZapAt < 2) big(BT_YELLS[1], cv.height * 0.3, '#ffcc33');
            if (s === 'chase' && btFrenzy) {
                // The frenzy: a red pulse round the edges (faster as it goes on), and the words when it starts.
                const f = (btD && btD.f) || 0, pulse = 0.5 + 0.5 * Math.sin(t * (6 + f * 10));
                const gr = ctx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.35, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.7);
                gr.addColorStop(0, 'rgba(255,0,40,0)'); gr.addColorStop(1, 'rgba(255,0,40,' + (0.12 + 0.2 * f) * pulse + ')');
                ctx.fillStyle = gr; ctx.fillRect(0, 0, cv.width, cv.height);
                if (t - btFrenzy < 2.2) big('FEEDING FRENZY!', cv.height * 0.3 + Math.sin(t * 40) * 3 * dpr, '#ff3b5c');
            }
            if (s === 'burp' && t - btBurp < 2.2) big('BUUUURP!', cv.height * 0.3 + Math.sin(t * 30) * 2 * dpr, '#b88cf2');
            if (btSmash && t - btSmash.from < 1.4) big('BURGER SMASH!', cv.height * 0.22 + Math.sin(t * 50) * 2 * dpr, '#ff9a3c');
            // Stunned burgers: stars going round; a TECH! over whoever dodged it.
            for (const [h, until] of btStun) {
                const p = people.get(h);
                if (until < t) { btStun.delete(h); continue; }
                if (!p) continue;
                for (let k = 0; k < 3; k++) { const a2 = t * 7 + k * 2.1; popWord('*', p.x * u + Math.cos(a2) * 6 * u, (p.y - 16) * u + Math.sin(a2) * 2 * u, u * 0.8, '#ffd34a'); }
            }
            for (const [h, at] of btTech) {
                const p = people.get(h), k = t - at;
                if (k > 1) { btTech.delete(h); continue; }
                if (p) popWord('TECH!', p.x * u, (p.y - 20 - k * 6) * u, u, '#7ee3ff');
            }
            if (bt.score && (s === 'chase' || s === 'burp')) {
                const fs = Math.max(11, Math.round(3.6 * u / dpr)) * dpr;
                ctx.font = 'bold ' + fs + 'px "Courier New", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                ctx.fillStyle = '#000'; ctx.fillText('🦛 DANIEL ' + bt.score, 8 * dpr + dpr, 8 * dpr + dpr);
                ctx.fillStyle = '#ffcc33'; ctx.fillText('🦛 DANIEL ' + bt.score, 8 * dpr, 8 * dpr);
            }
            if (s === 'chase' && btEat && t - btEat.at < 1.2 && btD) {
                const fs = Math.max(11, Math.round(4 * u / dpr)) * dpr, k = t - btEat.at;
                ctx.font = 'bold ' + fs + 'px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.globalAlpha = Math.max(0, 1 - k / 1.2); ctx.fillStyle = '#ffcc33'; ctx.fillText('+111', btD.x * u, (btD.y - 56 - k * 10) * u); ctx.globalAlpha = 1;
            }
        }

        /* ---------- duels (engine/hall-duel.js) ---------- */
        function onDuel(m, quiet) {
            const t = now(), old = duels.get(m.id);
            if (m.state === 'declined' || m.state === 'expired' || m.state === 'gone') duels.delete(m.id);
            else {
                const st = {};
                for (const [h, x] of Object.entries(m.st || {})) st[h] = { slow: t + x.slow / 1000, lvl: x.lvl || 0, stun: t + x.stun / 1000 };
                duels.set(m.id, { ...m, st, end: t + (m.until || 0) / 1000 });
            }
            const mineToo = m.a === me || m.b === me;
            if (!quiet && mineToo && m.state === 'asked' && m.b === me && !old) U.toast(nameOf(m.a) + ' challenges you to a duel!');
            if (!quiet && (!old || old.state !== m.state || old.round !== m.round)) {
                const A_ = nameOf(m.a), B_ = nameOf(m.b), W = nameOf(m.win), L = nameOf(m.win === m.a ? m.b : m.a);
                const text = m.state === 'asked' ? A_ + ' challenges ' + B_ + ' to a duel…'
                    : m.state === 'declined' ? B_ + ' said no to ' + A_ + '’s duel.'
                    : m.state === 'expired' ? A_ + '’s duel with ' + B_ + ' never started.'
                    : m.state === 'ready' && m.round === 1 ? A_ + ' and ' + B_ + ' face off!'
                    : m.state === 'round' ? (m.win ? W + ' takes round ' + m.round + '!' : 'Round ' + m.round + ': time’s up — nobody takes it.')
                    : '';
                if (text) logLine({ text: '⚔ ' + text }, 'game');
                // How it ended, for everyone (not just those with ⚔ games on).
                if (m.state === 'over') logLine({ text: m.why === 'left' ? '🏃 ' + L + ' has fled from combat. How embarrassing!' : '🏆 ' + W + ' defeated ' + L + ' in a duel!' + (m.why === 'quit' ? ' (' + L + ' gave up)' : '') }, 'announce');
            }
            paintDuel();
            if (mineToo) { paintActs(); pendingHit = null; }
        }
        /** Your duel's panel: answer a challenge, the countdown, the score and how you're doing. */
        let duelSay = null;                   // { text, until }: a moment's note ("Get closer!")
        const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);     // a phone: buttons, not keys
        function paintDuel() {
            const t = now();
            const d = [...duels.values()].find(x => (x.a === me || x.b === me) && (x.state !== 'over' || t < x.end));
            let html = '';
            if (d) {
                const foe = foeOf(d, me), F_ = '<b>' + esc(nameOf(foe)) + '</b>', left = Math.max(0, Math.ceil(d.end - t));
                const mineIdx = d.a === me ? 0 : 1, score = 'You ' + d.score[mineIdx] + ' – ' + d.score[1 - mineIdx] + ' ' + F_;
                const key = (k) => keymap['duel:' + k] ? ' <kbd>' + esc(keyShort(keymap['duel:' + k])) + '</kbd>' : '';
                if (d.state === 'asked' && d.b === me) {
                    html = '<p>' + F_ + ' challenges you to a duel! ⚔</p><div><button type="button" class="btn go" data-dans="1">Fight!</button><button type="button" class="btn" data-dans="0">No thanks</button></div>';
                } else if (d.state === 'asked') {
                    html = '<p>Waiting for ' + F_ + ' to accept your duel… (' + left + 's)</p><div><button type="button" class="btn" data-dquit>Call it off</button></div>';
                } else if (d.state === 'over') {
                    html = '<p>' + (d.why === 'left' && d.win === me ? '🏃 ' + F_ + ' fled — you win!' : (d.win === me ? '🏆 You win the duel!' : F_ + ' wins the duel.') + ' ' + d.score[mineIdx] + '–' + d.score[1 - mineIdx]) + '</p>';
                } else {
                    const s = d.st[me] || {}, ch = (d.chain || {})[me] || {}, theirs = (d.chain || {})[foe] || {};
                    let st = d.state === 'ready' ? 'Round ' + d.round + ' — get ready… ' + left
                        : d.state === 'round' ? (d.win === me ? 'You take round ' + d.round + '!' : d.win ? F_ + ' takes round ' + d.round + '.' : 'Time’s up — nobody takes it.')
                        : s.stun > t ? '💫 <b>You’re stunned!</b>' : s.slow > t ? '❄️'.repeat(s.lvl || 1) + ' You’re slowed' + (s.lvl >= 3 ? ' <b>a lot!</b>' : '') : 'Round ' + d.round + ' — FIGHT!';
                    if (d.state === 'fighting') {
                        if (ch.slap) st += ' · your slaps: ' + '🐟'.repeat(ch.slap);
                        if (ch.snow) st += ' · your snowballs: ' + '⛄'.repeat(ch.snow);
                        if (theirs.slap === 2) st += ' · <b class="hd-warn">one more slap and they take it!</b>';
                    }
                    if (duelSay && duelSay.until > t) st += ' · <b class="hd-warn">' + esc(duelSay.text) + '</b>';
                    html = '<p>⚔ ' + score + '</p><p>' + st + '</p>' +
                        (touch ? '<p class="hd-help">🔨 stuns · 🐟 three in a row takes the round · ⛄ slows, more each in a row — tap the big buttons</p>'
                            : '<p class="hd-help">🔨 Bonk' + key('bonk') + ' stuns · 🐟 Slap' + key('slap') + ' — three in a row takes the round · ⛄ Snowball' + key('snowball') + ' slows, more each in a row</p>') +
                        '<div><button type="button" class="btn" data-dquit>Give up</button></div>';
                }
            }
            if (duelEl._html !== html) { duelEl.innerHTML = html; duelEl._html = html; }
            duelEl.hidden = !html;
            duelEl.dataset.id = d ? d.id : '';
            paintPad(d, t);
        }
        // On a phone, the duel's moves as big buttons over the bottom of the room (just above the bar), while it's on.
        padEl.innerHTML = HITS.map(([k, icon, name]) => '<button type="button" data-dhit="' + k + '" title="' + name + '"><span>' + icon + '</span><small>' + name.replace('Fish ', '') + '</small></button>').join('');
        function paintPad(d, t) {
            const on = touch && !!d && FIGHT[d.state];
            padEl.hidden = !on;
            if (!on) return;
            const s = d.st[me] || {};
            padEl.classList.toggle('wait', d.state !== 'fighting' || s.stun > t);
        }
        padEl.addEventListener('pointerdown', (e) => {
            const b = e.target.closest('[data-dhit]');
            e.preventDefault(); e.stopPropagation();                    // a tap here isn't a walk
            if (!b) return;
            b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 150);
            duelHit(b.dataset.dhit);
        });
        padEl.addEventListener('click', (e) => e.stopPropagation());
        const duelT = setInterval(() => { if (duels.size || !duelEl.hidden) paintDuel(); }, 200);
        offs.push(() => clearInterval(duelT));
        duelEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = duelEl.dataset.id, a = e.target.closest('[data-dans]');
            if (a) core.send({ t: 'hall-duel-answer', id, ok: a.dataset.dans === '1' });
            if (e.target.closest('[data-dquit]')) core.send({ t: 'hall-duel-quit', id });
        });
        /** A key in a duel: that hit, at your opponent (bonks and slaps when you're close enough). */
        function duelHit(k) {
            const d = duelOf(me), p = mine();
            if (!d) return U.toast('Duel someone first: click them, then ⚔ Duel.');
            const q = people.get(foeOf(d, me));
            if (!p || !q || d.state !== 'fighting' || held(me)) return;
            if (MELEE[k] && !near(p, q)) { duelSay = { text: 'Get closer!', until: now() + 1.2 }; return paintDuel(); }
            sendHit(q, k);
        }
        /** On the duellists: stars when stunned, snowflakes when slowed (one a level, frost at 3), and the fish and snowballs in a row so far. */
        function drawDuels(t, u, heads) {
            const es = Math.max(10, Math.round(3.6 * u / dpr)) * dpr;
            for (const d of duels.values()) {
                if (d.state !== 'fighting' && d.state !== 'ready') continue;
                for (const h of [d.a, d.b]) {
                    const p = people.get(h), s = d.st[h];
                    if (!p || !s || !heads.has(h)) continue;
                    const hy = heads.get(h), x = p.x * u;
                    if (s.stun > t) {
                        for (let k = 0; k < 3; k++) {
                            const a2 = t * 7 + k * 2.1;
                            popWord('*', x + Math.cos(a2) * 6 * u, (hy - 2) * u + Math.sin(a2) * 2 * u, u * 0.8, '#ffd34a');
                        }
                    } else if (s.slow > t) {
                        const lv = Math.max(1, Math.min(3, s.lvl || 1));
                        if (lv >= 3) {
                            // A lot: frost over them (not ice: they can still walk).
                            ctx.fillStyle = 'rgba(170, 225, 255, 0.22)';
                            ctx.fillRect(Math.round((p.x - 6) * u), Math.round((hy - 2) * u), Math.round(12 * u), Math.round((p.y + 1 - hy + 2) * u));
                        }
                        emojiAt('❄️'.repeat(lv), x + (4 + lv * 2) * u, (hy - 1) * u, es, 0);
                    }
                    // What their opponent has going on them: 🐟🐟 (one more and that's the round), ⛄⛄.
                    const c = (d.chain || {})[foeOf(d, h)] || {};
                    const marks = '🐟'.repeat(c.slap || 0) + '⛄'.repeat(c.snow || 0);
                    if (marks && d.state === 'fighting') emojiAt(marks, x, (hy - 7) * u, es, 0);
                }
            }
        }
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
                    else if (g.state === 'done' && t - g.at2 < 7) { label = HANDS[g.picks[h]] + (g.win === h ? ' WIN!' : !g.win ? ' DRAW' : ''); win = g.win === h; }
                    else if (g.state === 'done' && (g.again || []).includes(h)) label = '🔁?';
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

        /* ---------- board games at tables (engine/hall.js and hall-games.js check every move) ---------- */
        const GAME_NAMES = { ttt: 'Tic-tac-toe', checkers: 'Checkers', chinese: 'Chinese checkers' };
        const SEAT_COLORS = ['#ff4f6a', '#4fa3ff', '#ffd34a', '#4fe08a', '#c07bff', '#ff9f43'];
        const seatColor = (tb, i) => tb.g === 'checkers' ? (i ? '#26222e' : '#e0303a') : SEAT_COLORS[i];
        // The Chinese checkers star, as the engine has it (axial q, r), and which point each hole is in.
        const STAR = [], DIRS6 = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
        const inStar = (q, r) => { const s = -q - r; return (q >= -4 && r >= -4 && s >= -4) || (q <= 4 && r <= 4 && s <= 4); };
        const POINT = [(q) => q > 4, (q, r) => -q - r < -4, (q, r) => r > 4, (q) => q < -4, (q, r) => -q - r > 4, (q, r) => r < -4];
        for (let r = -8; r <= 8; r++) for (let q = -8; q <= 8; q++) if (inStar(q, r)) STAR.push([q, r, POINT.findIndex(f => f(q, r))]);
        const tables = new Map();          // id → a table (engine/hall.js tablePublic), plus `at`: when it came, for the clock
        let view = '', sel = null, hops = [], leaving = '';      // the table open; a picked piece; a chain of hops; "sure?" to leave
        const gamesEl = $('.hall-games', box);
        const seatOf = (tb) => tb.seats.indexOf(me);
        const myTurn = (tb) => tb.state === 'playing' && tb.seats[tb.turn] === me;
        function resultText(tb) {
            const game = GAME_NAMES[tb.g], n = (s) => nameOf(tb.seats[s]);
            if (tb.win === -1) return game + ': ' + n(0) + ' and ' + n(1) + ' drew';
            // Won because the other one left or ran out of time: say who (with more players, everyone else did).
            const two = tb.seats.length === 2, loser = two ? n(1 - tb.win) : 'the others';
            const why = tb.why === 'time' ? ' (' + (two ? loser + ' ran out of time' : 'the others ran out of time or left') + ')' : tb.why === 'left' ? ' (' + loser + ' left)' : '';
            return n(tb.win) + ' won ' + game + (tb.seats.length === 2 ? ' against ' + n(1 - tb.win) : '') + why;
        }
        function onTable(tb, quiet) {
            const old = tables.get(tb.id);
            tb.at = now();
            tables.set(tb.id, tb);
            if (!quiet && !old && tb.state === 'waiting') {
                logLine({ text: '🎲 ' + nameOf(tb.seats[0]) + ' opened a ' + GAME_NAMES[tb.g] + ' table' + (tb.seats.length > 2 ? ' for ' + tb.seats.length : '') + ' — press 🎲 to sit down' }, 'game');
            }
            if (!quiet && old && old.state !== 'done' && tb.state === 'done') logLine({ text: '🎲 ' + resultText(tb) }, 'game');
            if (!quiet && old && old.state === 'done' && tb.state === 'playing') logLine({ text: '🎲 Rematch! ' + GAME_NAMES[tb.g] + ': ' + tb.seats.map(nameOf).join(' vs ') }, 'game');
            if (!quiet && old && tb.state === 'done' && seatOf(tb) >= 0 && (tb.again || []).length > (old.again || []).length && !tb.again.includes(seatOf(tb))) {
                const who = tb.seats[tb.again[tb.again.length - 1]];
                if (who !== me) U.toast(nameOf(who) + ' wants a rematch! (🎲)');
            }
            // Your own table opens by itself: when you sit down, and when the game starts.
            if (seatOf(tb) >= 0 && (!old || old.state !== tb.state) && tb.state !== 'done') { view = tb.id; gamesEl.hidden = false; }
            if (old && (old.turn !== tb.turn || old.state !== tb.state)) { sel = null; hops = []; leaving = ''; }
            if (tb.g === 'checkers' && tb.board && tb.board.must && myTurn(tb)) sel = tb.board.must.slice();     // keep jumping with that one
            paintGames();
        }
        function onTableGone(id) { tables.delete(id); if (view === id) view = ''; paintGames(); }
        function clock(tb) {
            const left = Math.max(0, Math.round((tb.until - (now() - tb.at) * 1000) / 1000));
            return Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
        }
        function paintGames() {
            if (gamesEl.hidden) return;
            const tb = view && tables.get(view);
            gamesEl.innerHTML = tb ? tableHtml(tb) : listHtml();
        }
        function listHtml() {
            const seated = [...tables.values()].some(tb => tb.state !== 'done' && seatOf(tb) >= 0);
            const off = seated ? ' disabled title="You’re at a table already"' : '';
            return '<div class="hg-head"><b>🎲 Board games</b><button type="button" class="btn" data-x title="Close">✕</button></div>' +
                '<div class="hg-new"><span>Start a table:</span><button type="button" class="btn" data-new="ttt"' + off + '>⭕ Tic-tac-toe</button>' +
                '<button type="button" class="btn" data-new="checkers"' + off + '>⛀ Checkers</button>' +
                '<span>✡ Chinese checkers for ' + [2, 3, 4, 6].map(n => '<button type="button" class="btn" data-new="chinese" data-n="' + n + '"' + off + '>' + n + '</button>').join('') + '</span></div>' +
                (tables.size ? '<ul class="hg-list">' + [...tables.values()].map(tb => {
                    const free = tb.state === 'waiting' && tb.seats.includes('') && !seated;
                    const state = tb.state === 'waiting' ? 'waiting for ' + tb.seats.filter(s => !s).length + ' more' : tb.state === 'playing' ? 'playing' : resultText(tb);
                    return '<li><div><b>' + GAME_NAMES[tb.g] + '</b> <span class="hg-dim">' + esc(state) + '</span></div><div class="hg-seats">' +
                        tb.seats.map((h, i) => '<span class="hg-p"><i style="background:' + seatColor(tb, i) + '"></i>' + (h ? esc(nameOf(h)) : '<em>empty seat</em>') + '</span>').join('') + '</div>' +
                        '<div class="hg-btns">' + (free ? '<button type="button" class="btn go" data-sit="' + tb.id + '">Sit down</button>' : '') +
                        '<button type="button" class="btn" data-open="' + tb.id + '">' + (seatOf(tb) >= 0 ? 'Open' : 'Watch') + '</button></div></li>';
                }).join('') + '</ul>' : '<p class="hg-dim">No tables yet. Start one and others can sit down; everyone else can watch.</p>');
        }
        function tableHtml(tb) {
            const seat = seatOf(tb), mine = myTurn(tb);
            let status;
            if (tb.state === 'waiting') status = 'Waiting for ' + tb.seats.filter(s => !s).length + ' more to sit down…';
            else if (tb.state === 'playing') status = (mine ? '<b>Your turn</b>' : esc(nameOf(tb.seats[tb.turn])) + '’s turn') + ' · <span class="hg-clock">' + clock(tb) + '</span>' +
                (mine && tb.g === 'checkers' && tb.board.must ? ' — keep jumping' : '');
            else status = '<b>' + esc(resultText(tb)) + '</b>';
            return '<div class="hg-head"><button type="button" class="btn" data-back>‹ Tables</button><b>' + GAME_NAMES[tb.g] + '</b>' +
                '<button type="button" class="btn" data-x title="Close">✕</button></div>' +
                '<div class="hg-seats">' + tb.seats.map((h, i) => '<span class="hg-p' + (tb.state === 'playing' && tb.turn === i ? ' turn' : '') + (tb.out.includes(i) ? ' out' : '') +
                    (tb.state === 'done' && tb.win === i ? ' won' : '') + '"><i style="background:' + seatColor(tb, i) + '"></i>' + (h ? esc(nameOf(h)) : '<em>empty seat</em>') + '</span>').join('') + '</div>' +
                '<p class="hg-status">' + status + '</p>' +
                (tb.board ? boardHtml(tb, seat, mine) : '') +
                '<div class="hg-btns">' +
                (tb.state === 'waiting' && seat < 0 && tb.seats.includes('') ? '<button type="button" class="btn go" data-sit="' + tb.id + '">Sit down</button>' : '') +
                (tb.g === 'chinese' && mine && hops.length > 1 ? '<button type="button" class="btn go" data-go>Move</button><button type="button" class="btn" data-undo>Undo</button>' : '') +
                (seat >= 0 && tb.state === 'done' ? againHtml(tb, seat) : '') +
                (seat >= 0 && tb.state !== 'done' && !tb.out.includes(seat) ? '<button type="button" class="btn" data-stand>' +
                    (tb.state === 'playing' ? (leaving === tb.id ? 'Leave and lose?' : 'Leave the game') : 'Get up') + '</button>' : '') + '</div>';
        }
        /** After a game: a rematch, once everyone at the table asks. */
        function againHtml(tb, seat) {
            const asked = tb.again || [], gone = tb.seats.filter(h => !people.has(h));
            if (gone.length) return '<span class="hg-dim">' + esc(gone.map(nameOf).join(', ')) + ' left — no rematch</span>';
            const want = asked.length ? ' <span class="hg-dim">(' + asked.length + ' of ' + tb.seats.length + ' want one)</span>' : '';
            return asked.includes(seat) ? '<button type="button" class="btn" disabled>Waiting for the others…</button>' + want
                : '<button type="button" class="btn go" data-again="' + tb.id + '">🔁 Rematch</button>' + want;
        }
        function boardHtml(tb, seat, mine) {
            const b = tb.board, last = tb.last && tb.last.m;
            if (tb.g === 'ttt') {
                return '<div class="hg-ttt">' + b.cells.map((c, i) => '<button type="button" data-i="' + i + '"' + (c >= 0 || !mine ? ' disabled' : '') +
                    (last && last.i === i ? ' class="last"' : '') + ' style="color:' + (c >= 0 ? seatColor(tb, c) : '') + '">' + (c === 0 ? '✕' : c === 1 ? '◯' : '') + '</button>').join('') + '</div>';
            }
            if (tb.g === 'checkers') {
                const flip = seat === 1, lastAt = (r, c) => last && ((last.from && last.from[0] === r && last.from[1] === c) || (last.to && last.to[0] === r && last.to[1] === c));
                let h = '<div class="hg-ck">';
                for (let vr = 0; vr < 8; vr++) for (let vc = 0; vc < 8; vc++) {
                    const r = flip ? 7 - vr : vr, c = flip ? 7 - vc : vc, ch = b.rows[r][c];
                    h += '<div class="' + ((r + c) % 2 ? 'd' : 'l') + (sel && sel[0] === r && sel[1] === c ? ' sel' : '') + (lastAt(r, c) ? ' last' : '') + '" data-rc="' + r + ',' + c + '">' +
                        (ch !== '.' ? '<i class="' + (ch.toLowerCase() === 'r' ? 'rd' : 'bk') + (ch === ch.toUpperCase() ? ' k' : '') + '"></i>' : '') + '</div>';
                }
                return h + '</div>';
            }
            // Chinese checkers: turned so your own point is at the bottom.
            const myPoint = seat >= 0 ? b.points[seat] : 2, rot = (2 - myPoint) * 60;
            const startOf = {}; b.points.forEach((p, i) => { startOf[p] = i; });
            let h = '<svg class="hg-cc" viewBox="-150 -150 300 300"><g transform="rotate(' + rot + ')">';
            for (const [q, r, pt] of STAR) {
                const k = q + ',' + r, s = b.cells[k], x = (q + r / 2) * 20, y = r * 17.32;
                const home = pt >= 0 && startOf[pt] !== undefined ? seatColor(tb, startOf[pt]) : '';
                h += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7.2" data-k="' + k + '" fill="' + (s !== undefined ? seatColor(tb, s) : '#1b1726') + '"' +
                    ' stroke="' + (hops.includes(k) ? '#ffffff' : home || '#3d3552') + '" stroke-width="' + (hops.includes(k) ? 3 : home ? 1.6 : 1) + '"' +
                    (last && last.path && last.path.some(p => p[0] === q && p[1] === r) ? ' class="last"' : '') + '/>';
            }
            return h + '</g></svg>';
        }
        const sendMove = (tb, m) => core.send({ t: 'hall-table-move', id: tb.id, m });
        gamesEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const tb = view && tables.get(view), t = e.target;
            const btn = t.closest('button');
            if (btn) {
                const d = btn.dataset;
                if ('x' in d) { gamesEl.hidden = true; return; }
                if ('back' in d) { view = ''; sel = null; hops = []; return paintGames(); }
                if (d.new) return core.send({ t: 'hall-table-new', g: d.new, n: Number(d.n) || 2 });
                if (d.sit) return core.send({ t: 'hall-table-sit', id: d.sit });
                if (d.again) return core.send({ t: 'hall-table-again', id: d.again });
                if (d.open) { view = d.open; sel = null; hops = []; return paintGames(); }
                if ('stand' in d && tb) {
                    if (tb.state === 'playing' && leaving !== tb.id) { leaving = tb.id; return paintGames(); }
                    leaving = ''; return core.send({ t: 'hall-table-stand', id: tb.id });
                }
                if ('go' in d && tb && hops.length > 1) { sendMove(tb, { path: hops.map(k => k.split(',').map(Number)) }); hops = []; return paintGames(); }
                if ('undo' in d) { hops = hops.slice(0, 1); return paintGames(); }
                if (d.i !== undefined && tb && myTurn(tb)) return sendMove(tb, { i: Number(d.i) });
                return;
            }
            if (!tb || !myTurn(tb)) return;
            const seat = seatOf(tb), b = tb.board;
            const cell = t.closest('[data-rc]');
            if (cell && tb.g === 'checkers') {
                const [r, c] = cell.dataset.rc.split(',').map(Number), ch = b.rows[r][c];
                const own = ch !== '.' && (ch.toLowerCase() === 'r') === (seat === 0);
                if (own && !b.must) { sel = [r, c]; return paintGames(); }
                if (sel && ch === '.') sendMove(tb, { from: sel, to: [r, c] });
                return;
            }
            const hole = t.closest('[data-k]');
            if (hole && tb.g === 'chinese') {
                const k = hole.dataset.k, [q, r] = k.split(',').map(Number);
                if (b.cells[k] === seat) { hops = [k]; return paintGames(); }
                if (!hops.length || b.cells[k] !== undefined) return;
                if (hops[hops.length - 1] === k) return;
                const [pq, pr] = hops[hops.length - 1].split(',').map(Number), dq = q - pq, dr = r - pr;
                if (hops.length === 1 && DIRS6.some(([a, c]) => a === dq && c === dr)) { sendMove(tb, { path: [[pq, pr], [q, r]] }); hops = []; return; }
                const dir = DIRS6.find(([a, c]) => 2 * a === dq && 2 * c === dr), mid = dir && (pq + dir[0]) + ',' + (pr + dir[1]);
                if (!dir || b.cells[mid] === undefined || mid === hops[0] || hops.includes(k)) return U.toast('Hop over one piece into a free hole (or step one hole).');
                hops.push(k);
                return paintGames();
            }
        });
        // Double-click the last hole of a chain to move without pressing Move.
        gamesEl.addEventListener('dblclick', (e) => {
            const tb = view && tables.get(view), hole = e.target.closest('[data-k]');
            if (tb && hole && hops.length > 1 && hops[hops.length - 1] === hole.dataset.k) { sendMove(tb, { path: hops.map(k => k.split(',').map(Number)) }); hops = []; }
        });
        const clockT = setInterval(() => {
            const tb = !gamesEl.hidden && view && tables.get(view), el = tb && tb.state === 'playing' && gamesEl.querySelector('.hg-clock');
            if (el) el.textContent = clock(tb);
        }, 1000);
        offs.push(() => clearInterval(clockT));
        /** Who's at a table and what they're doing there, from the person menu. */
        const tableOf = (h) => [...tables.values()].find(tb => tb.state !== 'done' && tb.seats.includes(h));
        /** Over the heads of people playing: a little 🎲. */
        const GAME_ICONS = { ttt: '⭕', checkers: '⛀', chinese: '✡' };
        function tableBadges(u, heads, t) {
            for (const tb of tables.values()) {
                // Waiting for players: a gold sign over whoever's sat down, bobbing, so the room knows to come and join.
                if (tb.state === 'waiting') {
                    const sat = tb.seats.filter(Boolean).length, lift = Math.round(Math.abs(Math.sin(t * 3)) * 2);
                    tb.seats.forEach((h) => {
                        const p = h && people.get(h);
                        if (p && heads.has(h)) badge(GAME_ICONS[tb.g] + ' JOIN ' + sat + '/' + tb.seats.length, (p.x + 8) * u, (heads.get(h) - 2 - lift) * u, u, true);
                    });
                    continue;
                }
                if (tb.state !== 'playing') continue;
                tb.seats.forEach((h, i) => {
                    const p = people.get(h);
                    if (p && heads.has(h) && !tb.out.includes(i) && ![...games.values()].some(g => g.a === h || g.b === h)) badge(tb.turn === i ? '🎲…' : '🎲', (p.x + 8) * u, (heads.get(h) - 2) * u, u, false);
                });
            }
        }
        const typing = () => document.activeElement && /input|textarea/i.test(document.activeElement.tagName);
        listen('keydown', (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (typing()) { if (e.key === 'Escape') input.blur(); return; }
            if (!lookEl.hidden && e.key === 'Escape') { lookEl.hidden = true; return; }
            if (!emojiEl.hidden && e.key === 'Escape') { emojiEl.hidden = true; return; }
            if (!gamesEl.hidden && e.key === 'Escape') { gamesEl.hidden = true; return; }
            if (editingKeys && waitKey) { actionKey(e); return; }
            if (e.key === 'Enter') { input.focus(); e.preventDefault(); return; }
            const k = e.key.toLowerCase();
            if (k === 'j' && bombMine()) { if (!e.repeat) passBomb(); e.preventDefault(); return; }       // hot potato: J passes it
            if (keymap.dash && keyNorm(e.key) === keymap.dash) { sprintKey = true; if (e.repeat) return; }
            if (actionKey(e)) return;
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); }
        });
        listen('keyup', (e) => { keys.delete(e.key.toLowerCase()); if (keymap.dash && keyNorm(e.key) === keymap.dash) sprintKey = false; });
        listen('blur', () => { keys.clear(); sprintKey = false; });

        /* ---------- actions: in a panel beside the room (between it and the chat) or along the bottom,
           with keys you choose (⌨, then click one and press a key) ---------- */
        const ACTIONS = [
            ...EMOTES.map(([id, icon, name]) => ({ id: 'e:' + id, icon, name, run: () => emote(id) })),
            { id: 'jump', icon: '⏫', name: 'Jump', run: () => act('jump') },
            { id: 'dash', icon: '💨', name: 'Dash (hold to sprint)', run: () => act('dash') },
            ...HITS.map(([k, icon, name]) => ({ id: 'duel:' + k, icon, name: name + ' your opponent', duel: true, run: () => duelHit(k) })),
            ...BURSTS.map(([k, icon, name]) => ({ id: 'burst:' + k, icon, name, run: () => burst(k) })),
            { id: 'emoji', icon: '😀', name: 'Emoji, things to hold, feelings and glowsticks', run: () => toggleEmoji() },
            { id: 'boards', icon: '🎲', name: 'Board games', run: () => toggleGames() },
            { id: 'chat', icon: '💬', name: 'Show or hide the chat', run: () => toggleChat() },
            { id: 'look', icon: '🎨', name: 'Change how you look', run: () => openLook() }
        ];
        const KEYS0 = Object.fromEntries([...EMOTES.map(([id], i) => ['e:' + id, String((i + 1) % 10)]), ['jump', ' '], ['dash', 'Shift'], ['duel:bonk', 'j'], ['duel:slap', 'k'], ['duel:snowball', 'l']]);
        const RESERVED = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter', 'escape', 'tab'];
        let keymap = null;
        try { keymap = JSON.parse(localStorage.getItem('ltl.hallKeys') || 'null'); } catch { /* the usual */ }
        if (!keymap || typeof keymap !== 'object') keymap = { ...KEYS0 };
        // Keys chosen before there were duels: give the duel ones theirs, where the key's free.
        if (!Object.keys(keymap).some(id => id.startsWith('duel:'))) for (const id of ['duel:bonk', 'duel:slap', 'duel:snowball']) if (!Object.values(keymap).includes(KEYS0[id])) keymap[id] = KEYS0[id];
        const keyNorm = (k) => (k.length === 1 ? k.toLowerCase() : k);
        const keyName = (k) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
        const keyShort = (k) => (k === ' ' ? '␣' : k === 'Shift' ? '⇧' : k.length === 1 ? k.toUpperCase() : k.replace(/^Arrow/, '').slice(0, 3));
        const saveKeys = () => { try { localStorage.setItem('ltl.hallKeys', JSON.stringify(keymap)); } catch { /* full */ } };
        let editingKeys = false, waitKey = '';
        // Where the actions go: 'side' (beside the room, when there's room for it) or 'bottom'. Remembered.
        let actsMode = 'side';
        try { actsMode = localStorage.getItem('ltl.hallActs') || 'side'; } catch { /* default */ }
        const actsEl = $('.hall-acts', box);
        function paintActs() {
            const fighting = !!duelOf(me);
            actsEl.innerHTML = ACTIONS.filter(a => !a.duel || (fighting && !touch)).map(a => {         // on a phone they're the big buttons
                const k = keymap[a.id];
                return '<button type="button" class="btn" data-act="' + a.id + '" title="' + esc(a.name) + (k ? ' (' + esc(keyName(k)) + ')' : '') + '">' + a.icon +
                    (k || editingKeys ? '<kbd>' + (waitKey === a.id ? '…' : k ? esc(keyShort(k)) : '+') + '</kbd>' : '') + '</button>';
            }).join('') +
                '<button type="button" class="btn ha-tool' + (editingKeys ? ' on' : '') + '" data-keys title="Choose your keys: press this, click an action, then press a key">⌨</button>' +
                '<button type="button" class="btn ha-tool" data-place title="' + (actsMode === 'side' ? 'Put these along the bottom' : 'Put these beside the room') + '">' + (actsMode === 'side' ? '⬇' : '⇥') + '</button>' +
                (editingKeys ? '<div class="ha-help">' + (waitKey ? 'Press a key for it (Esc: none)' : 'Click an action, then press a key.') +
                    ' <button type="button" class="btn" data-keyreset>Usual keys</button></div>' : '');
            actsEl.classList.toggle('editing', editingKeys);
            paintPoses(); paintBursts(); paintCool();
        }
        // The dash button held down sprints too (a phone has no Shift).
        actsEl.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-act="dash"]')) sprintKey = true; });
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) actsEl.addEventListener(ev, () => { sprintKey = false; });
        actsEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const b = e.target.closest('button');
            if (!b) return;
            if ('keys' in b.dataset) { editingKeys = !editingKeys; waitKey = ''; return paintActs(); }
            if ('keyreset' in b.dataset) { keymap = { ...KEYS0 }; saveKeys(); waitKey = ''; return paintActs(); }
            if ('place' in b.dataset) {
                actsMode = actsMode === 'side' ? 'bottom' : 'side';
                try { localStorage.setItem('ltl.hallActs', actsMode); } catch { /* full */ }
                layoutChat(); return paintActs();
            }
            const a = ACTIONS.find(x => x.id === b.dataset.act);
            if (!a) return;
            if (editingKeys) { waitKey = waitKey === a.id ? '' : a.id; return paintActs(); }
            a.run();
        });
        /** A key for the action waiting for one (editing), or the action a key is for. True if it was used. */
        function actionKey(e) {
            const k = keyNorm(e.key);
            if (editingKeys && waitKey) {
                e.preventDefault();
                if (k === 'Escape') delete keymap[waitKey];
                else if (!RESERVED.includes(k.toLowerCase())) {
                    for (const id of Object.keys(keymap)) if (keymap[id] === k) delete keymap[id];     // one action a key
                    keymap[waitKey] = k;
                } else { U.toast('That key walks or talks — pick another.'); return true; }
                saveKeys(); waitKey = ''; paintActs();
                return true;
            }
            const id = Object.keys(keymap).find(x => keymap[x] === k);
            const a = id && ACTIONS.find(x => x.id === id);
            if (!a) return false;
            if (k === ' ') e.preventDefault();
            a.run();
            return true;
        }
        function toggleEmoji() { emojiEl.hidden = !emojiEl.hidden; if (!emojiEl.hidden) paintEmoji(); }
        function toggleGames() {
            gamesEl.hidden = !gamesEl.hidden;
            if (!gamesEl.hidden) { const t = [...tables.values()].find(tb => tb.state !== 'done' && seatOf(tb) >= 0); view = t ? t.id : ''; paintGames(); }
        }
        function toggleChat() {
            chatOn = !chatOn; logBox.hidden = !chatOn; layoutChat();
            if (chatOn) logEl.scrollTop = logEl.scrollHeight;
            try { localStorage.setItem('ltl.hallChat', chatOn ? '1' : '0'); } catch { /* full */ }
        }
        paintActs();

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
                // Face buttons: dance, jump, wave, cheer; right bumper dashes (on press, not while held).
                [[0, 'dance'], [2, 'wave'], [3, 'cheer']].forEach(([i, id]) => { if (b(i) && !padWas[i]) emote(id); padWas[i] = b(i); });
                if (b(1) && !padWas[1]) act('jump'); padWas[1] = b(1);
                if (b(5) && !padWas[5]) act('dash'); padWas[5] = b(5);
            }
            const len = Math.hypot(dx, dy);
            return len > 0.1 ? [dx / Math.max(1, len), dy / Math.max(1, len)] : null;
        }

        function step(dt) {
            const t = now(), p = mine();
            if (p) {
                const push = pushing();
                // Sprinting starts or stops: the room's told (a walk to a clicked spot carries on, faster or slower).
                if (breathe(dt, !!push || p.walking) && !push && p.walking && !held(me, t)) { lastSent = ''; sendGo(p.tx, p.ty); }
                if (push && held(me, t)) { if (p.pushed) { p.pushed = false; sendGo(p.x, p.y); } }
                else if (push) {
                    pendingHit = null;
                    lookAway();
                    const sp = SPEED * (p.dashUntil > t ? DASH_SPEED : running ? SPRINT.mult : 1) * (charging ? 0.5 : 1) * slowOf(me, t);       // winding up a throw (or snowed on): slower
                    p.x = clampX(p.x + push[0] * sp * dt);
                    p.y = clampY(p.y + push[1] * sp * 0.7 * dt);
                    p.tx = p.x; p.ty = p.y; p.walking = true;
                    if (Math.abs(push[0]) > 0.2) p.face = push[0] < 0 ? -1 : 1;
                    // Tell the room where you'll be a moment from now, a few times a second.
                    // In a duel or dodgeball, more often and less far ahead (engine/hall.js sends these on at once).
                    const game = !!duelOf(me) || (dbOn() && db.state !== 'over' && dbTeam(me) >= 0);
                    const ahead = SPEED * (running ? SPRINT.mult : 1);
                    if (t - sentAt > (game ? 0.09 : 0.22)) sendGo(clampX(p.x + push[0] * ahead * (game ? 0.15 : 0.3)), clampY(p.y + push[1] * ahead * (game ? 0.1 : 0.2)));
                    p.pushed = true;
                } else if (p.pushed) { p.pushed = false; sendGo(p.x, p.y); }
            }
            for (const q of people.values()) {
                if (q.knock) {
                    const k = Math.max(0, Math.min(1, (t - q.knock.at) / (q.knock.dur || 0.25))), e = q.knock.arc ? k : 1 - (1 - k) * (1 - k);
                    q.x = q.knock.x0 + (q.knock.x1 - q.knock.x0) * e; q.y = q.knock.y0 + (q.knock.y1 - q.knock.y0) * e;
                    q.lift = q.knock.arc ? Math.sin(k * Math.PI) * q.knock.arc : 0;          // up in the air on the way
                    if (k >= 1) { q.knock = null; q.lift = 0; }
                    continue;
                }
                if (q.pushed) continue;
                const dx = q.tx - q.x, dy = q.ty - q.y, d = Math.hypot(dx, dy);
                const keepUp = q.h === me ? 1 : catchUp(q, t, d);
                q.walking = d > 0.6;
                if (q.walking) {
                    if (held(q.h, t)) { q.walking = false; continue; }
                    const fast = q.h === me ? running : q.run;
                    const s = Math.min(d, SPEED * keepUp * (q.dashUntil > t ? DASH_SPEED : fast ? SPRINT.mult : 1) * (q.h === me && charging ? 0.5 : 1) * slowOf(q.h, t) * dt);
                    q.x += dx / d * s; q.y += dy / d * s;
                    if (Math.abs(dx) > 0.5) q.face = dx < 0 ? -1 : 1;
                }
                if (ONE_SHOT[q.e] && t - q.et > ONE_SHOT[q.e]) q.e = '';
            }
            hitWhenClose();
        }

        /** How much faster to walk someone who's drawn behind where they really are (1: not behind). */
        function catchUp(q, t, d) {
            const r = q.real;
            if (!r) return 1;
            // Where they'd be by now: from where the station had them, on towards where they're going.
            const v = SPEED * (q.run ? SPRINT.mult : 1) * (t - r.at), ex = q.tx - r.x, ey = q.ty - r.y, en = Math.hypot(ex, ey);
            const left = Math.max(0, en - v);                       // how far they've still to go, really
            const behind = d - left;
            if (behind <= 3) { if (left <= 0) q.real = null; return 1; }
            return 1 + Math.min(2.5, behind / 12);
        }
        /** Your breath for sprinting, under your name: only while it's not full. */
        function sprintBar(u) {
            const p = mine();
            if (!p || isEaten(me) || (stam >= SPRINT.maxS && !running)) return;
            const w = Math.round(14 * u), h = Math.max(2 * dpr, Math.round(u * 0.9)), x = Math.round(p.x * u - w / 2), y = Math.round((p.y + 1.5) * u + Math.max(10, 2.6 * u / dpr) * dpr * 1.25 + 3 * dpr);
            const k = stam / SPRINT.maxS;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - dpr, y - dpr, w + 2 * dpr, h + 2 * dpr);
            ctx.fillStyle = tired ? '#ff5a5a' : k > 0.5 ? '#5ee8a0' : k > 0.25 ? '#ffd34a' : '#ff9a3c';
            ctx.fillRect(x, y, Math.round(w * k), h);
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
        // The stage changes size (the window, a phone turned round, the bar wrapping): place the chat again, then the room.
        let laying = false;
        const hallEl = $('.hall', box);
        const ro = new ResizeObserver(() => {
            hallEl.style.setProperty('--bar-h', bar.offsetHeight + 'px');            // the emoji picker sits just above the bar, one row or two
            if (laying) return; laying = true; layoutChat(); fit(); laying = false;
        });
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
        // The station's picture emotes in bubbles: a row of up to three pictures over the words.
        const emoteImgs = {};
        function emotePic(k) {
            const src = window.LT && LT.EMOTES && LT.EMOTES[k];
            if (!src) return null;
            let im = emoteImgs[k];
            if (!im || im.src !== src) { im = emoteImgs[k] = new Image(); im.src = src; }
            return im;
        }
        function bubble(text, x, y, u) {
            const fs = Math.max(11, Math.round(3.3 * u / dpr)) * dpr;
            ctx.font = 'bold ' + fs + 'px "Courier New", monospace';
            const pics = [];
            text = String(text).replace(/:([a-z0-9_]{2,30}):/gi, (m, k) => { const im = emotePic(k.toLowerCase()); if (!im) return m; if (pics.length < 3) pics.push(im); return ' '; }).trim();
            const ph = pics.length ? fs * 2.2 : 0;
            const lines = text ? wrap(text, 70 * u, 3) : [], lh = fs * 1.15, pad = Math.round(fs * 0.45);
            const w = Math.max(pics.length * ph * 1.15, ...lines.map(s => ctx.measureText(s).width)) + pad * 2, h = lines.length * lh + ph + pad * 1.4;
            let bx = Math.round(x - w / 2), by = Math.round(y - h - 3 * u);
            bx = Math.max(2, Math.min(cv.width - w - 2, bx)); by = Math.max(2, by);
            const s = Math.max(1, Math.round(u / 2));
            ctx.fillStyle = '#000'; ctx.fillRect(bx - s, by - s, w + 2 * s, h + 2 * s);
            ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, w, h);
            const tx = Math.max(bx + s * 2, Math.min(bx + w - s * 4, Math.round(x - s)));
            ctx.fillRect(tx, by + h, s * 2, s * 2); ctx.fillStyle = '#000'; ctx.fillRect(tx - s, by + h, s, s * 2); ctx.fillRect(tx + s * 2, by + h, s, s * 2); ctx.fillRect(tx, by + h + s * 2, s * 2, s);
            pics.forEach((im, i) => {
                if (!im.complete || !im.naturalWidth) return;
                const pw = Math.min(ph * 1.5, ph * im.naturalWidth / im.naturalHeight), cx = bx + w / 2 + (i - (pics.length - 1) / 2) * ph * 1.15;
                ctx.drawImage(im, Math.round(cx - pw / 2), Math.round(by + pad * 0.7), Math.round(pw), Math.round(ph));
            });
            ctx.fillStyle = '#141018'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            lines.forEach((ln, i) => ctx.fillText(ln, bx + w / 2, by + pad * 0.8 + ph + i * lh));
        }

        /* FunpostTV on the stage screen, when the studio chose it and the stream is on.
           Sound off: everyone keeps listening to the radio. Clicks go through to the floor. */
        let tvVid = '', screenLive = false;
        function screenTv(on, vid) {
            const want = on && vid ? vid : '';
            if (want !== tvVid) {
                tvVid = want;
                tvEl.innerHTML = want ? '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(want) +
                    '?autoplay=1&mute=1&controls=0&rel=0&playsinline=1&modestbranding=1" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" tabindex="-1" title="FunpostTV"></iframe>' : '';
                tvEl.hidden = !want;
            }
            if (!want) return false;
            const r = cv.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = r.width / A.W, S = A.screenAt(screenLive, tvK);
            const css = 'left:' + (r.left - sr.left + S.x * k) + 'px;top:' + (r.top - sr.top + S.y * k) + 'px;width:' + (S.w * k) + 'px;height:' + (S.h * k) + 'px';
            if (tvEl.style.cssText !== css) tvEl.style.cssText = css;
            return true;
        }

        let last = 0;
        function frame(ms) {
            if (stopped) return;
            requestAnimationFrame(frame);
            if (document.hidden || ms - last < 1000 / FPS - 2) return;
            const dt = Math.min(0.1, (ms - (last || ms)) / 1000) * clockRate;
            last = ms;
            step(dt);
            const t = now(), s = core.state, tr = s.track;
            // In the room, the station says; outside it, the radio's own idea of what's on.
            const onAir = joined ? air : { live: s.live, talking: false, music: !!tr };
            screenLive = !!onAir.live;
            // Counting down to live (and a moment after zero, until the station says it's live).
            const left = introEnd ? introEnd - t : null;
            const intro = joined && left != null && (left > -4 && !onAir.live || onAir.live && left > -1.5) ? left : null;
            if (left != null && left < -10) introEnd = 0;
            const tvOn = !!(joined && air.screen === 'tv' && s.tv && s.tv.live && !(intro != null && intro <= A.ENTRANCE + 0.2));
            // Just gone live: Radioman sits for a moment before FunpostTV (if it's on) sends him aside.
            if (onAir.live && !wasLive) { tvK = 0; tvHold = t + 1.5; }
            wasLive = !!onAir.live;
            if (!onAir.live) tvK = tvOn ? 1 : 0;
            else if (t >= tvHold) tvK += Math.sign((tvOn ? 1 : 0) - tvK) * Math.min(Math.abs((tvOn ? 1 : 0) - tvK), dt / 1.4);
            const tv = screenTv(tvOn, s.tv && s.tv.videoId);
            const sign = s.banner && s.banner.on ? { items: s.banner.items || [], color: s.banner.color } : null;
            const info = { station: s.name, song: tr ? [tr.artist, tr.title].filter(Boolean).join(' - ') : '', tv, sign, tvK };
            A.room(lc, t, onAir, info);
            // Radioman at his desk while live (his mouth going while his chat line is up); a big radio (or FunpostTV) off air.
            const hostTalking = !!(hostSay && hostSay.until > t);
            if (intro != null && !onAir.live) A.entrance(lc, t, intro, introSecs, onAir, info);
            else A.centre(lc, t, hostTalking ? { ...onAir, talking: true } : onAir, info);
            for (let i = bursts.length - 1; i >= 0; i--) {
                const b = bursts[i];
                if (b.at == null) { if (t - b.got > 10) bursts.splice(i, 1); else b.at = t; }    // a long while out of sight: skip it
            }
            while (bursts.length && t - bursts[0].at > 8) bursts.shift();
            const fx = joined && air.fx ? { ...air.fx, bursts } : null;
            A.fxBack(lc, t, onAir, fx);
            if (dbOn()) court();
            const sorted = [...people.values()].filter(p => !isEaten(p.h)).sort((a, b) => a.y - b.y);
            const heads = new Map(), fight = duelOf(me);
            btStep(dt);
            if (btOn() && btStart) A.wallBurst(lc, t - btStart, 5);
            if (btOn()) smashMark(t);
            for (let i = swaves.length - 1; i >= 0; i--) { const s = t - swaves[i].at; if (s > 1.4) swaves.splice(i, 1); else A.shockwave(lc, swaves[i].x, swaves[i].y, s); }
            let danielTop = null, danielDrawn = !btD;
            for (const p of sorted) {
                if (!danielDrawn && btD.y < p.y) { danielTop = drawDaniel(t); danielDrawn = true; }
                if (isBurger(p.h)) {
                    // Zapped: a burger on legs (with a gold star if it made it).
                    heads.set(p.h, A.burger(lc, p.x, p.y - (p.lift || 0), t, { walking: p.walking, face: p.face, star: bt.state === 'burp' && bt.stars.includes(p.h) }).y);
                    continue;
                }
                const [ox, oy] = hits.length ? hitOffset(p, t) : [0, 0];
                const po = { x: p.x + ox, y: p.y + oy - (p.lift || 0), face: p.face, step: p.walking ? Math.floor(t * 8) % 2 : undefined, emote: p.e, et: t - p.et, t, talk: p.sayUntil > t,
                    mood: p.f, jumpT: p.jumpAt ? t - p.jumpAt : null, dash: p.dashUntil > t };
                const au = auraOf(p.a);
                if (au) {
                    // Ultra's afterimages: where you've just been, for a moment.
                    if (au[1] === 'ultra') {
                        p.atrail = p.atrail || [];
                        const last = p.atrail[p.atrail.length - 1];
                        if (!last || Math.hypot(last[0] - po.x, last[1] - po.y) > 2.5) p.atrail.push([po.x, po.y, t]);
                        while (p.atrail.length && t - p.atrail[0][2] > 0.35) p.atrail.shift();
                    }
                    A.aura(lc, au[1], au[2], po.x, po.y, t, false, p.l, po, p.atrail);
                }
                // In a game: a ring in your team's colour at your feet; out, you're faded.
                const team = dbOn() ? dbTeam(p.h) : -1, out = team >= 0 && dbOut(p.h);
                if (team >= 0) { lc.fillStyle = out ? '#77708a' : DB_TEAMS[team][1]; lc.globalAlpha = 0.8; lc.beginPath(); lc.ellipse(po.x, po.y, 6, 2, 0, 0, Math.PI * 2); lc.fill(); lc.globalAlpha = 1; }
                if (out) lc.globalAlpha = 0.45;
                else if (fight && p.h !== fight.a && p.h !== fight.b) lc.globalAlpha = 0.22;     // in a duel: only the two of you
                heads.set(p.h, A.person(lc, p.l, po));
                lc.globalAlpha = 1;
                if (au) A.aura(lc, au[1], au[2], po.x, po.y, t, true, p.l, po);
                if (p.star > performance.now()) A.star(lc, po.x, heads.get(p.h) - 4, t);           // survived Burgertime
                const back = btBack.get(p.h);
                if (back && t - back < 1) A.sparkle(lc, po.x, po.y, t - back); else if (back) btBack.delete(p.h);
            }
            if (!danielDrawn) danielTop = drawDaniel(t);
            for (let i = booms.length - 1; i >= 0; i--) { const s = t - booms[i].at; if (s > 2.2) booms.splice(i, 1); else A.explosion(lc, booms[i].x, booms[i].y, s); }
            if (bt.state === 'burp' && t - btBurp > 2.2 && t - btBurp < 9) A.rubble(lc, t - btBurp - 2.2, 7);
            A.lights(lc, t, onAir, fx);
            if (intro != null) A.introOver(lc, t, intro, introSecs);
            // Off air, Radioman still talks to everyone: from a little frame in the corner, sliding in and out.
            let cameoAt = null;
            const boothOn = speakerBoxes(dt, t, onAir);
            if (hostTalking && !onAir.live && !boothOn) cameoAt = A.cameo(lc, t, true, Math.min(1, (t - hostSay.at) / 0.25, (hostSay.until - t) / 0.25), air.tag);
            ctx.imageSmoothingEnabled = false;
            const quake = hits.some(x => x.n === 3 && t - x.at > 0.12 && t - x.at < 0.45) || (bt.state === 'burp' && t - btBurp > 2.6 && t - btBurp < 3.6) || (bt.state === 'enter' && t - btStart < 0.7)
                || booms.some(b => t - b.at < 0.5) || swaves.some(w => t - w.at < 0.3) ? cv.width / A.W * 2 : 0;
            ctx.drawImage(low, Math.round((Math.random() - 0.5) * quake), Math.round((Math.random() - 0.5) * quake), cv.width, cv.height);
            if (quake) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.25; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
            // Names under feet, bubbles over heads, at screen resolution.
            const u = cv.width / A.W, nfs = Math.max(10, Math.round(2.6 * u / dpr)) * dpr;
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            for (const p of sorted) {
                ctx.font = 'bold ' + nfs + 'px "Courier New", monospace';
                ctx.globalAlpha = fight && p.h !== fight.a && p.h !== fight.b ? 0.3 : 1;
                const nx = p.x * u, ny = (p.y + 1.5) * u;
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(p.n, nx + dpr, ny + dpr);
                ctx.fillStyle = p.c || (p.h === me ? '#ffd34a' : '#e6e0f2'); ctx.fillText(p.n, nx, ny);
                if (p.h === me) ctx.fillRect(Math.round(nx - ctx.measureText(p.n).width / 2), Math.round(ny + nfs + dpr), Math.round(ctx.measureText(p.n).width), Math.max(1, dpr));   // underlined: that's you
            }
            ctx.globalAlpha = 1;
            sprintBar(u);
            drawGlows(sorted, heads, u, t);
            drawHeld(sorted, heads, u);
            if (duels.size) drawDuels(t, u, heads);
            if (db.state) drawBall(t, u, heads);
            drawMoods(sorted, heads, u, t);
            drawHits(t, u, heads);
            for (const p of sorted) if (p.sayUntil > t) bubble(p.say, p.x * u, heads.get(p.h) * u, u);
            drawBtWords(t, u, danielTop);
            for (const b of booms) if (t - b.at < 1) popWord('BOOM!', b.x * u, (b.y - 26 - (t - b.at) * 8) * u, u * 1.6, '#ff9020');
            gameBadges(t, u, heads);
            tableBadges(u, heads, t);
            if (hostTalking && onAir.live) bubble(hostSay.text, (A.RADIOMAN_MOUTH.x + A.deskX(tvK) + 16) * u, (A.RADIOMAN_MOUTH.y - 6) * u, u);
            if (cameoAt && t - hostSay.at > 0.2) bubble(hostSay.text, (cameoAt.x + 4) * u, cameoAt.y * u, u);
        }

        /**
         * The speaker boxes: on a call, Radioman bottom-left and each caller bottom-right; during
         * a voicemail on air, just the caller's. They slide in, and slide out when it's over.
         * Returns whether any is showing.
         */
        function speakerBoxes(dt, t, onAir) {
            const want = new Map();
            if (joined && onAir.live) {
                if (booth.calls.length) want.set('host', { side: -1, slot: 0, name: air.tag == null ? 'LRM' : air.tag, who: { rm: true }, talk: booth.host, strip: '#d0302a' });
                booth.calls.forEach((c, i) => want.set('call:' + c.k, { side: 1, slot: i, name: c.n, who: c.l ? { look: c.l } : {}, talk: c.talk, strip: '#2f8f48' }));
                if (booth.vm) want.set('vm', { side: 1, slot: booth.calls.length, name: booth.vm.n, who: booth.vm.l ? { look: booth.vm.l } : {}, talk: booth.vm.talk, strip: '#6448b0' });
            }
            for (const [key, w] of want) { const b = boxes.get(key); if (b) Object.assign(b, w, { want: 1 }); else boxes.set(key, { ...w, k: 0, want: 1 }); }
            for (const [key, b] of boxes) if (!want.has(key)) b.want = 0;
            let any = false;
            for (const [key, b] of boxes) {
                b.k += Math.sign(b.want - b.k) * Math.min(Math.abs(b.want - b.k), dt / 0.35);
                if (b.k <= 0 && !b.want) { boxes.delete(key); continue; }
                const e = b.k * b.k * (3 - 2 * b.k);                    // eased
                A.speakerBox(lc, t, b.side, b.slot, e, !!b.talk && b.want > 0, b.name, b.who, b.strip);
                any = true;
            }
            return any;
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
            const sec = (name) => '<div class="hl-sec"><span>' + name + '</span></div>';
            const off = (attr, title) => '<button type="button" class="hl-sw hl-none" ' + attr + '="" title="' + title + '">✕</button>';
            lookEl.innerHTML = '<div class="hl-card"><canvas class="hl-prev" width="40" height="44"></canvas><div class="hl-parts">' +
                sec('Look') +
                A.PARTS.map(p => '<div class="hl-row"><span>' + p.label + '</span><div>' +
                    (p.colors ? p.colors.map((c, i) => '<button type="button" class="hl-sw" data-k="' + p.key + '" data-v="' + i + '" style="background:' + c + '" title="' + p.label + ' ' + (i + 1) + '"></button>').join('')
                        : p.names.map((n, i) => p.key === 'extra' && i === A.SECRET_BURGER && !burgerLook ? ''
                            : !unlocked(p.key, i) ? lockedBtn(rewardFor(p.key, i), n)
                            : '<button type="button" class="btn hl-nm" data-k="' + p.key + '" data-v="' + i + '">' + (p.key === 'extra' && i === A.SECRET_BURGER ? '🍔 ' : '') + n + '</button>').join('')) +
                    '</div></div>').join('') +
                sec('Glow') +
                '<div class="hl-row"><span>Glowstick</span><div>' + off('data-stick', 'No glowstick') + GLOWS.map(([id, c]) =>
                    '<button type="button" class="hl-sw" data-stick="' + id + '" title="' + id + '" style="background:' + (c || RAINBOW_BG) + '"></button>').join('') + '</div></div>' +
                '<div class="hl-row"><span>Aura</span><div class="hl-auras">' + off('data-aura', 'No aura') + AURAS.map(([id, icon, name]) =>
                    !unlocked('aura', id)
                        ? (r => '<button type="button" class="btn hl-aura hl-locked" disabled title="' + esc(name) + ': ' + HOW[r[0]] + '">🔒<small>' + pointsOf(r[0]) + '/' + r[1] + ' ' + POINTS[r[0]][1] + '</small></button>')(rewardFor('aura', id))
                        : '<button type="button" class="btn hl-aura" data-aura="' + id + '" title="' + name + '">' + icon + '<small>' + name + '</small></button>').join('') + '</div></div>' +
                '<div class="hl-row"><span>Aura colour</span><div>' + Object.entries(A.AURA_COLORS).concat([['rainbow', RAINBOW_BG]]).map(([id, c]) =>
                    '<button type="button" class="hl-sw" data-auracolor="' + id + '" title="' + id + '" style="background:' + c + '"></button>').join('') +
                    '<small class="hl-note">for Glow, Super, Charge and Halo rings</small></div></div>' +
                sec('Points') +
                ['nice', 'ebil'].map(k => {
                    const n = pointsOf(k), next = REWARDS.find(r => r[0] === k && r[1] > n);
                    return '<div class="hl-row"><span>' + POINTS[k][0] + ' ' + (k === 'nice' ? 'Nice' : 'Ebil') + '</span><div class="hl-pts"><b>' + n + '</b> ' +
                        (next ? '<small>next: ' + esc(next[4]) + ' at ' + next[1] + '</small>' : '<small>everything unlocked!</small>') + '<small class="hl-how">' + HOW[k] + '</small></div></div>';
                }).join('') +
                sec('You') +
                '<div class="hl-row"><span>Name</span><form class="hl-name"><input name="n" maxlength="32" value="' + esc(core.name || '') + '" placeholder="Your name">' +
                    '<button class="btn">Save</button></form></div>' +
                '<div class="hl-row"><span>Name colour</span><div>' + ['', ...NAME_COLORS].map(c =>
                    '<button type="button" class="hl-sw hl-nc" data-nc="' + c + '" title="' + (c || 'The usual') + '" style="background:' + (c || '#2a2438') + '">' + (c ? '' : '✕') + '</button>').join('') + '</div></div>' +
                sec('Options') +
                '<div class="hl-row"><span>This panel</span><label class="hl-auto"><input type="checkbox" data-lookauto' + (lookAuto ? ' checked' : '') + '> Close it when I click the room or walk</label></div>' +
                '<div class="hl-row"><span>Fun</span><label class="hl-safe"><input type="checkbox" data-safe' + (safe ? '' : ' checked') + '> Bonks, fish slaps and snowballs ' +
                    '<small>(off: nobody can hit you, and you can’t hit anyone)</small></label></div>' +
                '</div><div class="hl-foot"><button type="button" class="btn" data-rand>🎲 Surprise me</button><button type="button" class="btn btn-primary" data-done>Done</button></div></div>';
            paintLook();
        }
        const HOW = { nice: 'give people what you’re holding (click them → 🎁 Give)', ebil: 'pass a lit 💣 on (hand someone a bomb to start hot potato)' };
        function lockedBtn(r, name) {
            return '<button type="button" class="btn hl-nm hl-locked" disabled title="' + esc(name) + ': ' + HOW[r[0]] + '">🔒 ' + esc(name) + ' <small>' + pointsOf(r[0]) + '/' + r[1] + ' ' + POINTS[r[0]][1] + '</small></button>';
        }
        function paintLook() {
            for (const b of lookEl.querySelectorAll('[data-k]')) b.classList.toggle('on', look[b.dataset.k] === +b.dataset.v);
            for (const b of lookEl.querySelectorAll('[data-nc]')) b.classList.toggle('on', (core.color || '') === b.dataset.nc);
            for (const b of lookEl.querySelectorAll('[data-stick]')) b.classList.toggle('on', glow === b.dataset.stick);
            for (const b of lookEl.querySelectorAll('[data-aura]')) b.classList.toggle('on', aura.split(':')[0] === b.dataset.aura);
            for (const b of lookEl.querySelectorAll('[data-auracolor]')) b.classList.toggle('on', auraColor === b.dataset.auracolor);
            const pc = $('.hl-prev', lookEl);
            if (!pc) return;
            // You, with your aura on (the glowstick shows in the room).
            const g = pc.getContext('2d'), t = now(), o = { x: 20, y: 40, face: 1, t, emote: 'wave', et: 0 }, au = aura.split(':');
            g.clearRect(0, 0, 40, 44);
            if (aura) A.aura(g, au[0], au[1], 20, 40, t, false, look, o, []);
            A.person(g, look, o);
            if (aura) A.aura(g, au[0], au[1], 20, 40, t, true, look, o);
        }
        lookEl.addEventListener('change', (e) => {
            if (e.target.matches('[data-lookauto]')) { lookAuto = e.target.checked; try { localStorage.setItem('ltl.hallLookAuto', lookAuto ? '1' : '0'); } catch { /* full */ } return; }
            if (!e.target.matches('[data-safe]')) return;
            safe = !e.target.checked;
            try { localStorage.setItem('ltl.hallSafe', safe ? '1' : '0'); } catch { /* full */ }
            const p = mine(); if (p) p.s = safe;
            core.send({ t: 'hall-safe', on: safe });
        });
        lookEl.addEventListener('click', (e) => {
            if (e.target.closest('.hl-safe, .hl-auto')) return;
            const st = e.target.closest('[data-stick]'), au = e.target.closest('[data-aura]'), ac = e.target.closest('[data-auracolor]');
            if (st) { setStick(st.dataset.stick); return paintLook(); }
            if (au) {
                const id = au.dataset.aura;
                setAura(!id || aura.split(':')[0] === id ? '' : id + (AURA_TINTED[id] ? ':' + auraColor : ''));
                return paintLook();
            }
            if (ac) {
                // The colour for the auras that take one (and the one you have on, if it does).
                auraColor = ac.dataset.auracolor;
                try { localStorage.setItem('ltl.hallAuraColor', auraColor); } catch { /* full */ }
                const kind = aura.split(':')[0];
                if (kind && AURA_TINTED[kind]) setAura(kind + ':' + auraColor);
                return paintLook();
            }
            const b = e.target.closest('[data-k]'), nc = e.target.closest('[data-nc]');
            if (nc) {
                // Your name colour, for chat and your tag here: it goes with your name, so the station knows it.
                if (core.setColor) core.setColor(nc.dataset.nc);
                const p = mine(); if (p) p.c = nc.dataset.nc;
                return paintLook();
            }
            if (b) { look[b.dataset.k] = +b.dataset.v; }
            else if (e.target.closest('[data-rand]')) look = A.randomLook();
            else if (e.target.closest('[data-done]')) { lookEl.hidden = true; return; }
            else if (e.target === lookEl) {
                // Around the card: the room behind it. Closing on that (and walking there) is the option above.
                if (lookAuto) { lookEl.hidden = true; floorClick(e); }
                return;
            }
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
