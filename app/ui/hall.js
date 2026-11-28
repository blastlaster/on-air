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
    const HERE_Q = ((document.currentScript && document.currentScript.src) || '').replace(/^[^?]*/, '');

    const EMOTES = [['wave', '👋', 'Wave'], ['dance', '💃', 'Dance'], ['jump', '⤴️', 'Jump'], ['sit', '🪑', 'Sit'], ['cheer', '🙌', 'Cheer'],
        ['clap', '👏', 'Clap'], ['point', '👉', 'Point'], ['spin', '🌀', 'Spin'], ['headbang', '🤘', 'Headbang'], ['sleep', '💤', 'Sleep (lie down)'],
        ['robot', '🤖', 'The robot'], ['worm', '🐛', 'The worm'], ['breakdance', '🌪️', 'Breakdance'], ['moonwalk', '🌙', 'Moonwalk'], ['dab', '💥', 'Dab'],
        ['67', '⚖️', '67 (six seven)'], ['egyptian', '🏺', 'Walk like an Egyptian']];
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
    const POINTS = { nice: ['😇', 'nice'], ebil: ['😈', 'ebil'], ayy: ['👽', 'abduction'] };
    const REWARDS = [
        ['nice', 11, 'aura', 'petals', 'the Petals aura'], ['nice', 33, 'extra', 12, 'the Flower crown'], ['nice', 66, 'aura', 'hearts', 'the Hearts aura'],
        ['nice', 111, 'back', 1, 'Angel wings'], ['nice', 222, 'aura', 'butterflies', 'the Butterflies aura'], ['nice', 333, 'extra', 13, 'the Tiara'],
        ['nice', 555, 'back', 2, 'Fairy wings'], ['nice', 666, 'face', 5, 'Glowing eyes'], ['nice', 777, 'aura', 'twinkle', 'the Twinkle aura'], ['nice', 999, 'aura', 'heaven', 'the Heaven aura'],
        ['nice', 999, 'back', 3, 'Seraph wings'],
        ['ebil', 11, 'aura', 'fire', 'the Fire aura'], ['ebil', 33, 'back', 4, 'a Devil tail'], ['ebil', 66, 'extra', 14, 'the Skull mask'],
        ['ebil', 111, 'back', 5, 'Bat wings'], ['ebil', 222, 'aura', 'brimstone', 'the Brimstone aura'], ['ebil', 333, 'extra', 15, 'Demon horns'],
        ['ebil', 555, 'back', 6, 'the Villain cape'], ['ebil', 666, 'aura', 'hellfire', 'the Hellfire aura'], ['ebil', 777, 'aura', 'storm', 'the Storm aura'],
        ['ebil', 999, 'extra', 16, 'the Crown of flames'],
        ['ayy', 5, 'ride', 1, 'the UFO']                // abductions (engine/hall-ayy.js): riding one, you can't be taken
    ];
    const rewardFor = (what, which) => REWARDS.find(r => r[2] === what && r[3] === which) || null;
    const AURA_TINTED = { glow: 1, super: 1, charge: 1, rings: 1 };     // these are only a colour: never 'natural'
    /* The aura colour (every aura takes one; 'natural': each its own, yellow for the ones that are only a colour)
       goes out with the aura, aura:colour (engine/hall.js AURAS), so everyone sees it. Rainbow is rainbow. */
    const withColor = (kind, col) => (!kind || kind === 'rainbow' ? kind : col === 'natural' ? (AURA_TINTED[kind] ? kind + ':yellow' : kind) : kind + ':' + col);
    const RAINBOW_BG = 'linear-gradient(90deg,#ff3b6b,#ffe600,#39ff14,#00e5ff,#d14fff)';
    const auraOf = (a) => (a ? ['aura', ...a.split(':')] : null);                      // ['aura', kind, colour?]
    // Stage effects anyone can set off, when the host allows it (engine/hall.js CROWD_BURSTS).
    const BURSTS = [['fire', '🔥', 'Fire on the stage'], ['confetti', '🎊', 'Confetti']];
    const BURST_LINE = { fire: '🔥 {n} set the stage on fire', confetti: '🎊 {n} threw confetti' };
    // The emoji picker: anything to say, and things to carry (the same list as engine/hall.js HOLDS).
    // 🧴 is a bottle of water: drawn by hand (there's no water-bottle emoji before Unicode 13; Windows 10 would show a box).
    const WATER = '🧴', HOLD_NAME = { [WATER]: 'a bottle of water' };
    const holdName = (o) => HOLD_NAME[o] || o;
    // Anything can be held: one emoji, or a station emote as ':name:' (the same test as engine/hall.js holdable()).
    const ONE_EMOJI = /^(?:\p{RI}\p{RI}|[#*0-9]️?⃣|\p{Extended_Pictographic}️?\p{EMod}?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:‍\p{Extended_Pictographic}️?\p{EMod}?)*)$/u;
    const READS = /^[©®™#*0-9\u{1F1E6}-\u{1F1FF}]/u;          // letters and flags: never drawn mirrored
    /* Moving emotes: a canvas only ever shows a GIF's first frame, so each animated one is decoded once
       (ImageDecoder, frames shrunk to 64 px high, at most 150 of them) and stepped through by the clock.
       One copy per emote, shared by everyone holding it or saying it, and kept when the room is reopened. */
    const ANIM_H = 64, ANIM_MAX = 150, anims = {};
    function emoteAnim(src) {
        if (anims[src]) return anims[src];
        const a = anims[src] = { frames: null, ends: null, total: 0 };
        if (!/\.(gif|webp)(\?|$)/i.test(src) || typeof ImageDecoder !== 'function') return a;
        (async () => {
            const res = await fetch(src);
            const type = (res.headers.get('content-type') || '').split(';')[0] || (/\.webp/i.test(src) ? 'image/webp' : 'image/gif');
            if (!res.ok || !(await ImageDecoder.isTypeSupported(type))) return;
            const dec = new ImageDecoder({ data: await res.arrayBuffer(), type });
            try {
                await dec.tracks.ready; await dec.completed;
                const n = dec.tracks.selectedTrack ? Math.min(ANIM_MAX, dec.tracks.selectedTrack.frameCount) : 0;
                if (n < 2) return;                                          // a still picture: the <img> does
                const frames = [], ends = [];
                let t = 0;
                for (let i = 0; i < n; i++) {
                    const { image } = await dec.decode({ frameIndex: i });
                    const h = Math.min(ANIM_H, image.displayHeight), w = Math.max(1, Math.round(image.displayWidth * h / image.displayHeight));
                    frames.push(await createImageBitmap(image, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' }));
                    const ms = (image.duration || 0) / 1000;
                    t += ms > 10 ? ms : 100;                                // as browsers play them: "0 ms" is a tenth of a second
                    ends.push(t);
                    image.close();
                }
                Object.assign(a, { frames, ends, total: t });
            } finally { dec.close(); }
        })().catch(() => { /* the first frame it is */ });
        return a;
    }
    /** The frame to draw now: a decoded one while it moves, else the picture itself. */
    function emoteNow(im) {
        const a = emoteAnim(im.src);
        if (!a.frames) return im;
        const ms = performance.now() % a.total;
        let i = 0;
        while (a.ends[i] <= ms) i++;
        return a.frames[i];
    }
    /** [width, height] of something drawable, or null while it's still loading. */
    const picSize = (im) => (im.naturalWidth ? [im.naturalWidth, im.naturalHeight] : im.width && !(im instanceof HTMLImageElement) ? [im.width, im.height] : null);
    const emoteKey = (o) => { const m = /^:([a-z0-9_]{2,30}):$/.exec(o || ''); return m ? m[1] : ''; };
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
            '<div class="hall-pop" hidden></div><div class="hall-rps" hidden></div><div class="hall-duel" hidden></div><div class="hall-db" hidden></div><div class="hall-db hall-kart" hidden></div><div class="hall-db hall-kart hall-hk" hidden></div><div class="hall-kkeys" hidden></div><div class="hall-gm" hidden></div><div class="hall-msg" hidden></div></div>' +
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
        let lc = low.getContext('2d');          // (2.5D points this at its own pictures for a moment: see card / under)

        /* ---------- the view: 2D (today's) or 2.5D (hall-25d.js, loaded when first wanted) ----------
           Auto follows the app's Effects setting (Simple: 2D; Mid and Advanced: 2.5D, and 3D once there is one);
           🎨 Look → View picks one on this computer. Either way the room is the same room: 2.5D only draws it
           differently (design/hall-25d-scope.md). Without WebGL the room stays 2D. */
        let viewPref = 'auto', v25 = null, v25Loading = false, v25Failed = false, r25 = false;
        try { viewPref = localStorage.getItem('ltl.hallView') || 'auto'; } catch { /* default */ }
        const fxLevel = () => { const c = document.body.classList; return c.contains('fx-adv') ? 'advanced' : c.contains('fx-mid') ? 'mid' : 'simple'; };
        const v25Offered = () => true;
        const viewWanted = () => { const v = viewPref === 'auto' ? (fxLevel() === 'simple' ? '2d' : '3d') : viewPref; return v === '3d' ? '25d' : v; };   // (no 3D yet: 2.5D)
        function want25() {
            if (viewWanted() !== '25d' || v25Failed) return false;
            if (v25) return true;
            if (!v25Loading) {
                v25Loading = true;
                const go = () => {
                    v25 = window.HallView25 && window.HallView25.create();
                    if (!v25) { v25Failed = true; U.toast('2.5D needs WebGL, which isn’t available here: the room stays 2D'); return; }
                    v25.el.style.cssText = 'position:absolute;pointer-events:none;image-rendering:auto';
                    v25.el.hidden = true;
                    cv.style.position = 'relative';                  // the names and bubbles, over the 2.5D room
                    stage.insertBefore(v25.el, cv);
                };
                if (window.HallView25) go();
                else { const sc = document.createElement('script'); sc.src = HERE + 'hall-25d.js' + HERE_Q; sc.onload = go; sc.onerror = () => { v25Failed = true; }; document.head.appendChild(sc); }
            }
            return false;
        }
        offs.push(() => { if (v25) v25.destroy(); });
        // On battery (a phone, a laptop unplugged), 2.5D draws 30 times a second instead of 60.
        let onBattery = false;
        try { if (navigator.getBattery) navigator.getBattery().then((b) => { const f = () => { onBattery = !b.charging; }; f(); b.addEventListener('chargingchange', f); }).catch(() => {}); } catch { /* not told */ }
        /* In 2.5D the room's own 2D drawing code draws everything still, just somewhere else:
           card(): something standing in the room (people, Daniel, an explosion, the UFO) — drawn into a card of its
             own, stood up where it is. (x, y): the room point it stands on; lift: how far up; w × h: room pixels
             around it, (x, y) being (ax, ay) in that.
           under(): something lying on the floor or the wall (crop circles, the court, stage effects) — drawn into
             the room's own picture.
           spot(): the screen overlays (bonks, held things, badges...) are drawn as in 2D, in screen pixels, around
             whoever they're on; spot() makes the canvas's transform match that spot in 2.5D (and in 2D does nothing).
           In 2D, card() and under() just draw, there and then. */
        let cards25 = [], under25 = [];
        const withLc = (g, fn) => { const keep = lc; lc = g; try { return fn(); } finally { lc = keep; } };
        let fadeFrom = null;                    // (watching FunpostTV: anyone further forward than your seat is see-through)
        function card(x, y, lift, w, h, ax, ay, fn, shadow) {
            if (!r25) return fn();
            cards25.push({ x, y, lift, w, h, ax, ay, shadow, fade: fadeFrom != null && y > fadeFrom ? 0.3 : 0, paint: (g) => withLc(g, fn) });
        }
        function under(fn) { if (r25) under25.push(fn); else fn(); }
        let spotU = 1;
        function spot(x, y) {
            if (!r25 || !v25) return;
            if (hideSpot && Math.abs(x - hideSpot[0]) < 0.01 && Math.abs(y - hideSpot[1]) < 0.01) return ctx.setTransform(1, 0, 0, 1, -1e6, -1e6);
            const [ox, oy, sc] = v25.lens(x, y), k = sc / spotU;
            ctx.setTransform(k, 0, 0, k, ox - x * sc, oy - y * sc);
        }
        const flat = () => ctx.setTransform(1, 0, 0, 1, 0, 0);
        let hideSpot = null;                    // (watching in 2.5D: you're the camera, so nothing's drawn on you)

        /* ---------- watching FunpostTV from a seat in front of the stage ----------
           Click the screen while FunpostTV's on the stage: you walk to a free seat in the front row and sit. In 2.5D
           the camera drops to your eyes (hall-25d.js watch): the TV almost fills the view off air; live, the TV on
           the left and Radioman on the right. Drag to look side to side, the wheel (or a pinch) to zoom. 🍿 and 💧:
           popcorn and a sip of water (everyone sees you snacking; in 2.5D you see them in your hands). Walking, Esc
           or Stand up gets you up; so does anything the room needs you for (Dodgeball asking, Burgertime, the
           Radioman fight, a race or air hockey, the UFO), and the camera goes back to the room. */
        let watch = null, tvNow = false;
        const SEATED = new Set(['sit', 'popcorn', 'sip']);
        const watchEl = document.createElement('div');
        watchEl.className = 'hall-watch'; watchEl.hidden = true;
        stage.appendChild(watchEl);
        const clampK = (v, a, b) => Math.max(a, Math.min(b, v));
        function seatFor() {
            const y = F.y0 + 2;
            for (const dx of [0, -14, 14, -28, 28, -42, 42, -56, 56, -70, 70]) {
                const x = 120 + dx;
                if (![...people.values()].some(q => q.h !== me && Math.hypot(q.x - x, q.y - y) < 7)) return [x, y];
            }
            return [120, y + 8];
        }
        function startWatch() {
            const p = mine();
            if (!p || watch) return;
            const [x, y] = seatFor();
            watch = { x, y, seated: false, look: 0, zoom: 1 };
            popEl.hidden = true; pendingHit = null;
            p.tx = x; p.ty = y; sendGo(x, y);
            paintWatch();
        }
        function stopWatch(why) {
            if (!watch) return;
            const p = mine();
            watch = null; hideSpot = null;
            if (p && SEATED.has(p.e || '')) setPose('');
            if (v25) v25.watch(null);
            paintWatch();
            if (why) U.toast(why);
        }
        function setPose(e) { const p = mine(); if (!p) return; p.e = e; p.et = now(); core.send({ t: 'hall-emote', e }); paintPoses(); }
        function watchTick() {
            const p = mine();
            if (!p) return stopWatch();
            if (!watch.seated) {
                if (Math.abs(p.tx - watch.x) > 0.5 || Math.abs(p.ty - watch.y) > 0.5) return stopWatch();      // walked off somewhere else
                if (!p.walking && Math.hypot(p.x - watch.x, p.y - watch.y) < 2) { watch.seated = true; p.face = p.x <= 120 ? 1 : -1; setPose('sit'); paintWatch(); }
            } else if (p.walking || !SEATED.has(p.e || '')) stopWatch();
        }
        function paintWatch() {
            watchEl.hidden = !watch;
            if (!watch) return;
            const e = (mine() || {}).e;
            watchEl.innerHTML = '<span class="hw-t">📺 ' + (watch.seated ? 'Watching FunpostTV' : 'Finding a seat…') + '</span>' +
                (watch.seated ? '<button type="button" class="btn' + (e === 'popcorn' ? ' on' : '') + '" data-w="popcorn" title="Popcorn">🍿</button>' +
                    '<button type="button" class="btn' + (e === 'sip' ? ' on' : '') + '" data-w="sip" title="A sip of water">💧</button>' : '') +
                (r25 ? '<button type="button" class="btn" data-w="l" title="Look left (or drag)">◀</button><button type="button" class="btn" data-w="r" title="Look right (or drag)">▶</button>' +
                    '<button type="button" class="btn" data-w="in" title="Zoom in (or the wheel)">＋</button><button type="button" class="btn" data-w="out" title="Zoom out (or the wheel)">－</button>' : '') +
                '<button type="button" class="btn" data-w="up" title="Stand up (Esc)">🚶 Stand up</button>';
        }
        watchEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const b = e.target.closest('[data-w]'), p = mine();
            if (!b || !watch || !p) return;
            const k = b.dataset.w;
            if (k === 'up') return stopWatch();
            if (k === 'popcorn' || k === 'sip') { if (watch.seated) setPose(p.e === k ? 'sit' : k); return paintWatch(); }
            if (k === 'l' || k === 'r') watch.look = clampK(watch.look + (k === 'l' ? 0.5 : -0.5), -1, 1);
            if (k === 'in' || k === 'out') watch.zoom = clampK(watch.zoom * (k === 'in' ? 0.8 : 1.25), 0.55, 1.5);
        });
        /** Is the pointer on FunpostTV's screen? (2D: the room point; 2.5D: inside the screen's four corners on the canvas.) */
        function tvHit(e, rx, ry) {
            if (!tvNow) return false;
            const S = A.screenAt(screenLive, tvK);
            if (!r25) return rx >= S.x && rx <= S.x + S.w && ry >= S.y && ry <= S.y + S.h;
            if (!v25) return false;
            const r = cv.getBoundingClientRect(), sx = (e.clientX - r.left) / r.width * cv.width, sy = (e.clientY - r.top) / r.height * cv.height;
            const k = clampK(tvK, 0, 1), f = screenLive ? k * k * (3 - 2 * k) : 1;
            const P = [[S.x, S.y], [S.x + S.w, S.y], [S.x + S.w, S.y + S.h], [S.x, S.y + S.h]].map(([x, y]) => v25.wallPt(x, y, f));
            if (P.some(q => !q)) return false;
            let sign = 0;
            for (let i = 0; i < 4; i++) {
                const [ax, ay] = P[i], [bx, by] = P[(i + 1) % 4], c = (bx - ax) * (sy - ay) - (by - ay) * (sx - ax);
                if (c) { if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); }
            }
            return true;
        }
        // Seated in 2.5D: drag to look side to side, the wheel or a pinch to zoom. Over the screen: a zoom-in pointer.
        const wPtr = new Map();
        let wDrag = null;
        const pinchD = () => { const v = [...wPtr.values()]; return v.length > 1 ? Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]) : 0; };
        stage.addEventListener('pointerdown', (e) => {
            if (!watch || !r25 || e.target !== cv) return;
            wPtr.set(e.pointerId, [e.clientX, e.clientY]);
            wDrag = { x: e.clientX, look: watch.look, zoom: watch.zoom, d: pinchD(), moved: wDrag ? wDrag.moved : false };
        });
        listen('pointermove', (e) => {
            if (!watch || !wPtr.has(e.pointerId)) {
                if (e.target === cv && !rmOn() && !kartView() && !hkView()) { const [rx, ry] = roomXY(e), on = !watch && tvHit(e, rx, ry); if (cv.style.cursor !== (on ? 'zoom-in' : '')) cv.style.cursor = on ? 'zoom-in' : ''; }
                return;
            }
            wPtr.set(e.pointerId, [e.clientX, e.clientY]);
            if (wPtr.size > 1) { const d = pinchD(); if (wDrag.d) watch.zoom = clampK(wDrag.zoom * wDrag.d / d, 0.55, 1.5); wDrag.moved = true; }
            else { const dx = e.clientX - wDrag.x; if (Math.abs(dx) > 6) wDrag.moved = true; if (wDrag.moved) watch.look = clampK(wDrag.look - dx / 250, -1, 1); }
        });
        const wUp = (e) => {
            if (!wPtr.delete(e.pointerId)) return;
            if (wDrag && wDrag.moved) { skipClick = true; setTimeout(() => { skipClick = false; }, 300); }
            if (!wPtr.size) wDrag = null;
        };
        listen('pointerup', wUp); listen('pointercancel', wUp);
        stage.addEventListener('wheel', (e) => { if (!watch || !r25) return; e.preventDefault(); watch.zoom = clampK(watch.zoom * Math.exp(e.deltaY * 0.0015), 0.55, 1.5); }, { passive: false });
        // Esc while watching only stands you up: caught first (before the page's own Esc, which would leave the room) and stopped there.
        const watchEsc = (e) => {
            if (!watch || (e.key !== 'Escape' && e.key !== 'Esc') || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
            e.preventDefault(); e.stopImmediatePropagation();
            stopWatch();
        };
        window.addEventListener('keydown', watchEsc, true);
        offs.push(() => window.removeEventListener('keydown', watchEsc, true));
        /** Seated in 2.5D: what's in your hands, at the bottom of the screen — the popcorn bucket and the bottle, up when you snack. */
        function watchHands(t) {
            const p = mine();
            if (!p) return;
            const k = Math.max(2, Math.round(cv.height / 95)), o = { t, et: t - p.et }, W = cv.width, H = cv.height;
            const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h)); };
            // The bucket, bottom right: up to you while you eat, a kernel on its way.
            const pop = p.e === 'popcorn', up = pop && A.snackUp(o), bx = W - 30 * k, by = H - (pop ? (up ? 24 : 19) : 13) * k;
            for (let i = 0; i < 16; i++) rect(bx + i * k, by, k, 18 * k, Math.floor(i / 2) % 2 ? '#f2eee4' : '#d0302a');
            rect(bx - k, by - k, 18 * k, 2 * k, '#e8e0d0');
            for (let i = 0; i < 8; i++) { const cx = bx + (i * 2 + (i % 2)) * k, cy = by - (3 + (i * 5) % 3) * k; rect(cx, cy, 3 * k, 3 * k, '#fff2b0'); rect(cx + k, cy, k, k, '#ffffff'); rect(cx, cy + 2 * k, k, k, '#f0d060'); }
            if (up) { const a = ((o.et % 1.6) + 1.6) % 1.6, q = (a - 0.2) / 0.5; rect(bx + 6 * k - q * 12 * k, by - 6 * k - q * 10 * k, 3 * k, 3 * k, '#fff2b0'); }
            // The bottle, bottom left: tipped up while you sip.
            const sip = p.e === 'sip', su = sip && A.sipUp(o);
            ctx.save();
            ctx.translate(16 * k, H - (sip ? (su ? 20 : 12) : 8) * k);
            if (su) ctx.rotate(0.9);
            rect(-3 * k, -18 * k, 7 * k, 22 * k, '#bfe8ff'); rect(-2 * k, -16 * k, 2 * k, 18 * k, '#e8f8ff');
            rect(-2 * k, -21 * k, 5 * k, 3 * k, '#3a8ad8'); rect(-3 * k, -8 * k, 7 * k, 4 * k, '#5aa0ff');
            ctx.restore();
        }
        const [hudC, hudG] = (() => { const c = document.createElement('canvas'); c.width = A.W; c.height = A.H; return [c, c.getContext('2d')]; })();

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
            if (ayyAway.has(h)) return true;                                    // up in the UFO
            if (kRacing(h)) return true;                                        // in a kart
            if (h === me && hkView()) return true;                              // at the air hockey table
            if (blasted.has(h) && blasted.get(h).end > t) return true;
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
            people.set(p.h, { h: p.h, n: p.n, c: p.c || '', l: p.l, o: p.o || '', f: p.f || '', s: !!p.s, g: p.g || '', a: p.a || '', star: starTill(p.star) || (old ? old.star : 0), afk: p.afk || '', trail: [], atrail: [],
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
            // 4: hot potato and Burger Smash. 5: can be taken by the UFO (engine/hall-ayy.js).
            if (!core.send({ t: 'hall-join', look, safe, glow, aura, v: 10 })) return notice('Connecting to the station…');
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
                    kLob.clear();
                    for (const L of (Array.isArray(m.kart) ? m.kart : [])) onKart(L, true);
                    kSync();
                    hks.clear();
                    for (const g of m.hk || []) onHk(g, true);
                    onRm(m.rm || { state: '' }, true);
                    onBomb(m.bomb || { h: '' }, true);
                    ayyAway.clear(); ayyUfo = null; ayyMe = null;
                    for (const h of m.ayy || []) ayyAway.add(h);
                    notice('');
                    break;
                case 'hall-bt': onBt(m); break;
                case 'hall-kart': onKart(m); break;
                case 'hall-hk': onHk(m); break;
                case 'hall-hk-at': onHkAt(m); break;
                case 'hall-rm': case 'hall-rm-p': case 'hall-rm-at': case 'hall-rm-hp': case 'hall-rm-ouch': case 'hall-rm-bomb': case 'hall-rm-up': rmMsg(m); break;
                case 'hall-kart-at': onKartAt(m); break;
                case 'hall-kart-invite': if (!kMine()) { kInvite = { id: m.id, from: m.from }; U.toast(m.from ? '🏁 ' + nameOf(m.from) + ' invites you to Super Nice Kart!' : '🏁 A Super Nice Kart race is open for the room!'); paintKart(); } break;
                case 'hall-kart-fix': if (m.id && m.id !== ks.id) break; kMe.x = m.x; kMe.y = m.y; kMe.a = m.a; kMe.v = 0; kMe.i = null; if (ks.state !== 'race') kMe.camA = m.a; break;
                case 'hall-ayy': onAyy(m); break;
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
                case 'hall-afk': { const p = people.get(m.h); if (p) p.afk = m.afk || ''; break; }      // /afk (engine/chat-commands.js)
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
                case 'hall-cam':                                                // the host moves the 2.5D camera for a moment (2D: nothing)
                    if (v25) v25.cue(m.shot);
                    break;
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
            if ((m.role === 'system' && !cls && !m.mine) || !m.text) return;
            const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
            const li = document.createElement('li');
            if (m.id) li.dataset.mid = m.id;
            if (cls) li.className = cls;
            // Links you can click (they open in a new tab, or the browser in the app); the game lines are plain.
            const text = !cls && window.LT && LT.lineHtml ? LT.lineHtml(m) : !cls && window.LT && LT.chatHtml ? LT.chatHtml(m.text) : window.LT && LT.emoteHtml ? LT.emoteHtml(esc(m.text)) : esc(m.text);
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
            if (p) { p.say = m.me ? '*' + m.text + '*' : m.text; p.sayId = m.id; p.sayUntil = now() + sayFor(m.text); }
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
        /* ---------- Super Nice Kart (engine/hall-kart.js), seen from behind the kart ----------
           Lobbies: open one from 🎮 Games (or the station opens one for the room); up to 8 race in it, one race
           after another, a leaderboard adding up, a vote on the next track, until the last one leaves; anyone
           can watch. Practice is a lobby of one. Your app drives your kart (the station checks it and decides
           laps and places); everyone else's comes from the station a few times a second and is smoothed.
           ks: the lobby you're in (or watching). */
        const kLob = new Map();                 // id → the station's hall-kart for it (got: when it came)
        let ks = { state: '' }, ksAt = 0, kTrack = null, kTex = null, kDecos = [], kPl = [], kWatchId = '', kWatchH = '', kInvite = null, kGoAt = 0, kFinAt = 0, kTouch = null;
        const kFingers = new Map();                      // on a touchscreen, pointerId → what that finger holds: -1 / 1 steering, 'b' braking
        let kLastTap = { dir: 0, at: 0 };
        const kAt = new Map();                  // h → { x, y, a, v, lap, at } from the station, gx gy ga: as drawn
        const kMe = { x: 0, y: 0, a: 0, v: 0, i: null, camA: 0, steer: 0, go: false, sentAt: 0, bonk: 0 };
        // Flat out on the road (engine/hall-kart.js KART.maxV), off it, how fast it picks up and slows, how sharp it turns.
        const KPHYS = { maxV: 520, accel: 330, brake: 900, drag: 150, rev: 160, turn: 2.6, offV: 0.42, offDrag: 700, bump: 34 };
        const KART_MAX = 8;
        const TRACKS = [['neon', 'Neon Loop'], ['sunset', 'Sunset Speedway'], ['frost', 'Frostbite Hairpins'], ['burger', 'Burger Boulevard'], ['crop', 'Crop Circle Raceway'], ['static', 'Static Peaks']];
        const trackName = (id) => (TRACKS.find(x => x[0] === id) || [id, id])[1];
        const kRacer = (h) => (ks.racers || []).includes(h);
        const kSeated = (h, L = ks) => (L.seats || []).includes(h);
        const kRacing = (h) => (ks.state === 'count' || ks.state === 'race') && kRacer(h);
        const kOn = () => ks.state === 'count' || ks.state === 'race' || ks.state === 'results' || ks.state === 'vote';
        const kMine = () => { for (const L of kLob.values()) if (kSeated(me, L)) return L; return null; };
        /** The race fills the room: for those in the lobby, and for anyone watching it (Esc goes back to the room). */
        const kartView = () => !!kTex && !!ks.id && kOn() && (kSeated(me) || kWatchId === ks.id);
        const kLeft = () => Math.max(0, (ks.until || 0) / 1000 - (now() - ksAt));
        const kTime = (ms) => { const s = ms / 1000; return Math.floor(s / 60) + ':' + (s % 60).toFixed(2).padStart(5, '0'); };
        const kNth = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
        const kHostName = (L) => (L.kind === 'station' ? 'the station’s' : L.kind === 'practice' ? 'practice' : nameOf(L.host) + '’s');
        /** Which lobby the race view's about: yours, or the one you're watching. */
        function kSync() {
            const L = kMine() || (kWatchId && kLob.get(kWatchId)) || null, was = ks.id;
            ks = L || { state: '' }; ksAt = L ? L.got : now();
            if (ks.id !== was) { kAt.clear(); kPl = []; kWatchH = ''; kMe.i = null; }
            if (L && L.track && (!kTrack || kTrack.id !== L.track.id || kTrack.path.length !== L.track.path.length)) { kTrack = L.track; kTex = A.kartTex(L.track); kDecos = A.kartDecos(L.track); kMe.i = null; }
        }
        function onKart(m, quiet) {
            const prev = kLob.get(m.id), was = prev ? prev.state : '', wasDone = !!prev && (prev.done || []).some(d => d.h === me);
            if (!m.state) { kLob.delete(m.id); if (kWatchId === m.id) kWatchId = ''; if (kInvite && kInvite.id === m.id) kInvite = null; }
            else kLob.set(m.id, { ...m, got: now() });
            if (!prev && m.state === 'lobby' && m.kind === 'public' && !quiet && m.host !== me) logLine({ text: '🏁 ' + nameOf(m.host) + ' opened a Super Nice Kart race on ' + trackName(m.track.id) + ' — click them, 🎮 Games, to join.' }, 'game');
            kSync();
            if (ks.id !== m.id || !m.state) { if (!m.state) { keys.clear(); kHeld.clear(); kTouch = null; } paintKart(); return; }
            if (m.state === 'count' && was !== 'count') { kAt.clear(); kMe.v = 0; kMe.m = null; keys.clear(); kHeld.clear(); Object.assign(kDrift, { on: false, gauge: 0, nitros: 0, endAt: -9, ibAt: -9 }); kBoost.until = 0; kFinAt = 0; }
            if (m.ms != null) kGoAt = now() - m.ms / 1000;                     // the race clock: the station's (someone coming in halfway too)
            if (m.state === 'race' && was !== 'race') { if (m.ms == null) kGoAt = now(); if (coarse && kRacer(me)) { kTouch = { steer: 0, brake: 0 }; kFingers.clear(); } }
            if ((m.done || []).some(d => d.h === me) && !wasDone) kFinAt = now();
            if (m.state === 'results' && was !== 'results' && !quiet && m.kind !== 'practice') {
                const w = ((m.last && m.last.rows) || []).find(r => r.place === 1);
                logLine({ text: w ? '🏆 ' + nameOf(w.h) + ' wins on ' + trackName(m.last.track) + ' in ' + kTime(w.ms) + '!' : '🏁 Nobody made it round ' + trackName(m.track.id) + '.' }, 'game');
                const p = w && people.get(w.h);
                if (p) p.star = performance.now() + 22000;                     // the gold star (engine/hall-kart.js KART.starMs)
            }
            paintKart();
        }
        function onKartAt(m) {
            if (m.id && m.id !== ks.id) return;
            const t = now();
            for (const [h, v] of Object.entries(m.at || {})) {
                const q = kAt.get(h);
                if (!q) kAt.set(h, { x: v[0], y: v[1], a: v[2], v: v[3], lap: v[4], m: v[6] == null ? v[2] : v[6], f: v[5] || 0, gx: v[0], gy: v[1], ga: v[2], at: t });
                else Object.assign(q, { x: v[0], y: v[1], a: v[2], v: v[3], lap: v[4], m: v[6] == null ? v[2] : v[6], f: v[5] || 0, at: t });
            }
            kPl = m.pl || kPl;
        }
        /** Opening a lobby, joining one, leaving, starting, voting — to the station. */
        const kSend = (t, o = {}) => core.send({ t: 'hall-kart-' + t, ...o });
        /** Nearest point of the road's middle to (x, y): looking near `hint` (a point of the path), or everywhere. */
        function kNear(x, y, hint) {
            const P = kTrack.path, n = P.length / 2, reach = hint == null ? n : 14, from = hint == null ? 0 : hint;
            let best = { d: Infinity, i: 0, px: x, py: y };
            for (let k = -reach; k <= reach; k++) {
                const i = ((from + k) % n + n) % n, j = (i + 1) % n;
                const ax = P[i * 2], ay = P[i * 2 + 1], ex = P[j * 2] - ax, ey = P[j * 2 + 1] - ay, L = ex * ex + ey * ey || 1;
                const u = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L)), px = ax + ex * u, py = ay + ey * u, d = Math.hypot(x - px, y - py);
                if (d < best.d) best = { d, i, px, py };
            }
            return best;
        }
        const kPad = () => (navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean)[0] : null);
        /* Drifting (KartRider's): hold the drift key (Shift) while you steer at speed and the kart
           slides — it points into the corner faster than it goes there. Sliding fills the nitro
           gauge (a nitro every time it's full, two at most; Space fires one). Just as a drift ends,
           a fresh tap on the gas is an instant boost. */
        const KDRIFT = { minV: 220, turn: 0.95, grip: 12, slideGrip: 2.2, maxSlip: 0.7, bleed: 0.05, fill: 0.65, nitros: 2,
            nitroS: 2.2, nitroUp: 1.35, ibWindow: 0.4, ibS: 0.8, ibUp: 1.22 };
        const kBoost = { until: 0, up: 1, nitro: false }, kDrift = { on: false, dir: 0, gauge: 0, nitros: 0, endAt: -9, ibAt: -9, sparks: [] };
        let kGasTap = -9, kPadWas = [];
        /* Your race keys: two for each action (Settings: ⌨ Keys in the race's bar), kept in this browser / app. */
        const KART_ACTS = [['gas', 'Go'], ['brake', 'Brake'], ['left', 'Steer left'], ['right', 'Steer right'], ['drift', 'Drift'], ['nitro', 'Nitro']];
        const KKEYS0 = { gas: ['w', 'ArrowUp'], brake: ['s', 'ArrowDown'], left: ['a', 'ArrowLeft'], right: ['d', 'ArrowRight'], drift: ['Shift', 'k'], nitro: [' ', 'l'] };
        const kNorm = (k) => (k.length === 1 ? k.toLowerCase() : k);
        let kKeys = {};
        try { kKeys = JSON.parse(localStorage.getItem('ltl.kartKeys') || '{}') || {}; } catch { /* the usual */ }
        for (const [id] of KART_ACTS) if (!Array.isArray(kKeys[id]) || kKeys[id].length !== 2) kKeys[id] = KKEYS0[id].slice();
        const kSaveKeys = () => { try { localStorage.setItem('ltl.kartKeys', JSON.stringify(kKeys)); } catch { /* full */ } };
        const kActOf = (key) => { const k = kNorm(key); const a = KART_ACTS.find(([id]) => kKeys[id].includes(k)); return a ? a[0] : ''; };
        const kKeyName = (k) => (k === ' ' ? 'Space' : k.startsWith('Arrow') ? { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[k] : k.length === 1 ? k.toUpperCase() : k);
        const kKeysOf = (id) => kKeys[id].filter(Boolean).map(kKeyName).join('/') || '—';
        const kHeld = new Set();                // the race's actions held down now
        let kKeyWait = '';                      // choosing a key: 'gas:0' …
        /** Your kart, every frame: the keys (or a controller, or the touch buttons), the road, the barrier, the others. */
        function kartDrive(dt) {
            if (!kTrack || !kRacing(me)) return;
            const t = now();
            let steer = 0, gas = 0, brake = 0, drift = kHeld.has('drift'), nitro = false;
            if (kHeld.has('left')) steer -= 1;
            if (kHeld.has('right')) steer += 1;
            if (kHeld.has('gas')) gas = 1;
            if (kHeld.has('brake')) brake = 1;
            const g = kPad();
            if (g) {
                const bv = (i) => (g.buttons[i] ? g.buttons[i].value || (g.buttons[i].pressed ? 1 : 0) : 0), ax = g.axes[0] || 0;
                if (Math.abs(ax) > 0.2) steer += ax;
                if (bv(14)) steer -= 1; if (bv(15)) steer += 1;
                gas = Math.max(gas, bv(0), bv(7)); brake = Math.max(brake, bv(1), bv(6));
                drift = drift || bv(4) > 0.5 || bv(5) > 0.5;                        // a bumper: drift
                const tap = bv(0) > 0.5 || bv(7) > 0.5, fire = bv(2) > 0.5 || bv(3) > 0.5;      // A / RT tapped: the gas; X / Y: nitro
                if (tap && !kPadWas[0]) kGasTap = t;
                if (fire && !kPadWas[1]) nitro = true;
                kPadWas = [tap, fire];
            }
            if (kTouch) { steer += kTouch.steer; gas = Math.max(gas, kTouch.brake ? 0 : 1); brake = Math.max(brake, kTouch.brake); drift = drift || !!kTouch.drift; if (kTouch.nitro) { nitro = true; kTouch.nitro = false; } }
            if (kNitroKey) { nitro = true; kNitroKey = false; }
            steer = Math.max(-1, Math.min(1, steer));
            kMe.steer += (steer - kMe.steer) * Math.min(1, dt * 10);
            kMe.go = gas > 0;
            if (ks.state !== 'race') { kMe.v = 0; kMe.m = kMe.a; kDrift.on = false; return; }
            if (kMe.m == null) kMe.m = kMe.a;
            if (kMe.i == null) kMe.i = kNear(kMe.x, kMe.y).i;
            // Nitro, and the instant boost (a fresh tap on the gas just as a drift ends).
            if (nitro && kDrift.nitros > 0 && !(kBoost.nitro && kBoost.until > t)) { kDrift.nitros--; Object.assign(kBoost, { until: t + KDRIFT.nitroS, up: KDRIFT.nitroUp, nitro: true }); }
            if (kGasTap > kDrift.endAt && kGasTap - kDrift.endAt < KDRIFT.ibWindow && kDrift.ibAt < kDrift.endAt) {
                kDrift.ibAt = t;
                if (!(kBoost.until > t && kBoost.up >= KDRIFT.ibUp)) Object.assign(kBoost, { until: t + KDRIFT.ibS, up: KDRIFT.ibUp, nitro: false });
            }
            const boosting = kBoost.until > t, up = boosting ? kBoost.up : 1;
            const near = kNear(kMe.x, kMe.y, kMe.i), off = near.d > kTrack.w, top = KPHYS.maxV * up * (off ? (boosting ? 0.7 : KPHYS.offV) : 1);
            let v = kMe.v;
            if ((gas || boosting) && v < top) v = Math.min(top, v + KPHYS.accel * Math.max(gas, boosting ? 1 : 0) * (boosting ? 2.5 : 1) * dt * (v < 0 ? 3 : 1));
            if (brake) v -= (v > 0 ? KPHYS.brake : KPHYS.accel * 0.6) * brake * dt;
            if (!gas && !brake && !boosting) v -= Math.sign(v) * Math.min(Math.abs(v), KPHYS.drag * dt);
            if (v > top) v = Math.max(top, v - KPHYS.offDrag * dt);
            v = Math.max(-KPHYS.rev, v);
            // Into a drift: the drift key, steering, at speed. Out of it: let go, too slow, or braking.
            if (!kDrift.on && drift && Math.abs(steer) > 0.3 && v > KDRIFT.minV) { kDrift.on = true; kDrift.dir = Math.sign(steer); }
            else if (kDrift.on && (!drift || v < KDRIFT.minV * 0.7 || brake)) { kDrift.on = false; kDrift.endAt = t; }
            const sp = Math.abs(v), grip = Math.max(gas || brake ? 0.45 : 0, Math.min(1, sp / 140)) * (1 - 0.3 * Math.max(0, (sp - 300) / 220));
            let slip = Math.atan2(Math.sin(kMe.a - kMe.m), Math.cos(kMe.a - kMe.m));
            if (kDrift.on) {
                // Steering into the drift tightens it, away from it widens it; it always turns the drift's way a bit.
                const into = 0.55 + 0.45 * kMe.steer * kDrift.dir;
                kMe.a += kDrift.dir * KPHYS.turn * KDRIFT.turn * Math.max(0.25, into) * dt;
                slip = Math.atan2(Math.sin(kMe.a - kMe.m), Math.cos(kMe.a - kMe.m));
                if (Math.abs(slip) > KDRIFT.maxSlip) { kMe.a = kMe.m + Math.sign(slip) * KDRIFT.maxSlip; slip = Math.sign(slip) * KDRIFT.maxSlip; }
                kMe.m += slip * Math.min(1, KDRIFT.slideGrip * dt);
                v -= v * KDRIFT.bleed * dt;
                // The gauge: the more of a slide, the faster it fills.
                if (!off && kDrift.nitros < KDRIFT.nitros) {
                    kDrift.gauge += dt * KDRIFT.fill * Math.min(1, Math.abs(slip) / 0.45);
                    if (kDrift.gauge >= 1) { kDrift.gauge = 0; kDrift.nitros++; kDrift.gotAt = t; }
                }
                if (Math.random() < dt * 40) kDrift.sparks.push({ at: t, side: Math.random() < 0.5 ? -1 : 1, dx: (Math.random() - 0.5) * 2 });
            } else {
                kMe.a += kMe.steer * KPHYS.turn * grip * (v < 0 ? -1 : 1) * dt;
                kMe.m += Math.atan2(Math.sin(kMe.a - kMe.m), Math.cos(kMe.a - kMe.m)) * Math.min(1, KDRIFT.grip * dt);
            }
            while (kDrift.sparks.length && t - kDrift.sparks[0].at > 0.3) kDrift.sparks.shift();
            kMe.x += Math.cos(kMe.m) * v * dt; kMe.y += Math.sin(kMe.m) * v * dt;
            // The barrier: back inside it, and the part of the speed going into it is gone — you slide along it
            // (hit it head on and you stop; graze it and you barely slow). Out of any drift.
            const at = kNear(kMe.x, kMe.y, near.i), lim = kTrack.w + kTrack.wall - 14;
            if (at.d > lim) {
                const nx = (kMe.x - at.px) / at.d, ny = (kMe.y - at.py) / at.d;
                kMe.x = at.px + nx * lim; kMe.y = at.py + ny * lim;
                let vx = Math.cos(kMe.m) * v, vy = Math.sin(kMe.m) * v;
                const into = vx * nx + vy * ny;
                if (into > 0) { vx -= nx * into * 1.15; vy -= ny * into * 1.15; }
                const s = Math.hypot(vx, vy) * 0.96;
                if (s > 1) { kMe.m = v < 0 ? Math.atan2(-vy, -vx) : Math.atan2(vy, vx); v = v < 0 ? -s : s; } else v = 0;
                if (into > 60) kMe.bonk = t;
                if (kDrift.on) { kDrift.on = false; kDrift.endAt = -9; }
            }
            kMe.i = at.i;
            // Bumping into the others.
            for (const [h, q] of kAt) {
                if (h === me) continue;
                const dx = kMe.x - q.gx, dy = kMe.y - q.gy, d = Math.hypot(dx, dy);
                if (d > 0 && d < KPHYS.bump) { kMe.x += dx / d * (KPHYS.bump - d); kMe.y += dy / d * (KPHYS.bump - d); v *= 0.9; kMe.bonk = t; }
            }
            kMe.v = v;
            const f = (kDrift.on ? 1 : 0) | (boosting ? 2 : 0);
            if (t - kMe.sentAt > 0.1 || f !== kMe.f) {
                kMe.sentAt = t; kMe.f = f;
                core.send({ t: 'hall-kart-at', id: ks.id, x: Math.round(kMe.x), y: Math.round(kMe.y), a: +kMe.a.toFixed(3), v: Math.round(v), m: +kMe.m.toFixed(3), ...(f ? { f } : {}) });
            }
        }
        let kNitroKey = false;
        /** Drift sparks from your back wheels: yellow, then orange, then blue as the gauge fills. */
        function kartSparks(x, y, t) {
            const col = kDrift.gauge > 0.66 ? ['#7ef0ff', '#ffffff'] : kDrift.gauge > 0.33 ? ['#ffb020', '#ffe14d'] : ['#ffe14d', '#ffffff'];
            for (const s of kDrift.sparks) {
                const k = (t - s.at) / 0.3;
                lc.fillStyle = col[(s.dx > 0) | 0];
                lc.fillRect(Math.round(x + s.side * 11 + s.dx * 6 * k + s.side * 4 * k), Math.round(y - 1 - k * 5 + k * k * 6), 1, 1);
            }
        }
        /** Watching: the one the camera follows (your pick, or whoever's in front). */
        function kWatched() {
            const rs = ks.racers || [];
            if (kWatchH && rs.includes(kWatchH)) return kWatchH;
            return kPl.find(h => rs.includes(h)) || rs[0] || '';
        }
        function kWatchStep(d) {
            const order = kPl.length ? kPl.filter(h => (ks.racers || []).includes(h)) : (ks.racers || []);
            if (!order.length) return;
            const i = order.indexOf(kWatched());
            kWatchH = order[((i < 0 ? 0 : i) + d + order.length) % order.length];
        }
        /** A key while the race fills the room. True when it was the race's. */
        function kartKey(e) {
            const k = e.key.toLowerCase();
            if (!kRacing(me)) {
                if (k === 'escape' && !kSeated(me)) { kWatchId = ''; kSync(); paintKart(); return true; }
                const act = kActOf(e.key);
                if (act === 'left' || act === 'right') { if (!e.repeat) kWatchStep(act === 'left' ? -1 : 1); e.preventDefault(); return true; }
                return false;
            }
            const act = kActOf(e.key);
            if (!act) return false;
            if (!e.repeat) { if (act === 'nitro') kNitroKey = true; if (act === 'gas') kGasTap = now(); }
            kHeld.add(act); e.preventDefault();
            return true;
        }
        const kCv = document.createElement('canvas'); kCv.width = 40; kCv.height = 32;
        const kCtx = kCv.getContext('2d');
        /** The race, in place of the room: sky, track, karts, and (at screen size) names and the race's numbers. */
        /* The start arch, standing across the road: each pillar on its barrier and the banner between them, cut into
           strips each put where it is in the world, so it turns as you drive round it and passes overhead as you
           go under it (the strips behind the camera are left out). Its canvas (hall-art.js decoCanvas 'arch'):
           150 × 64, pillars at x 5 and 139 (6 wide, rows 12–62), the banner rows 4–16 from x 5 to 145, the
           ground at row 62, the road's middle at x 75, 67 across to each barrier. */
        function drawArch(c, d, cam) {
            const r = kTrack.w + kTrack.wall, nx = -Math.sin(d.a), ny = Math.cos(d.a), u = r * A.K7.focal / A.K7.back / 67;
            const at = (cx) => { const off = (cx - 75) / 67 * r; return A.kartProject(cam, d.x + nx * off, d.y + ny * off); };
            // One strip per pixel column of the banner, edge to edge, so its letters stay whole.
            let p = at(5);
            for (let x = 5; x < 145; x++) {
                const q = at(x + 1);
                if (p && q) {
                    const k = (p.k + q.k) / 2, sy = (p.sy + q.sy) / 2, a = Math.round(Math.min(p.sx, q.sx)), b = Math.round(Math.max(p.sx, q.sx));
                    lc.drawImage(c, x, 4, 1, 12, a, Math.round(sy - 58 * k * u), Math.max(1, b - a), Math.max(1, Math.round(12 * k * u)));
                }
                p = q;
            }
            for (const px of [5, 139]) {
                const p = at(px + 3);
                if (!p || p.k > 6) continue;
                const s = p.k * u;
                lc.drawImage(c, px, 12, 6, 50, Math.round(p.sx - 3 * s), Math.round(p.sy - 50 * s), Math.max(1, Math.round(6 * s)), Math.max(1, Math.round(50 * s)));
            }
        }
        function drawRace(dt, t) {
            const racer = kRacer(me), P = kTrack.path;
            let fx, fy, fa, follow = me;
            // Behind where you're going (mostly), so in a drift you see the kart turned into the corner.
            if (racer) { fx = kMe.x; fy = kMe.y; fa = kMe.m == null ? kMe.a : kMe.m + Math.atan2(Math.sin(kMe.a - kMe.m), Math.cos(kMe.a - kMe.m)) * 0.3; }
            else {
                follow = kWatched();
                const q = kAt.get(follow);
                if (q) { fx = q.gx; fy = q.gy; fa = q.m == null ? q.ga : q.m; } else { fx = P[0]; fy = P[1]; fa = Math.atan2(P[3] - P[1], P[2] - P[0]); }
            }
            // Everyone else: where the station last said, carried on the way they were going, eased in.
            for (const [h, q] of kAt) {
                if (h === me && racer) continue;
                const age = Math.min(0.25, t - q.at), tx = q.x + Math.cos(q.m) * q.v * age, ty = q.y + Math.sin(q.m) * q.v * age, e = Math.min(1, dt * 12);
                q.gx += (tx - q.gx) * e; q.gy += (ty - q.gy) * e;
                q.ga += Math.atan2(Math.sin(q.a - q.ga), Math.cos(q.a - q.ga)) * e;
            }
            // The camera swings round after the kart, a little behind it.
            const da = Math.atan2(Math.sin(fa - kMe.camA), Math.cos(fa - kMe.camA));
            kMe.camA += Math.abs(da) > 2.5 ? da : da * Math.min(1, dt * 7);
            const cam = { x: fx - Math.cos(kMe.camA) * A.K7.back, y: fy - Math.sin(kMe.camA) * A.K7.back, a: kMe.camA };
            A.kartSky(lc, cam.a, t, kTex);
            A.kartFloor(lc, kTex, cam);
            const list = [];
            for (const [h, q] of kAt) {
                if (h === me && racer) continue;
                const pr = A.kartProject(cam, q.gx, q.gy);
                if (pr && pr.k < 5) list.push({ h, a: q.ga, v: q.v, pr, steer: 0, drift: !!(q.f & 1), boost: !!(q.f & 2) });
            }
            if (racer) { const pr = A.kartProject(cam, kMe.x, kMe.y); if (pr) list.push({ h: me, a: kMe.a, v: kMe.v, pr, steer: kMe.steer, mine: true, drift: kDrift.on, boost: kBoost.until > t }); }
            // The scenery, sorted in with the karts so a kart passes in front of a palm tree and behind the next.
            for (const d of kDecos) {
                const pr = A.kartProject(cam, d.x, d.y);
                if (pr && pr.k < 4 && pr.k > 0.05 && pr.sx > -400 && pr.sx < lc.canvas.width + 400) list.push({ deco: d, pr });
            }
            list.sort((a, b) => b.pr.z - a.pr.z);
            const tags = [];
            lc.imageSmoothingEnabled = false;
            for (const it of list) {
                if (it.deco) {
                    const c = A.decoCanvas(it.deco.kind, kTrack.look, t, it.deco.turn), d = it.deco;
                    if (d.kind === 'arch') { drawArch(c, d, cam); continue; }
                    const k = it.pr.k;
                    if (k > 2.5) continue;                       // right on top of the camera: gone, not a wall of pixels
                    const w = Math.max(1, Math.round(c.width * k)), h = Math.max(1, Math.round(c.height * k));
                    lc.drawImage(c, Math.round(it.pr.sx - w / 2), Math.round(it.pr.sy - h + 2 * k), w, h);
                    continue;
                }
                const p = people.get(it.h), look = p ? p.l : {}, rel = Math.atan2(Math.sin(it.a - cam.a), Math.cos(it.a - cam.a));
                const view = Math.abs(rel) < Math.PI / 4 ? 0 : Math.abs(rel) > Math.PI * 3 / 4 ? 2 : rel > 0 ? 1 : -1;
                const o = { steer: it.drift ? Math.sign(Math.atan2(Math.sin(it.a - cam.a), Math.cos(it.a - cam.a))) * 1.5 : it.steer, go: it.mine ? kMe.go : it.v > 20, boost: it.boost, drift: it.drift, t3: Math.abs(rel) >= Math.PI / 12 && Math.abs(rel) < Math.PI / 4 ? Math.sign(rel) : 0 }, k = it.pr.k;
                let bob = 0;
                if (it.mine) { if (kMe.bonk && t - kMe.bonk < 0.2) bob = 1; else if (Math.abs(kMe.v) > 40 && kNear(kMe.x, kMe.y, kMe.i).d > kTrack.w) bob = Math.floor(t * 20) % 2; }
                if (Math.abs(k - 1) < 0.08) {
                    const top = A.kart(lc, look, it.pr.sx, it.pr.sy - bob, view, t, o);
                    if (it.mine) kartSparks(it.pr.sx, it.pr.sy, t);
                    if (!it.mine) tags.push({ h: it.h, x: it.pr.sx, y: top });
                } else {
                    kCtx.clearRect(0, 0, 40, 32);
                    const top = A.kart(kCtx, look, 20, 30, view, t, o);
                    lc.drawImage(kCv, Math.round(it.pr.sx - 20 * k), Math.round(it.pr.sy - 30 * k), Math.max(1, Math.round(40 * k)), Math.max(1, Math.round(32 * k)));
                    if (k > 0.22) tags.push({ h: it.h, x: it.pr.sx, y: it.pr.sy - (30 - top) * k });
                }
            }
            // The map, bottom left.
            const dots = [];
            for (const [h, q] of kAt) if (!(h === me && racer)) dots.push({ x: q.gx, y: q.gy, c: (people.get(h) || {}).c || '#e6e0f2', me: h === follow });
            if (racer) dots.push({ x: kMe.x, y: kMe.y, c: '#ffd34a', me: true });
            A.kartMini(lc, kTrack, 3, A.H - 47, 44, dots);
            if (racer && kBoost.until > t) A.kartSpeed(lc, t, kBoost.nitro);
            if (racer) A.kartGauge(lc, A.W - 50, 24, kDrift.gauge, kDrift.nitros, KDRIFT.nitros, t, kDrift.gotAt);
            // Onto the screen, then the words at screen size.
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(low, 0, 0, cv.width, cv.height);
            const u = cv.width / A.W, nfs = Math.max(10, Math.round(2.6 * u / dpr)) * dpr;
            ctx.textBaseline = 'top'; ctx.textAlign = 'center';
            ctx.font = 'bold ' + nfs + 'px "Courier New", monospace';
            for (const g of tags) {
                const p = people.get(g.h);
                if (!p) continue;
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(p.n, g.x * u + dpr, (g.y - 5) * u + dpr);
                ctx.fillStyle = p.c || '#e6e0f2'; ctx.fillText(p.n, g.x * u, (g.y - 5) * u);
            }
            kartHud(t, u, racer, follow);
        }
        /** Lap, place, time; the countdown; FINISH; the results. */
        function kartHud(t, u, racer, follow) {
            const big = Math.max(14, Math.round(6 * u / dpr)) * dpr, small = Math.max(10, Math.round(3 * u / dpr)) * dpr;
            const txt = (s, x, y, size, color, align) => {
                ctx.font = 'bold ' + size + 'px "Courier New", monospace'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'top';
                ctx.lineWidth = Math.max(2, size / 5); ctx.strokeStyle = '#000'; ctx.strokeText(s, x, y);
                ctx.fillStyle = color; ctx.fillText(s, x, y);
            };
            const pad = 3 * u, who = racer ? me : follow, q = kAt.get(who), laps = ks.laps || 3;
            const doneI = (ks.done || []).findIndex(d => d.h === who);
            const lap = Math.min(laps, (q && q.lap) || 1);
            if (ks.state === 'count' || ks.state === 'race') {
                txt(doneI >= 0 ? 'DONE' : 'LAP ' + lap + '/' + laps, pad, pad, small * 1.3, '#ffffff');
                const place = kPl.indexOf(who);
                if (place >= 0 && ks.state === 'race') txt(kNth(place + 1), cv.width - pad, pad, big, ['#ffd34a', '#d8d8e8', '#e09a5a'][place] || '#ffffff', 'right');
                if (ks.state === 'race') txt(kTime((t - kGoAt) * 1000), cv.width / 2, pad, small * 1.2, '#7ef0ff', 'center');
                if (!racer) txt('📺 ' + nameOf(who) + ' · ← → switch' + (kSeated(me) ? ' · you race the next one' : ' · Esc: the room'), cv.width / 2, pad + small * 1.6, small, '#e6e0f2', 'center');
                if (ks.kind === 'practice' && ks.circuit) txt('CIRCUIT ' + (ks.circuit.i + 1) + '/' + ks.circuit.n, cv.width - pad, pad + big * 1.1, small, '#c8c0ff', 'right');
            }
            const c = A.K7.hor * u;
            if (ks.state === 'count') {
                const n = Math.ceil(kLeft());
                txt(n > 3 ? 'GET READY' : String(n), cv.width / 2, c - big, big * (n > 3 ? 1 : 2), n > 3 ? '#ffffff' : '#ffd34a', 'center');
                if (racer) {
                    txt(kKeysOf('gas') + ' go · ' + kKeysOf('brake') + ' brake · ' + kKeysOf('left') + ' ' + kKeysOf('right') + ' steer', cv.width / 2, c + big * 1.4, small, '#e6e0f2', 'center');
                    txt(kTouch ? 'double-tap ◀ or ▶ and hold: drift (fills nitro) · let go: boost · 🔥 nitro' : kKeysOf('drift') + ' + steer: drift (fills nitro) · ' + kKeysOf('nitro') + ': nitro · tap ' + kKeysOf('gas') + ' as a drift ends: boost', cv.width / 2, c + big * 1.4 + small * 1.4, small * 0.9, '#c8c0ff', 'center');
                }
            } else if (ks.state === 'race' && t - kGoAt < 1.2) txt('GO!', cv.width / 2, c - big, big * 2, '#4fd36e', 'center');
            if (racer && ks.state === 'race' && doneI < 0) {
                if (t - kDrift.ibAt < 0.7) txt('BOOST!', cv.width / 2, c + big * 1.2, small * 1.4, '#7ef0ff', 'center');
                else if (kBoost.nitro && kBoost.until > t) txt('NITRO!', cv.width / 2, c + big * 1.2, small * 1.4, '#7ef0ff', 'center');
                else if (kDrift.gotAt && t - kDrift.gotAt < 1.2) txt('+ NITRO (Space)', cv.width / 2, c + big * 1.2, small * 1.2, '#ffd34a', 'center');
            }
            if (racer && ks.state === 'race') {
                if (doneI >= 0) txt(t - kFinAt < 3 ? 'FINISH! ' + kNth(doneI + 1) : 'Waiting for the others… ' + Math.ceil(kLeft()) + 's', cv.width / 2, c - big, t - kFinAt < 3 ? big * 1.5 : small * 1.3, '#ffd34a', 'center');
                else {
                    const n = kTrack.path.length / 2, j = ((kMe.i || 0) + 1) % n, P = kTrack.path;
                    const dir = Math.atan2(P[j * 2 + 1] - P[(kMe.i || 0) * 2 + 1], P[j * 2] - P[(kMe.i || 0) * 2]);
                    if (Math.cos(dir - kMe.a) < -0.3 && Math.abs(kMe.v) > 60) txt('WRONG WAY!', cv.width / 2, c - big, big, '#ff4040', 'center');
                    else if (q && q.lap === laps && laps > 1 && kLapAt !== laps) { kLapAt = laps; kLapShow = t; }
                    if (t - kLapShow < 2) txt('FINAL LAP!', cv.width / 2, c - big, big, '#ff4fd8', 'center');
                }
            }
            if (ks.state === 'results' || ks.state === 'vote') kartBoard(t, u, small, txt);
        }
        /** After a race: this race's places (time, points won) and the lobby's standings; in practice, your times. */
        function kartBoard(t, u, small, txt) {
            const last = ks.last || { rows: [] }, board = ks.board || [], practice = ks.kind === 'practice';
            const won = Object.fromEntries((last.rows || []).map(r => [r.h, r]));
            let title, head, rows;
            if (practice) {
                const r = (last.rows || [])[0] || {}, times = (ks.times || []).filter(x => x.track === last.track), best = times.reduce((a, x) => (a && a < x.ms ? a : x.ms), 0);
                title = '🏁 ' + trackName(last.track).toUpperCase();
                head = ['', 'TIME', ''];
                rows = [['This race', r.ms ? kTime(r.ms) : 'DNF', '', me], ['Best lap', r.lap ? kTime(r.lap) : '—', '', ''], ['Best on this track', best ? kTime(best) : '—', '', '']];
                if (ks.circuit) rows.push(['Circuit (' + (ks.circuit.i + 1) + '/' + ks.circuit.n + ')', kTime((ks.times || []).slice(-(ks.circuit.i + 1)).reduce((a, x) => a + x.ms, 0)), '', '']);
            } else {
                title = ks.state === 'vote' ? '🏆 STANDINGS · NEXT TRACK IN ' + Math.ceil(kLeft()) + 's' : '🏁 ' + trackName(last.track).toUpperCase() + ' · RACE ' + (ks.round || 1);
                head = ['', 'THIS RACE', 'TOTAL'];
                rows = board.map((b, i) => {
                    const r = won[b.h];
                    return [kNth(i + 1) + ' ' + nameOf(b.h).slice(0, 12), r ? (r.place ? kNth(r.place) + ' ' + kTime(r.ms) + ' +' + r.pts : 'DNF') : 'next race', b.pts + ' pts', b.h];
                });
            }
            const lh = small * 1.45, w = Math.min(cv.width - 8 * u, 190 * u), h = lh * (rows.length + 2.6), x0 = (cv.width - w) / 2, y0 = Math.max(16 * u, (cv.height - h) / 2 - 6 * u);
            ctx.fillStyle = 'rgba(10,6,24,0.88)'; ctx.fillRect(x0, y0, w, h);
            ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = Math.max(1, u / 2); ctx.strokeRect(x0, y0, w, h);
            txt(title, cv.width / 2, y0 + lh * 0.3, small * 1.1, '#ffd34a', 'center');
            txt(head[1], x0 + w * 0.62, y0 + lh * 1.25, small * 0.8, '#8a86a0', 'center'); txt(head[2], x0 + w - 4 * u, y0 + lh * 1.25, small * 0.8, '#8a86a0', 'right');
            rows.forEach((r, i) => {
                const y = y0 + lh * (i + 2), col = r[3] === me ? '#ffd34a' : i === 0 && !practice ? '#ffe9a0' : '#e6e0f2';
                txt(r[0], x0 + 4 * u, y, small, col); txt(r[1], x0 + w * 0.62, y, small, col, 'center'); if (r[2]) txt(r[2], x0 + w - 4 * u, y, small, col, 'right');
            });
        }
        let kLapAt = 0, kLapShow = -9;
        const kEl = () => $('.hall-kart', box);
        const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
        const kBtn = (act, label, o = {}) => '<button type="button" class="btn' + (o.go ? ' go' : '') + (o.on ? ' on' : '') + '" data-kact="' + act + '"' + (o.id ? ' data-kid="' + esc(o.id) + '"' : '') + (o.track ? ' data-ktrack="' + o.track + '"' : '') + '>' + label + '</button>';
        /** The track buttons: practice picks, the vote (with its count so far), the host's first pick. */
        function kTrackBtns(act, votes) {
            return TRACKS.concat([['random', '🎲 Random']]).map(([id, name]) => {
                const n = votes ? Object.values(votes).filter(v => v === id).length : 0, mineV = votes && votes[me] === id;
                return kBtn(act, esc(name) + (n ? ' <small>×' + n + '</small>' : ''), { id: ks.id, track: id, on: mineV });
            }).join('');
        }
        /** The bar: the lobby (seats, start, leave), the vote, practice's picks, an invite, watching, the touch controls. */
        function paintKart() {
            const el = kEl();
            if (!el) return;
            const L = kMine(), t = now();
            let html = '';
            if (L && L.state === 'lobby' && L.kind === 'practice') {
                const last = (L.times || []).slice(-1)[0];
                html = '<p>🏁 <b>Practice</b>' + (last ? ' · last: ' + esc(trackName(last.track)) + ' ' + kTime(last.ms) : '') + (L.circuit && last ? ' · circuit ' + kTime(L.times.slice(-L.circuit.n).reduce((a, x) => a + x.ms, 0)) : '') + '</p>' +
                    '<div class="hk-tracks">' + kBtn('start', '🔁 ' + esc(trackName(L.track.id)) + ' again', { id: L.id, track: L.track.id, go: true }) + kBtn('start', '🏆 Circuit (all six)', { id: L.id, track: 'circuit' }) + '</div>' +
                    '<div class="hk-tracks">' + TRACKS.map(([id, name]) => kBtn('start', esc(name), { id: L.id, track: id })).join('') + '</div>' +
                    '<div>' + kBtn('leave', 'Leave', { id: L.id }) + KEYS_BTN + '</div>';
            } else if (L && L.state === 'lobby') {
                const host = L.host === me, left = Math.ceil(Math.max(0, (L.until || 0) / 1000 - (t - L.got)));
                html = '<p>🏁 <b>Super Nice Kart</b> · ' + kHostName(L) + ' race · ' + esc(trackName(L.track.id)) + ' · ' + (L.laps === 1 ? '1 lap' : L.laps + ' laps') + ' · ' + L.seats.length + '/' + KART_MAX + '</p>' +
                    '<p class="hg-dim">' + L.seats.map(h => esc(nameOf(h)) + (h === L.host ? ' ⭐' : '')).join(' · ') + '</p>' +
                    (L.kind === 'station' ? '<p class="hg-dim">Starts in ' + left + 's</p>' : !host ? '<p class="hg-dim">Waiting for ' + esc(nameOf(L.host)) + ' to start it…</p>' : '<p class="hg-dim">Invite someone: click them → 🎮 Games → Super Nice Kart</p>') +
                    '<div>' + (host && L.kind !== 'station' ? kBtn('start', '🏁 Start', { id: L.id, go: true }) : '') + kBtn('leave', 'Leave', { id: L.id }) + KEYS_BTN + '</div>';
            } else if (L && L.state === 'vote') {
                html = '<p>🗳 <b>Next track</b> · ' + Math.ceil(kLeft()) + 's</p><div class="hk-tracks">' + kTrackBtns('vote', L.votes || {}) + '</div><div>' + kBtn('leave', 'Leave', { id: L.id }) + '</div>';
            } else if (L && (L.state === 'count' || L.state === 'race') && kRacer(me) && coarse) {
                html = '<div class="hk-pad"><button type="button" class="btn" data-ktouch="-1">◀</button><button type="button" class="btn" data-ktouch="b">🛑</button><button type="button" class="btn" data-ktouch="n">🔥</button><button type="button" class="btn" data-ktouch="1">▶</button></div>';
            } else if (L && (L.state === 'count' || L.state === 'race' || L.state === 'results')) {
                html = '<div>' + kBtn('leave', 'Leave the race', { id: L.id }) + '</div>';
            } else if (!L && kInvite && kLob.has(kInvite.id)) {
                const I = kLob.get(kInvite.id), full = I.seats.length >= KART_MAX;
                html = '<p>🏁 ' + (kInvite.from ? '<b>' + esc(nameOf(kInvite.from)) + '</b> invites you to <b>Super Nice Kart</b>' : 'A <b>Super Nice Kart</b> race is open for the room') + ' · ' + esc(trackName(I.track.id)) + ' · ' + I.seats.length + '/' + KART_MAX + '</p>' +
                    '<div>' + (full ? '' : kBtn('join', 'Join', { id: I.id, go: true })) + kBtn('watch', '📺 Watch', { id: I.id }) + kBtn('nothanks', 'No thanks') + '</div>';
            } else if (!L && kartView()) {
                html = '<div>' + (ks.kind !== 'practice' && (ks.seats || []).length < KART_MAX ? kBtn('join', '🏁 Join (next race)', { id: ks.id, go: true }) : '') + kBtn('unwatch', '🏠 Back to the room') + '</div>';
            }
            if (el.innerHTML !== html) el.innerHTML = html;
            el.hidden = !html;
            el.classList.toggle('hk-race', kartView());
            stage.classList.toggle('hall-racing', kartView());
        }
        /* On a touchscreen the kart goes by itself: hold ◀ or ▶ to steer, 🛑 to brake. Double-tap ◀ or ▶ (and hold
           it) to drift; let go and the drift ends in a boost. Each finger counts on its own, so lifting one
           doesn't let go of the others. */
        const kTouchSync = () => {
            if (!kTouch) return;
            let steer = 0, brake = 0, drift = false;
            for (const f of kFingers.values()) { if (f.k === 'b') brake = 1; else { steer += f.k; if (f.drift) drift = true; } }
            // The drift is over: the boost, as if the gas were tapped just after it ends (the gas is always on here).
            if (kTouch.drift && !drift) kGasTap = now() + 0.06;
            kTouch.steer = Math.max(-1, Math.min(1, steer)); kTouch.brake = brake; kTouch.drift = drift;
        };
        box.addEventListener('pointerdown', (e) => {
            const b = e.target.closest('[data-ktouch]');
            if (!b) return;
            e.preventDefault(); e.stopPropagation();
            kTouch = kTouch || { steer: 0, brake: 0 };
            const kt = b.dataset.ktouch;
            if (kt === 'n') { kTouch.nitro = true; return; }
            if (kt === 'b') kFingers.set(e.pointerId, { k: 'b' });
            else {
                const dir = Number(kt), t = now(), twice = kLastTap.dir === dir && t - kLastTap.at < 0.3;
                kFingers.set(e.pointerId, { k: dir, drift: twice });
                kLastTap = { dir: twice ? 0 : dir, at: t };
            }
            kTouchSync();
        }, true);
        const kUp = (e) => { if (kFingers.delete(e.pointerId)) kTouchSync(); };
        listen('pointerup', kUp); listen('pointercancel', kUp);
        /* ⌨ Keys: the race's keys, two for each action. Click one, press a key (Esc: none). */
        const KEYS_BTN = '<button type="button" class="btn" data-kkeys title="Choose your race keys">⌨ Keys</button>';
        const kKeysEl = () => $('.hall-kkeys', box);
        function paintKeys() {
            const el = kKeysEl();
            if (!el) return;
            el.innerHTML = '<h3>🏁 Race keys</h3><table>' + KART_ACTS.map(([id, name]) => '<tr><td>' + name + '</td>' + [0, 1].map(i => {
                const k = kKeys[id][i], wait = kKeyWait === id + ':' + i;
                return '<td><button type="button" class="btn' + (wait ? ' on' : '') + '" data-kk="' + id + ':' + i + '">' + (wait ? 'press a key…' : k ? esc(kKeyName(k)) : '+') + '</button></td>';
            }).join('') + '</tr>').join('') + '</table>' +
                '<p class="hg-dim">' + (kKeyWait ? 'Press a key for it (Esc: none).' : 'Click a key to change it.') + ' A controller works too: A go, B brake, a bumper drifts, X or Y fires a nitro.</p>' +
                '<div class="row"><button type="button" class="btn" data-kkreset>Back to the usual</button><button type="button" class="btn go" data-kkdone>Done</button></div>';
        }
        box.addEventListener('click', (e) => {
            if (e.target.closest('[data-kkeys]')) { e.stopPropagation(); const el = kKeysEl(); el.hidden = !el.hidden; kKeyWait = ''; paintKeys(); return; }
            const el = kKeysEl();
            if (!el || !el.contains(e.target)) return;
            e.stopPropagation();
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.kk) kKeyWait = kKeyWait === b.dataset.kk ? '' : b.dataset.kk;
            else if ('kkreset' in b.dataset) { for (const [id] of KART_ACTS) kKeys[id] = KKEYS0[id].slice(); kSaveKeys(); kKeyWait = ''; }
            else if ('kkdone' in b.dataset) { el.hidden = true; kKeyWait = ''; }
            paintKeys();
        }, true);
        /** Choosing a race key: this key for that action (and off any other action that had it). True when it was that. */
        function kartKeyPick(e) {
            if (!kKeyWait) return false;
            e.preventDefault();
            const [id, i] = kKeyWait.split(':');
            if (e.key === 'Escape') kKeys[id][+i] = '';
            else {
                const k = kNorm(e.key);
                for (const [o] of KART_ACTS) kKeys[o] = kKeys[o].map(x => (x === k ? '' : x));
                kKeys[id][+i] = k;
            }
            kSaveKeys(); kKeyWait = ''; paintKeys();
            return true;
        }
        listen('keyup', (e) => { const a = kActOf(e.key); if (a) kHeld.delete(a); });
        listen('blur', () => kHeld.clear());
        const kT = setInterval(() => { if (ks.state || kInvite || kMine()) paintKart(); }, 250);
        offs.push(() => clearInterval(kT));

        /* ---------- RADIOMAN: TO THE DEATH (engine/hall-boss.js) ----------
           The room falls apart and everyone's in a plane in the sky after Radioman. Your plane: WASD,
           the arrows, a controller, or drag anywhere (it keeps its distance from your finger); Shift
           flies slow and careful; it shoots by itself. Space (or B, or a double tap) is a bomb: every
           bullet on screen gone, and a big hit on him. Three hits and you're a ghost, till someone
           flying sits on you a moment. His attacks are worked out here from the pattern and its moment
           (RM_PAT), the same on every app; each app judges its own plane's hits. */
        const RM_SPEED = 95, RM_SLOW = 40, RM_SHOT = 0.2, RM_SHOT_V = 260, RM_INV = 2, RM_REVIVE = [14, 1.2];
        const RM_BOX = { x0: -22, x1: 22, y0: -28, y1: 28 };            // where his shots hit him, round his middle
        const RM_WORDS = { fall: 'LE RADIOMAN LOVES YOU!', win: 'AAAAAAAAAAAAAAAAAA', lose: 'MUAHAHAHAHA' };
        let rm = { state: '' }, rmSnap = null, rmStateAt = 0, rmMe = null, rmHurtAt = -9, rmHits = 0, rmHitSent = 0, rmClearAt = -9, rmBombAt = -9, rmBomber = '';
        let rmDrag = null, rmTap = 0, rmPhaseAt = -9, rmLastSent = 0, rmRevive = null;
        const rmPats = [], rmShots = [], rmPos = new Map(), rmDown = new Map(), rmUp = new Map(), rmSparks = [];
        const rmOn = () => !!rm.state;
        const rmLives = (h) => (rm.fighters && rm.fighters[h] ? rm.fighters[h][0] : 0);
        const rmIn = (h) => !!(rm.fighters && rm.fighters[h]);
        const rmFlying = () => rm.state === 'fly' || rm.state === 'fight';
        // engine/hall-boss.js bossAt, unrounded (smooth here); his middle s seconds into the fight.
        const rmAt = (s) => [196 + 9 * Math.sin(s * 0.8), 72 + 36 * Math.sin(s * 0.55) + 7 * Math.sin(s * 1.7)];
        const rmFt = () => (rm.ftAt == null ? 0 : rm.endFt != null ? rm.endFt : now() - rm.ftAt);
        function onRm(m, quiet) {
            const t = now(), was = rm.state;
            rm = { state: m.state || '', until: t + (m.until || 0) / 1000, hp: m.hp || 0, max: m.max || 1, phase: m.phase || 0, fighters: m.fighters || {},
                ftAt: m.state === 'fight' ? t - (m.ft || 0) / 1000 : rm.ftAt, endFt: m.state === 'win' || m.state === 'lose' || m.state === 'land' ? (m.ft || 0) / 1000 : null,
                mvp: m.mvp || '', stars: m.stars || [], dmg: m.dmg || {} };
            if (!rm.state) { rmSnap = null; rmMe = null; rmPats.length = 0; rmShots.length = 0; rmPos.clear(); rmDown.clear(); rmUp.clear(); rmDrag = null; return; }
            if (rm.state === was) return;
            rmStateAt = t;
            if (rm.state === 'fall') {
                // A picture of the room as it was, to break into pieces (and put back together after).
                rmSnap = document.createElement('canvas'); rmSnap.width = A.W; rmSnap.height = A.H;
                if (!quiet) rmSnap.getContext('2d').drawImage(low, 0, 0); else rmSnap = null;
                keys.clear();
                if (!quiet) logLine({ text: '📻 LE RADIOMAN LOVES YOU! Everyone into a plane!' }, 'announce');
            }
            if (rm.state === 'fight' && !quiet) logLine({ text: '✈️ Fly with WASD or the arrows (or drag), Shift to slow down, Space for a bomb. Your plane shoots by itself!' }, 'game');
            if (rm.state === 'win') {
                for (const h of rm.stars) { const p = people.get(h); if (p) p.star = starTill(true); }
                if (!quiet) logLine({ text: '📻 AAAAAAAAAAAAAAAAAA! Radioman is down! ' + (rm.stars.length ? rm.stars.map(nameOf).join(', ') + ' made it ⭐' : '') + (rm.mvp ? ' · Most damage: ' + nameOf(rm.mvp) + ' (' + rm.dmg[rm.mvp] + ')' : '') }, 'announce');
                if (rm.stars.includes(me) && !quiet) U.toast('You beat Radioman! ⭐');
            }
            if (rm.state === 'lose' && !quiet) logLine({ text: '📻 Radioman wins. MUAHAHAHAHA' + (rm.mvp ? ' (Most damage: ' + nameOf(rm.mvp) + ', ' + rm.dmg[rm.mvp] + ')' : '') }, 'announce');
        }
        function rmMsg(m) {
            const t = now();
            switch (m.t) {
                case 'hall-rm': return onRm(m);
                case 'hall-rm-p': rmPats.push({ k: m.k, at: t, x: m.x, y: m.y, tx: m.tx, ty: m.ty, seed: m.seed || 1 }); return;
                case 'hall-rm-at':
                    for (const [h, xy] of Object.entries(m.at || {})) {
                        if (h === me && rmMe) continue;
                        const q = rmPos.get(h);
                        if (q) { q.tx = xy[0]; q.ty = xy[1]; } else rmPos.set(h, { x: xy[0], y: xy[1], tx: xy[0], ty: xy[1], shotAt: t + Math.random() * RM_SHOT });
                        if (h === me && !rmMe) rmMe = { x: xy[0], y: xy[1], kx: 0, shotAt: t };
                    }
                    return;
                case 'hall-rm-hp':
                    if (m.phase > rm.phase) { rmPhaseAt = t; logLine({ text: m.phase === 2 ? '📻 Radioman’s eyes glow red. SHOW ME YOUR TRUE POWER!' : '📻 Radioman is getting angry!' }, 'announce'); }
                    rm.hp = m.hp; rm.phase = m.phase;
                    return;
                case 'hall-rm-ouch':
                    if (rm.fighters[m.h]) rm.fighters[m.h][0] = m.lives;
                    if (m.lives <= 0) { rmDown.set(m.h, t); logLine({ text: '💥 ' + nameOf(m.h) + ' was shot down! Fly over them to bring them back.' }, 'game'); }
                    return;
                case 'hall-rm-bomb':
                    if (rm.fighters[m.h]) rm.fighters[m.h][1] = m.bombs;
                    rmClearAt = t; rmBombAt = t; rmBomber = m.h;
                    return;
                case 'hall-rm-up':
                    if (rm.fighters[m.h]) rm.fighters[m.h][0] = 1;
                    rmDown.delete(m.h); rmUp.set(m.h, t);
                    if (m.h === me && rmMe) rmMe.inv = t + RM_INV;
                    logLine({ text: '😇 ' + nameOf(m.by) + ' brought ' + nameOf(m.h) + ' back!' }, 'game');
                    return;
            }
        }
        /* His attacks, as bullets: where each one is at time t (and when it was fired, for a bomb's clearing).
           Everything follows from the attack's moment, place, aim and seed, so every app sees the same. */
        const rmRand = (seed, i) => { const r = Math.sin((seed + i * 97) * 12.9898) * 43758.5453; return r - Math.floor(r); };
        const RM_PAT = {
            wave(e, a, out) {                       // radio waves: three fans of arcs, out towards the planes
                for (let j = 0; j < 3; j++) {
                    const s = a - j * 0.3;
                    if (s < 0) continue;
                    for (let i = 0; i < 9; i++) {
                        const ang = Math.PI + (i - 4) * 0.22 + (j % 2) * 0.11, d = 52 * s, w = 2.5 * Math.sin(s * 9 + i);
                        out.push({ k: 'wave', a: ang, x: e.x + Math.cos(ang) * d - Math.sin(ang) * w, y: e.y + Math.sin(ang) * d + Math.cos(ang) * w, r: 2, born: e.at + j * 0.3 });
                    }
                }
            },
            notes(e, a, out) {                      // a tune: ten notes in a wobbly line at someone
                const base = Math.atan2(e.ty - e.y, e.tx - e.x);
                for (let i = 0; i < 10; i++) {
                    const s = a - i * 0.13;
                    if (s < 0) break;
                    const ang = base + (rmRand(e.seed, i) - 0.5) * 0.12, d = 72 * s, w = 5 * Math.sin(s * 7 + i);
                    out.push({ k: 'note', i, a: ang, x: e.x + Math.cos(ang) * d - Math.sin(ang) * w, y: e.y + Math.sin(ang) * d + Math.cos(ang) * w, r: 2, born: e.at + i * 0.13 });
                }
            },
            poop(e, a, out) {                       // a poop grenade: lobbed at someone, then BANG, bits everywhere
                if (a < 1) { out.push({ k: 'poop', x: e.x + (e.tx - e.x) * a, y: e.y + (e.ty - e.y) * a - 34 * Math.sin(Math.PI * a), r: 3, born: e.at }); return; }
                const s = a - 1, r0 = rmRand(e.seed, 0) * Math.PI;
                for (let i = 0; i < 14; i++) {
                    const ang = r0 + i / 14 * Math.PI * 2, d = 46 * s;
                    out.push({ k: 'bit', x: e.tx + Math.cos(ang) * d, y: e.ty + Math.sin(ang) * d, r: 2, born: e.at + 1 });
                }
            },
            fart() {},                              // no bullets: it pushes (rmFart)
            static(e, a, out) {                     // static: fuzz falling from the top
                for (let i = 0; i < 18; i++) {
                    const s = a - i * 0.07;
                    if (s < 0) break;
                    out.push({ k: 'static', x: 12 + rmRand(e.seed, i) * 200 + 6 * Math.sin(s * 5 + i), y: -4 + 58 * s, r: 1.5, born: e.at + i * 0.07 });
                }
            },
            spiral(e, a, out) {                     // the last third: two arms turning out of him
                const a0 = rmRand(e.seed, 0) * Math.PI * 2;
                for (let i = 0; i < 40; i++) {
                    const s = a - i * 0.08;
                    if (s < 0) break;
                    for (const arm of [0, Math.PI]) {
                        const ang = a0 + i * 0.33 + arm, d = 56 * s;
                        out.push({ k: 'spiral', x: e.x + Math.cos(ang) * d, y: e.y + Math.sin(ang) * d, r: 2, born: e.at + i * 0.08 });
                    }
                }
            }
        };
        const RM_FART = { warn: 0.8, last: 2.2, half: 0.38, push: 520 };
        /** The fart going on (he's turned round for it), if any: { e, s (seconds since it went off), reach }. */
        function rmFart(t) {
            for (const e of rmPats) {
                if (e.k !== 'fart') continue;
                const a = t - e.at;
                if (a >= 0 && a < RM_FART.last) return { e, a, s: a - RM_FART.warn, reach: Math.min(230, 230 * Math.max(0, a - RM_FART.warn) / 0.5) };
            }
            return null;
        }
        function rmBullets(t) {
            const out = [];
            for (let i = rmPats.length - 1; i >= 0; i--) {
                const e = rmPats[i], a = t - e.at;
                if (a > 7) { rmPats.splice(i, 1); continue; }
                if (a >= 0) RM_PAT[e.k] && RM_PAT[e.k](e, a, out);
            }
            return out.filter(b => b.born >= rmClearAt && b.x > -10 && b.x < A.W + 10 && b.y > -10 && b.y < A.H + 10);
        }
        /** Where Radioman is (and how he looks) right now. */
        function rmBossNow(t) {
            const s = t - rmStateAt;
            if (rm.state === 'fly') { const [x, y] = rmAt(0), k = Math.max(0, 1 - s / (rm.until - rmStateAt || 1)); return [x + 90 * k * k, y]; }
            if (rm.state === 'win') { const [x, y] = rmAt(rmFt()); return s < 2.6 ? [x + Math.sin(s * 40) * 2, y] : [x + (s - 2.6) * 10, y + 60 * (s - 2.6) * (s - 2.6)]; }
            if (rm.state === 'lose') return [A.W / 2 + Math.sin(t * 2) * 6, A.H / 2 - 4 + Math.sin(t * 3) * 3];
            return rmAt(rmFt());
        }

        /** Each frame of the fight: your plane, your shots, his bullets against you, the others gliding along. */
        function rmStep(dt) {
            const t = now(), alive = rmLives(me) > 0;
            if (rmFlying() && rmIn(me)) {
                if (!rmMe) rmMe = { x: 30 + Math.random() * 40, y: 30 + Math.random() * 90, kx: 0, shotAt: t };
                const p = rmMe, slow = sprintKey || keys.has('shift'), sp = slow ? RM_SLOW : RM_SPEED;
                const push = pushing();
                if (push) { p.x += push[0] * sp * dt; p.y += push[1] * sp * dt; rmDrag = null; }
                else if (rmDrag && rmDrag.tx != null) {
                    const dx = rmDrag.tx - p.x, dy = rmDrag.ty - p.y, d = Math.hypot(dx, dy), go = Math.min(d, sp * 1.4 * dt);
                    if (d > 0.3) { p.x += dx / d * go; p.y += dy / d * go; }
                }
                // The fart: pushed back, hard.
                const f = rmFart(t);
                if (f && f.s >= 0) {
                    const dx = p.x - f.e.x, dy = p.y - f.e.y, d = Math.hypot(dx, dy), ang = Math.abs(Math.atan2(dy, -dx));
                    if (d < f.reach && ang < RM_FART.half) p.kx -= RM_FART.push * dt;
                }
                p.x += p.kx * dt; p.kx *= Math.exp(-dt * 3);
                p.x = Math.max(6, Math.min(176, p.x)); p.y = Math.max(8, Math.min(A.H - 8, p.y));
                if (t - rmLastSent > 0.08 && (Math.abs(p.x - (p.sx || 0)) > 0.5 || Math.abs(p.y - (p.sy || 0)) > 0.5)) {
                    rmLastSent = t; p.sx = p.x; p.sy = p.y;
                    core.send({ t: 'hall-rm-at', x: Math.round(p.x), y: Math.round(p.y) });
                }
                if (rm.state === 'fight') {
                    // Bring a ghost back: sit on them a moment.
                    if (alive) {
                        const g = [...rmPos].find(([h, q]) => h !== me && rmIn(h) && rmLives(h) <= 0 && Math.hypot(q.x - p.x, q.y - p.y) < RM_REVIVE[0]);
                        if (!g) rmRevive = null;
                        else if (!rmRevive || rmRevive.h !== g[0]) rmRevive = { h: g[0], at: t };
                        else if (t - rmRevive.at > RM_REVIVE[1]) { core.send({ t: 'hall-rm-revive', to: g[0] }); rmRevive = { h: g[0], at: t + 2 }; }
                    }
                    // Your hits: anything of his touching your cockpit (not while you're flashing).
                    if (alive && !(p.inv > t)) {
                        for (const b of rmBullets(t)) {
                            if (Math.hypot(b.x - p.x, b.y - (p.y - 2)) < b.r + 1.5) {
                                p.inv = t + RM_INV; rmHurtAt = t;
                                core.send({ t: 'hall-rm-ouch' });
                                break;
                            }
                        }
                    }
                }
            }
            // Shots: yours count (the ones that hit him, told to the station a couple of times a second); the others' are for show.
            const [bx, by] = rmBossNow(t);
            if (rm.state === 'fight') {
                const shoot = (h, x, y, mine) => { rmShots.push({ x: x + 10, y: y + 1, mine }); rmShots.push({ x: x + 10, y: y + 4, mine }); };
                if (rmMe && alive && t - rmMe.shotAt >= RM_SHOT) { rmMe.shotAt = t; shoot(me, rmMe.x, rmMe.y, true); }
                for (const [h, q] of rmPos) if (h !== me && rmLives(h) > 0 && t - q.shotAt >= RM_SHOT) { q.shotAt = t; shoot(h, q.x, q.y, false); }
            }
            for (let i = rmShots.length - 1; i >= 0; i--) {
                const s = rmShots[i];
                s.x += RM_SHOT_V * dt;
                if (rm.state === 'fight' && s.x >= bx + RM_BOX.x0 && s.x <= bx + RM_BOX.x1 && s.y >= by + RM_BOX.y0 && s.y <= by + RM_BOX.y1) {
                    if (s.mine) { rmHits++; rmHurtAt = Math.max(rmHurtAt, -9); rm.hitFlash = t; }
                    rmSparks.push({ x: s.x, y: s.y, at: t });
                    rmShots.splice(i, 1);
                } else if (s.x > A.W + 4) rmShots.splice(i, 1);
            }
            while (rmSparks.length && t - rmSparks[0].at > 0.2) rmSparks.shift();
            if (rmHits && t - rmHitSent > 0.4) { rmHitSent = t; core.send({ t: 'hall-rm-hit', n: rmHits }); rmHits = 0; }
            // Everyone else's planes glide to where the station last had them.
            for (const q of rmPos.values()) { const k = 1 - Math.exp(-dt * 10); q.x += (q.tx - q.x) * k; q.y += (q.ty - q.y) * k; }
        }
        function rmBomb() {
            if (rm.state !== 'fight' || rmLives(me) <= 0 || !(rm.fighters[me] && rm.fighters[me][1] > 0)) return;
            core.send({ t: 'hall-rm-bomb' });
        }

        /** The whole picture during the fight (in place of the room). */
        function rmFrame(t, dt) {
            const s = t - rmStateAt, st = rm.state;
            lc.imageSmoothingEnabled = false;
            A.rmSky(lc, t, rm.phase === 2 ? 0.5 + 0.2 * Math.sin(t * 3) : rm.phase * 0.2);
            if (rmSnap && st === 'fall') A.rmShatter(lc, rmSnap, s, false);
            if (rmSnap && st === 'land') A.rmShatter(lc, rmSnap, s, true);
            else if (st === 'land') { lc.globalAlpha = Math.min(1, s / 2); lc.fillStyle = '#1a1238'; lc.fillRect(0, 0, A.W, A.H); lc.globalAlpha = 1; }
            const [bx, by] = rmBossNow(t), fart = rmFart(t), boss = st !== 'fall' && st !== 'land';
            if (boss && !(st === 'win' && s > 5)) {
                if (fart && fart.s >= 0) A.rmFart(lc, fart.e.x + 10, fart.e.y + 4, fart.s, fart.reach, RM_FART.half);
                A.rmBoss(lc, bx, by, t, { turned: !!fart, hurt: rm.hitFlash && t - rm.hitFlash < 0.06, angry: rm.phase === 2, laugh: st === 'lose' });
            }
            if (st === 'win' && s < 3.2) for (let i = 0; i < 4; i++) { const k = (s * 3 + i * 0.37) % 1; A.explosion(lc, bx - 20 + rmRand(Math.floor(s * 3) + i, 1) * 40, by + 10 - rmRand(Math.floor(s * 3) + i, 2) * 40, 0.13 + k * 0.6); }
            if (st === 'fight' || st === 'win' || st === 'lose') for (const b of rmBullets(t)) A.rmBullet(lc, b, t);
            for (const e of rmPats) if (e.k === 'poop' && t - e.at >= 1 && t - e.at < 1.4) A.explosion(lc, e.tx, e.ty + 8, 0.13 + (t - e.at - 1) * 1.5);
            lc.fillStyle = '#ffe14d';
            for (const sh of rmShots) lc.fillRect(Math.round(sh.x), Math.round(sh.y), 3, 1);
            for (const sp of rmSparks) A.sparkle(lc, sp.x, sp.y + 2, (t - sp.at) / 0.2);
            // The planes (yours last, on top); in the shattering and the landing, nobody's flying yet.
            const planes = [];
            if (st !== 'fall' && st !== 'land') {
                for (const [h, q] of rmPos) if (h !== me) planes.push([h, q.x, q.y]);
                if (rmMe && rmIn(me)) planes.push([me, rmMe.x, rmMe.y]);
                const flyIn = st === 'fly' ? Math.max(0, 1 - s / 1.6) : 0;
                for (const [h, x0, y] of planes) {
                    const p = people.get(h);
                    if (!p) continue;
                    const down = rmDown.get(h), ghost = rmLives(h) <= 0 && rmIn(h);
                    let x = x0 - flyIn * flyIn * 140, yy = y;
                    if (down && t - down < 1.2) { const k = t - down; x += k * 30; yy += 80 * k * k; }            // spinning down, smoking
                    const blink = h === me && rmMe && rmMe.inv > t && Math.floor(t * 12) % 2;
                    if (blink) continue;
                    A.rmPlane(lc, p.l, x, yy, t, { tint: p.c || PLANE_TINT[hashH(h) % PLANE_TINT.length], ghost: ghost && !(down && t - down < 1.2) });
                    if (down && t - down < 1.2) A.explosion(lc, x, yy + 6, 0.13 + (t - down) * 0.5);
                    const up = rmUp.get(h);
                    if (up && t - up < 1) A.sparkle(lc, x, yy, t - up); else if (up) rmUp.delete(h);
                }
            }
            if (rmBombAt > 0 && t - rmBombAt < 0.6) {                    // a bomb: a white flash and a ring going out
                const k = (t - rmBombAt) / 0.6, q = rmBomber === me ? rmMe : rmPos.get(rmBomber);
                lc.globalAlpha = 0.6 * (1 - k); lc.fillStyle = '#ffffff'; lc.fillRect(0, 0, A.W, A.H);
                if (q) { lc.globalAlpha = 1 - k; lc.strokeStyle = '#ffe14d'; lc.lineWidth = 2; lc.beginPath(); lc.arc(q.x, q.y, 10 + k * 220, 0, Math.PI * 2); lc.stroke(); }
                lc.globalAlpha = 1;
            }
            // Onto the screen, then the words at screen size.
            ctx.imageSmoothingEnabled = false;
            const shake = (st === 'fall' && s > 0.3 && s < 2.4) || (rmHurtAt > 0 && t - rmHurtAt < 0.25) || (fart && fart.s >= 0 && fart.s < 0.5) || (st === 'win' && s < 3) ? cv.width / A.W * 2 : 0;
            ctx.drawImage(low, Math.round((Math.random() - 0.5) * shake), Math.round((Math.random() - 0.5) * shake), cv.width, cv.height);
            if (rmHurtAt > 0 && t - rmHurtAt < 0.3) { ctx.fillStyle = 'rgba(255,30,40,' + (0.35 * (1 - (t - rmHurtAt) / 0.3)) + ')'; ctx.fillRect(0, 0, cv.width, cv.height); }
            const u = cv.width / A.W;
            rmHud(t, u, planes, bx, by, fart);
        }
        const PLANE_TINT = ['#d0302a', '#2a7ad0', '#2aa04a', '#d0a02a', '#8a3ad0', '#d05a9a'];
        const hashH = (h) => [...String(h)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        /** His health, your hearts and bombs, names, chat bubbles and the big words. */
        function rmHud(t, u, planes, bx, by, fart) {
            const st = rm.state, s = t - rmStateAt;
            const big = (str, y, c, wob) => {
                const fs = Math.max(16, Math.round(9 * u / dpr)) * dpr;
                ctx.font = 'bold ' + fs + 'px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const yy = y + (wob ? Math.sin(t * 30) * 2 * dpr : 0);
                ctx.fillStyle = '#000'; ctx.fillText(str, cv.width / 2 + 2 * dpr, yy + 2 * dpr);
                ctx.fillStyle = c; ctx.fillText(str, cv.width / 2, yy);
            };
            if (st === 'fight' || st === 'fly') {
                // His health along the top.
                const w = cv.width * 0.6, x = (cv.width - w) / 2, y = 4 * u, h = 3 * u, k = Math.max(0, rm.hp / rm.max);
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - u, y - u, w + 2 * u, h + 2 * u);
                ctx.fillStyle = ['#ffd34a', '#ff8a2a', '#ff2a40'][rm.phase || 0]; ctx.fillRect(x, y, w * k, h);
                const fs = Math.max(10, Math.round(2.6 * u / dpr)) * dpr;
                ctx.font = 'bold ' + fs + 'px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
                ctx.fillStyle = '#ffffff'; ctx.fillText('LE RADIOMAN', cv.width / 2, y + h + u);
                // Yours, bottom left: hearts and bombs (or how to come back).
                if (rmIn(me)) {
                    const f = rm.fighters[me];
                    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.font = 'bold ' + Math.round(fs * 1.3) + 'px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
                    ctx.fillText(f[0] > 0 ? '❤️'.repeat(f[0]) + '  ' + '💣'.repeat(f[1]) : '👻', 3 * u, cv.height - 2 * u);
                    if (f[0] <= 0) { ctx.font = 'bold ' + fs + 'px "Courier New", monospace'; ctx.fillStyle = '#e6e0f2'; ctx.fillText('Shot down — someone can fly over you to bring you back', 12 * u, cv.height - 3 * u); }
                } else {
                    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#e6e0f2';
                    ctx.fillText('Watching the fight', 3 * u, cv.height - 2 * u);
                }
            }
            // Names under the planes, and what they say over them.
            const nfs = Math.max(9, Math.round(2.2 * u / dpr)) * dpr;
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            for (const [h, x, y] of planes) {
                const p = people.get(h);
                if (!p) continue;
                ctx.font = 'bold ' + nfs + 'px "Courier New", monospace';
                ctx.globalAlpha = rmLives(h) > 0 ? 1 : 0.5;
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(p.n, x * u + dpr, (y + 7) * u + dpr);
                ctx.fillStyle = p.c || (h === me ? '#ffd34a' : '#e6e0f2'); ctx.fillText(p.n, x * u, (y + 7) * u);
                ctx.globalAlpha = 1;
                if (p.sayUntil > t) bubble(p.say, x * u, (y - 18) * u, u);
            }
            if (rmRevive && rmRevive.at <= t) {
                const q = rmPos.get(rmRevive.h);
                if (q) popWord('…' + Math.ceil(RM_REVIVE[1] - (t - rmRevive.at)), q.x * u, (q.y - 22) * u, u, '#9affc0');
            }
            if (fart && fart.a < RM_FART.warn + 0.8) popWord(fart.s < 0 ? 'uh oh…' : 'BRRRAAAP!', (bx - 10) * u, (by - 40) * u, u * (fart.s < 0 ? 1 : 1.6), '#8ad040');
            if (st === 'fall' && s > 0.4) big(RM_WORDS.fall, cv.height * 0.3, '#ff3b5c', true);
            if (st === 'fly') big('GET READY!', cv.height * 0.4, '#ffe14d', false);
            if (st === 'fight' && t - rmPhaseAt < 2) big(rm.phase === 2 ? 'SHOW ME YOUR TRUE POWER!' : 'HE’S ANGRY NOW!', cv.height * 0.35, '#ff3b5c', true);
            if (st === 'win' && s > 2.6) big(RM_WORDS.win, cv.height * 0.35, '#ffe14d', false);
            if (st === 'lose') big(RM_WORDS.lose, cv.height * 0.25, '#ff3b5c', true);
        }
        // On a phone (or with the mouse): drag anywhere and your plane follows, keeping its distance; a double tap is a bomb.
        stage.addEventListener('pointerdown', (e) => {
            if (!rmOn() || e.target !== cv) return;
            const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * A.W, y = (e.clientY - r.top) / r.height * A.H, t = now();
            if (t - rmTap < 0.3) rmBomb();
            rmTap = t;
            if (rmMe) rmDrag = { ox: rmMe.x - x, oy: rmMe.y - y, tx: rmMe.x, ty: rmMe.y };
        });
        listen('pointermove', (e) => {
            if (!rmDrag) return;
            const r = cv.getBoundingClientRect();
            rmDrag.tx = (e.clientX - r.left) / r.width * A.W + rmDrag.ox; rmDrag.ty = (e.clientY - r.top) / r.height * A.H + rmDrag.oy;
        });
        listen('pointerup', () => { rmDrag = null; });

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
        /* Games others can join (not the board games: their tables have their own sign): whoever opened one sits
           at a CRT beside them, a sign over it saying what it is and how many seats are left. Clicking the CRT is
           clicking them (their popup has Join / Watch). */
        function openGameOf(h) {
            for (const L of kLob.values()) if (L.kind === 'public' && L.state && L.host === h)
                return { kind: 'kart', id: L.id, name: 'SUPER NICE KART', icon: '🏁', n: (L.seats || []).length, max: KART_MAX, busy: L.state !== 'lobby' };
            return null;
        }
        const crtX = (p) => p.x + (p.face < 0 ? -12 : 12);
        /** Someone (not you) under the pointer, or their CRT: their feet are at (x, y), about 9×20 room pixels above that. */
        function personAt(x, y) {
            let hit = null;
            for (const q of people.values()) {
                if (q.h === me) continue;
                const onCrt = !q.walking && openGameOf(q.h) && Math.abs(crtX(q) - x) <= 9 && y <= q.y + 1 && y >= q.y - 22;
                if ((onCrt || (Math.abs(q.x - x) <= 5 && y <= q.y + 2 && y >= q.y - 20)) && (!hit || q.y > hit.y)) hit = q;
            }
            return hit;
        }
        stage.addEventListener('click', (e) => floorClick(e));
        function floorClick(e) {
            if (rmOn()) return;                                                 // in a plane: no walking
            if (kartView()) { if (!kRacer(me)) kWatchStep(1); return; }       // watching the race: the next kart
            if (hkView()) return;                                              // at the air hockey table
            const p = mine();
            if (!p) return;
            const [rx, ry] = roomXY(e);
            if (!skipClick && tvHit(e, rx, ry)) { if (!watch) startWatch(); return; }      // FunpostTV: sit down and watch
            const q = personAt(rx, ry);
            if (skipClick) { skipClick = false; return; }          // that was a throw (or a look round)
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
            const emo = (e, on) => '<button type="button" class="he-e' + (on ? ' on' : '') + '" data-em="' + esc(e) + '"' + (e === WATER ? ' title="Bottle of water">' + waterImg() : '>' + esc(e)) + '</button>';
            const pic = (k, on) => '<button type="button" class="he-e he-pic' + (on ? ' on' : '') + '" data-em=":' + esc(k) + ':" title=":' + esc(k) + ':"><img alt=":' + esc(k) + ':" src="' + esc(LT.EMOTES[k]) + '"></button>';
            emojiEl.innerHTML = '<div class="he-tabs">' + tab('say', '😀 Emote') + tab('hold', '✋ Hold') + tab('feel', '😊 Feel') +
                (held ? '<button type="button" class="btn" data-drop>Drop ' + heldHtml(held) + '</button>' : '') +
                '<span class="he-hint">' + (emojiTab === 'hold' ? 'Carry it around — everyone sees it' : emojiTab === 'feel' ? 'Your face shows it (pick again to stop)' : 'Adds it to what you’re typing') + '</span>' +
                '<button type="button" class="btn he-x" data-close title="Close">✕</button></div>' +
                '<div class="he-grid">' + (emojiTab === 'feel'
                    ? MOODS.map(([id, icon]) => '<button type="button" class="he-e' + (id === feel ? ' on' : '') + '" data-mood="' + id + '" title="' + id + '">' + icon + '</button>').join('')
                    // Hold: any emoji at all (typed or pasted), the station's pictures, things, then every other emoji there's a button for.
                    : emojiTab === 'hold' ? '<form class="he-any" data-any><input maxlength="40" placeholder="Any emoji, or a :code:" autocomplete="off"><button class="btn">✋ Hold it</button></form>' +
                        (pics.length ? '<div class="he-sub">Memeoji</div>' + pics.map(k => pic(k, ':' + k + ':' === held)).join('') : '') +
                        '<div class="he-sub">Things</div>' + HOLDS.map(e => emo(e, e === held)).join('') +
                        '<div class="he-sub">More</div>' + moreEmoji().map(e => emo(e, e === held)).join('')
                    // Emote: the station's own pictures first, then the emoji.
                    : (pics.length ? '<div class="he-sub">Memeoji</div>' + pics.map(k => pic(k, false)).join('') +
                        '<div class="he-sub">Emoji</div>' : '') + SAY.concat(HOLDS.filter(e => e !== WATER)).map(e => emo(e, false)).join('')) + '</div>';
        }
        const stationEmotes = () => Object.keys((window.LT && LT.EMOTES) || {});
        /** Every emoji with a button that isn't among the things to hold: the Emote tab's, then the chat's :codes: (™ too). */
        const moreEmoji = () => [...new Set(SAY.concat(Object.values((window.LT && LT.EMOJI) || {})))].filter(e => !HOLDS.includes(e) && ONE_EMOJI.test(e));
        /** What someone's holding, as HTML (the bottle and the station's pictures are pictures). */
        function heldHtml(o) {
            const k = emoteKey(o);
            if (o === WATER) return waterImg();
            if (k && window.LT && LT.EMOTES && LT.EMOTES[k]) return '<img class="he-held" alt=":' + esc(k) + ':" src="' + esc(LT.EMOTES[k]) + '">';
            return esc(o);
        }
        /** The Hold tab's box: one emoji, or a :code: (a station emote, or a chat code like :tm:). */
        function holdTyped(raw) {
            const t = String(raw || '').trim(), k = emoteKey(t.toLowerCase());
            const v = k && stationEmotes().includes(k) ? ':' + k + ':' : window.LT && LT.emojiCodes ? LT.emojiCodes(t).trim() : t;
            if (!emoteKey(v) && !ONE_EMOJI.test(v)) return U.toast('One emoji (or a :code:) to hold.');
            hold(v); emojiEl.hidden = true;
        }
        let auraColor = 'yellow';
        try { auraColor = localStorage.getItem('ltl.hallAuraColor') || 'natural'; } catch { /* default */ }
        if (!A.AURA_COLORS[auraColor] && auraColor !== 'rainbow' && auraColor !== 'natural') auraColor = 'natural';
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
        emojiEl.addEventListener('submit', (e) => {
            e.preventDefault(); e.stopPropagation();
            const f = e.target.closest('[data-any]');
            if (f) holdTyped($('input', f).value);
        });
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
                spot(p.x, p.y);
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
                spot(p.x, p.y);
                const f = p.face < 0 ? -1 : 1, x = (p.x + f * 6) * u, y = (heads.get(p.h) + 10) * u;
                const lit = p.o === BOMB && bomb && bomb.h === p.h, red = lit && bombBlink(x, y, fs, now());
                ctx.save();
                ctx.translate(Math.round(x), Math.round(y));
                const k = emoteKey(p.o), pic = k && emotePic(k);
                if (!pic && !READS.test(p.o)) ctx.scale(-f, 1);   // emoji face left; turn them the way their holder faces (not ™, flags or pictures)
                if (p.o === WATER) waterBottle(ctx, 0, 0, Math.max(1, Math.round(fs / 13)));
                else if (pic) { const fr = emoteNow(pic), sz = picSize(fr); if (sz) { const ph = fs * 1.4, pw = Math.min(ph * 1.5, ph * sz[0] / sz[1]); ctx.drawImage(fr, Math.round(-pw / 2), Math.round(-ph / 2), Math.round(pw), Math.round(ph)); } }
                else if (!k) ctx.fillText(p.o, 0, 0);
                if (red) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#ff1a1a'; ctx.beginPath(); ctx.arc(0, fs * 0.08, fs * 0.36, 0, Math.PI * 2); ctx.fill(); }
                if (lit) { ctx.globalAlpha = 1; ctx.fillStyle = Math.floor(now() * 20) % 2 ? '#fff3a0' : '#ff9a20'; ctx.fillRect(Math.round(fs * 0.22), Math.round(-fs * 0.5), Math.max(2, Math.round(fs / 7)), Math.max(2, Math.round(fs / 7))); }
                ctx.restore();
            }
        }

        /* ---------- ayy lmao (engine/hall-ayy.js): alien heads rain down; now and then a UFO takes someone ---------- */
        // The UFO (seconds from when it's sent): flies in, beams them up (UFO_UP to UFO_IN), flies off at UFO_OFF.
        const UFO_AT = 1.4, UFO_UP = 1.6, UFO_IN = 2.8, UFO_OFF = 3.0, UFO_GONE = 4.4;
        let ayyRain = null, ayyUfo = null, ayyMe = null;         // the heads; the UFO { h, x, y, at }; you, taken { at, backAt }
        const crops = [], CROP_S = 90;                           // crop circles where it took people { x, y, at }: CROP_S seconds, fading at the end
        const ayyAway = new Set();                               // who's up there
        function onAyy(m) {
            const t = now();
            if (m.rain) {
                const drops = [];
                for (let i = 0; i < 46; i++) drops.push({ x: Math.random() * A.W, d: Math.random() * 2.6, v: 45 + Math.random() * 40, w: Math.random() * 6.3, s: Math.random() < 0.25 ? 1.4 : 1 });
                ayyRain = { at: t, drops };
            }
            if (m.ufo) {
                const [x, y] = toPx(m.ufo.x, m.ufo.y), p = people.get(m.ufo.h);
                ayyUfo = { h: m.ufo.h, x, y, at: t };
                crops.push({ x, y, at: t + UFO_UP });                   // burnt in as the beam takes them
                if (crops.length > 8) crops.shift();
                ayyAway.add(m.ufo.h);
                if (p) Object.assign(p, { x, y, tx: x, ty: y, walking: false, real: null });
                if (m.ufo.h === me) { ayyMe = { at: t, backAt: 0 }; keys.clear(); }
                logLine({ text: '🛸 ' + nameOf(m.ufo.h) + ' was abducted!' }, 'announce');
            }
            if (m.back) {
                ayyAway.delete(m.back);
                const p = people.get(m.back);
                if (p) { const [x, y] = toPx(m.x, m.y); Object.assign(p, { x, y, tx: x, ty: y, walking: false, real: null }); }
                btBack.set(m.back, t);
                if (m.back === me) { if (ayyMe) ayyMe.backAt = t; lastSent = ''; gotPoint('ayy'); }
            }
        }
        /** Where the UFO is k seconds in (room pixels), and its beam (0–1). */
        function ufoAt(u, k) {
            const hx = u.x, hy = Math.max(14, u.y - 34), ease = (a) => a * a * (3 - 2 * a);
            if (k < UFO_AT) { const a = ease(k / UFO_AT); return { x: hx - 150 + 150 * a, y: -20 + (hy + 20) * a, beam: 0 }; }
            if (k < UFO_OFF) return { x: hx, y: hy + Math.sin(k * 5), beam: Math.min(1, (k - UFO_AT) / 0.2) * Math.min(1, (UFO_OFF - k) / 0.15) };
            const a = Math.min(1, (k - UFO_OFF) / (UFO_GONE - UFO_OFF));
            return { x: hx + 170 * a * a, y: hy - (hy + 30) * a * a, beam: 0 };
        }
        /** Taken: rising into the UFO (lift, room pixels; fading as they go), then not there at all. */
        function ayyLift(p, t) {
            if (!ayyAway.has(p.h)) return null;
            const u = ayyUfo && ayyUfo.h === p.h ? ayyUfo : null, k = u ? t - u.at : 99;
            if (k >= UFO_IN) return { gone: true };
            if (k < UFO_UP) return { lift: 0, a: 1 };
            const a = (k - UFO_UP) / (UFO_IN - UFO_UP), top = p.y - (ufoAt(u, k).y + 4);
            return { lift: Math.round(top * a * a), a: 1 - a * 0.7 };
        }
        /** In the room (behind the lights): the heads raining, and the UFO. */
        function drawAyy(t) {
            if (ayyRain) {
                let any = false;
                for (const r of ayyRain.drops) {
                    const k = t - ayyRain.at - r.d;
                    if (k < 0) { any = true; continue; }
                    const y = -8 + k * r.v;
                    if (y > A.H + 8) continue;
                    any = true;
                    const hx = r.x + Math.sin(k * 3 + r.w) * 4;
                    if (!r25) { A.alienHead(lc, hx, y, r.s); continue; }
                    // 2.5D: falling out of the sky onto a spot on the floor.
                    const z = r.z || (r.z = F.y0 + Math.random() * (F.y1 - F.y0)), lift = Math.max(0, (1 - (y + 8) / (A.H + 16)) * 150);
                    card(hx, z, lift, 24, 24, 12, 12, () => A.alienHead(lc, hx, z - lift, r.s));
                }
                if (!any) ayyRain = null;
            }
            if (ayyUfo) {
                const k = t - ayyUfo.at;
                if (k > UFO_GONE) { ayyUfo = null; return; }
                const w = ufoAt(ayyUfo, k);
                const uy = ayyUfo.y;
                card(w.x, uy, 0, 90, 200, 45, 190, () => A.ufo(lc, w.x, w.y, t, w.beam, uy - w.y - 5));
            }
        }
        /** Yours: the screen goes dark, an alien comes at you out of it, AYY LMAO!, and you're back. */
        function drawAbducted(t, u) {
            if (!ayyMe) return;
            const k = t - ayyMe.at, back = ayyMe.backAt ? t - ayyMe.backAt : -1;
            let dark = Math.max(0, Math.min(1, (k - 1.8) / 1));
            if (back >= 0) dark = Math.max(0, 1 - back / 0.9);
            if (back > 0.9 || k > 20) { ayyMe = null; return; }
            if (dark <= 0) return;
            ctx.fillStyle = 'rgba(0,0,0,' + dark + ')'; ctx.fillRect(0, 0, cv.width, cv.height);
            const z = k - 3.0;
            if (z < 0) return;
            const grow = Math.min(1, z / 1.2), s = (0.6 + grow * grow * 13) * u * 0.55;
            const cx = cv.width / 2 + (z > 1.2 ? Math.sin(t * 23) * dpr * 2 : 0), cy = cv.height * 0.44;
            ctx.save();
            ctx.globalAlpha = dark * 0.35;                          // a green glow round him
            const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 9);
            gr.addColorStop(0, '#7dff6a'); gr.addColorStop(1, 'rgba(125,255,106,0)');
            ctx.fillStyle = gr; ctx.fillRect(cx - s * 9, cy - s * 9, s * 18, s * 18);
            ctx.restore();
            A.alienHead(ctx, cx, cy, s, dark * Math.min(1, z / 0.3));
            if (z > 0.7) {
                const fs = Math.max(22, Math.round(13 * u / dpr)) * dpr, ty = cy + s * 6.5 + fs * 0.6 + Math.sin(t * 40) * 3 * dpr;
                ctx.globalAlpha = dark;
                ctx.font = 'bold ' + fs + 'px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = '#000'; ctx.fillText('AYY LMAO!', cv.width / 2 + 2 * dpr, ty + 2 * dpr);
                ctx.fillStyle = '#7dff6a'; ctx.fillText('AYY LMAO!', cv.width / 2, ty);
                ctx.globalAlpha = 1;
            }
        }

        /* ---------- hot potato (engine/hall-potato.js) ---------- */
        const BOMB = '💣', BOMB_REACH = [160, 230];      // how close to pass it (the room's units)
        const BOMB_BACK = 2.5;                           // seconds before it can go straight back (engine BOMB.backMs)
        let bomb = null;                                 // { h, from, end, n }: who has it and when it goes off (this page's clock)
        const booms = [];                                // { x, y, at }: going off
        // Whoever held it when it went off: h → { land, end } (this page's clock). In the air till land
        // (smoking), charred for CHAR_S after, coughing, then shaking the dust off in the last SHAKE_S before end.
        const blasted = new Map(), FLY_S = 1.1, CHAR_S = 1, SHAKE_S = 0.6;
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
                    const [kx, ky] = toPx(xy[0], xy[1]), it = h === m.boom.h;          // its holder goes much higher and further
                    Object.assign(q, { knock: { x0: q.x, y0: q.y, x1: kx, y1: ky, at: t, dur: it ? FLY_S : 0.85, arc: it ? 46 : 24 }, tx: kx, ty: ky, pushed: false, real: null });
                    if (h === me) { lastSent = ''; pendingHit = null; }
                }
                if (m.boom.stun && !quiet) blasted.set(m.boom.h, { land: t + FLY_S, end: t + m.boom.stun / 1000 });
                if (!quiet) logLine({ text: '💥 BOOM! ' + nameOf(m.boom.h) + ' was holding the bomb.' }, 'announce');
            } else if (m.fizzle) {
                bomb = null;
                if (!quiet) logLine({ text: '💣 The bomb fizzled out.' }, 'game');
            } else if (m.h) {
                const first = !bomb;
                bomb = { h: m.h, from: m.from, end: t + (m.left || 0) / 1000, n: m.n || 0, got: t };
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
            let q = h ? people.get(h) : null, back = false;
            if (!q) {
                let best = Infinity;
                for (const x of people.values()) {
                    if (x.h === me || x.s || isEaten(x.h)) continue;
                    if (bomb && x.h === bomb.from && now() - bomb.got < BOMB_BACK) { back = true; continue; }      // not straight back
                    const [ux, uy] = toU(x.x, x.y), [mx, my] = toU(p.x, p.y), dx = Math.abs(ux - mx) / BOMB_REACH[0], dy = Math.abs(uy - my) / BOMB_REACH[1];
                    if (dx > 1 || dy > 1) continue;
                    const d = Math.hypot(dx, dy);
                    if (d < best) { best = d; q = x; }
                }
            }
            if (!q) return U.toast(back ? 'Not straight back! Find someone else, or hang on a moment.' : 'Nobody close enough — run at someone!');
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
                if (m.state === 'asking' && was !== 'asking') stopWatch();          // watching FunpostTV: up, to see it and say yes
                if (m.state === 'asking' && was !== 'asking') { dodgeNo = false; logLine({ text: '🏐 Dodgeball! Everyone’s asked to play.' }, 'game'); U.toast('🏐 Dodgeball! Join in?'); }
                if (m.state === 'ready' && m.round !== wasRound && v25 && m.round === 1) v25.cue('dodge');      // 2.5D: a sweep round the room as it starts
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
        function roomXY(e) {
            const r = cv.getBoundingClientRect();
            if (r25 && v25) return v25.pick((e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height);
            return [(e.clientX - r.left) / r.width * A.W, (e.clientY - r.top) / r.height * A.H];
        }
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
                spot(holder.x, holder.y);
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
                spot(F.x0 + b.x, F.y0 + b.y);
                const fx = (F.x0 + b.x) * u, fy = (F.y0 + b.y) * u;
                if (f.res === 'hit' || f.res === 'catch') {
                    const who = people.get(f.b), k = Math.min(1, (t - f.resAt) / 0.6);
                    if (f.res === 'hit') {
                        ctx.globalAlpha = 1 - k * 0.7;
                        ballAt(fx + (f.vx > 0 ? 1 : -1) * k * 14 * u, fy - 7 * u + (Math.pow(k, 2) * 9 - Math.sin(k * Math.PI) * 6) * u, u);
                        ctx.globalAlpha = 1;
                        if (who && heads.has(who.h)) spot(who.x, who.y);
                        if (who && heads.has(who.h)) popWord('OUT!', who.x * u, (heads.get(who.h) - 6 - k * 3) * u, u, '#ff6b6b');
                    } else if (who && heads.has(who.h)) { spot(who.x, who.y); popWord('CATCH!', who.x * u, (heads.get(who.h) - 6 - k * 3) * u, u, '#8dffb0'); }
                    continue;
                }
                if (f.perfect && s < 0.8) { const th = people.get(f.a); if (th && heads.has(th.h)) { spot(th.x, th.y); popWord('PERFECT!', th.x * u, (heads.get(th.h) - 6 - s * 4) * u, u, '#fff3a0'); spot(F.x0 + b.x, F.y0 + b.y); } }
                pixDisc(fx / u, fy / u, 2.4, 1, 'rgba(0,0,0,0.45)', u);
                if (!f.res) speedTrail(f, s, b, fx / u, fy / u - 7, t, u);
                ballAt(fx, fy - (f.res === 'dead' ? 2.3 : 7) * u, u);
            }
        }

        /* ---------- air hockey, one on one (engine/hall-hockey.js) ----------
           Arcade style: your screen is the table, tilted towards you, your goal on the left, your crowd
           behind the far rail. Your mallet follows the mouse (or WASD / the arrows); hold the right
           button (or Space) to charge a power shot; swipe across the puck as you hit it to curve it.
           Every hit lands: a hit-stop, shake, sparks, the puck hopping, the speed shouted out.
           Air Hockey Forever 2: Air in Space Time adds judgement (the board falls away into space; black
           holes), the white (a giant black hole; a bigger, quicker, quiet board; the puck a laser at speed)
           and an ending (the two floating together). The station runs the pucks; your own hits go the
           moment you make them (hall-hk-hit). */
        const HKT = { w: 600, h: 1000, goal: 220, mr: 38, pr: 24, maxPuck: 2100, maxMallet: 3200, drag: 0.22, wallE: 0.9, hitE: 0.95, keyV: 900,
            maxPower: 2900, powerUp: 1.35, spinPer: 1 / 900, spinMax: 2.6, spinDecay: 1.8, freezeFrom: 1300, freezeMax: 110,   // as engine/hall-hockey.js HK
            holeR: 50, pull: 170, pullA: 1100, laser: 2300, overSpace: 9,
            chargeS: 0.7, chargeSlow: 0.18, stallS: 5 };                           // a full charge takes this long, and slows your mallet this much (as long as you hold it);
                                                                                     // the puck can't stay in one half longer than stallS (engine/hall-hockey.js HK.stallMs)
        const HK_WHITE = { maxPuck: 2600, maxPower: 3500 };
        const hkFreezeFor = (s) => (s < HKT.freezeFrom ? 0 : Math.min(HKT.freezeMax, 40 + (s - HKT.freezeFrom) / (HKT.maxPower - HKT.freezeFrom) * (HKT.freezeMax - 40)));
        const hks = new Map();                  // id → the station's hall-hk (end: when a finished one goes)
        const hkL = { id: '', pucks: new Map(), mine: null, foe: null, foeTo: null, foeV: null, tgt: null, sentAt: 0, sent: '', hitAt: -9, freeze: 0, lastN: 0,
            charging: false, charge: 0, powerUntil: 0, hop: null, streak: { h: '', n: 0 }, fire: '', fireAt: -9, goalAt: -9, goStart: -9, beep: -1, railAt: 0,
            holes: [], locks: {}, lockGot: {}, phase: 'normal', phaseStart: -9, overStart: -9 };
        const hkFx = { shake: 0, flash: 0, flashC: '#ffffff', sparks: [], rings: [], words: [], confetti: [], crowdUp: 0, warps: [] };
        // The game you're in: one being played wins over one that's only asking (someone challenging you meanwhile).
        const myHk = () => { let asked = null; for (const g of hks.values()) if (g.a === me || g.b === me) { if (g.state !== 'asked') return g; asked = asked || g; } return asked; };
        const hkView = () => { const g = myHk(); return !!g && g.state !== 'asked' && g.state !== 'declined' && g.state !== 'expired' && (g.state !== 'over' || now() < g.end); };
        const hkA = () => { const g = myHk(); return !!g && g.a === me; };            // a defends y = HKT.h
        const hkMph = (s) => Math.round(s * 0.04);
        // How hard: the trail's colour, the word shouted.
        const hkTier = (s, pw) => (pw ? ['#7ef0ff', 'SUPER SHOT!!'] : s >= 2400 ? ['#ff4fd8', 'HYPERSPEED!!'] : s >= 2000 ? ['#ff3b3b', 'MAX POWER!'] : s >= 1500 ? ['#ff8a2a', 'BLAZING!'] : s >= 1000 ? ['#ffe14d', 'FAST!'] : ['#ffffff', '']);
        const hkCaps = () => (hkL.phase === 'white' ? HK_WHITE : HKT);
        /** The table's size now (the white's is bigger), from the station. */
        function hkDims(g) { const d = (g && g.dims) || {}; HKT.w = d.w || 600; HKT.h = d.h || 1000; HKT.goal = d.goal || 220; }

        /* The sounds: made on the spot (no files), at the radio's volume. */
        let hkAc = null, hkOut = null;
        function hkAudio() {
            if (hkAc) return hkAc;
            try {
                hkAc = new (window.AudioContext || window.webkitAudioContext)();
                hkOut = hkAc.createGain(); hkOut.connect(hkAc.destination);
            } catch { hkAc = null; }
            return hkAc;
        }
        function hkVol() { const v = Number(core.state && core.state.volume); return (Number.isFinite(v) ? v : 0.8) * 0.5; }
        function hkTone(type, f0, f1, dur, vol, at = 0) {
            const ac = hkAudio(); if (!ac) return;
            const t0 = ac.currentTime + at, o = ac.createOscillator(), gn = ac.createGain();
            o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
            gn.gain.setValueAtTime(vol * hkVol(), t0); gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            o.connect(gn); gn.connect(hkOut); o.start(t0); o.stop(t0 + dur + 0.02);
        }
        function hkNoise(dur, vol, freq, at = 0) {
            const ac = hkAudio(); if (!ac) return;
            const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
            for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
            const src = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain(), t0 = ac.currentTime + at;
            f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
            gn.gain.setValueAtTime(vol * hkVol(), t0);
            src.buffer = buf; src.connect(f); f.connect(gn); gn.connect(hkOut); src.start(t0);
        }
        const hkSfx = {
            hit: (s, pw) => { const k = Math.min(1, s / HKT.maxPower); hkNoise(0.09 + k * 0.08, 0.5 + k * 0.6, 1800 + k * 2500); hkTone('sine', 160 + k * 120, 50, 0.18 + k * 0.1, 0.7 + k * 0.5); if (pw) { hkTone('square', 880, 220, 0.25, 0.25); hkNoise(0.3, 0.6, 600); } },
            rail: (s) => { hkTone('square', 520 + s / 8, 300, 0.06, 0.18); hkNoise(0.04, 0.25, 3000); },
            goal: () => { hkTone('sawtooth', 220, 210, 0.9, 0.35); hkTone('sawtooth', 277, 270, 0.9, 0.3); hkTone('sawtooth', 330, 325, 0.9, 0.25); hkNoise(0.9, 0.35, 900, 0.05); },
            beep: (hi) => hkTone('square', hi ? 1320 : 660, hi ? 1320 : 660, hi ? 0.35 : 0.12, 0.25),
            charged: () => hkTone('triangle', 600, 1500, 0.15, 0.25),
            fire: () => { hkNoise(1.1, 0.7, 500); hkTone('sawtooth', 110, 440, 0.8, 0.35); },
            warp: () => { hkTone('sine', 200, 1600, 0.25, 0.4); hkTone('sine', 1600, 300, 0.2, 0.3, 0.2); },
            split: () => { hkTone('square', 900, 1200, 0.07, 0.25); hkTone('square', 900, 1400, 0.07, 0.25, 0.08); hkTone('square', 900, 1600, 0.07, 0.25, 0.16); },
            lock: () => { hkTone('triangle', 2400, 300, 0.5, 0.35); hkNoise(0.3, 0.3, 5000); },
            fall: () => { hkNoise(2.2, 0.8, 120); hkTone('sine', 300, 40, 2.2, 0.6); },
            white: () => { hkNoise(2.4, 0.7, 80); hkTone('sine', 60, 30, 2.4, 0.7); for (const [f, at] of [[523, 2.6], [659, 2.75], [784, 2.9], [1047, 3.05]]) hkTone('sine', f, f, 1.6, 0.18, at); },
            end: () => { for (const [f, at] of [[523, 0], [659, 0.2], [784, 0.4], [1047, 0.6], [1319, 0.8]]) hkTone('triangle', f, f, 1.2, 0.2, at); }
        };

        function onHk(m, quiet) {
            const was = hks.get(m.id), t = now();
            if (['declined', 'expired', 'gone'].includes(m.state)) {
                hks.delete(m.id);
                if (!quiet && m.state === 'declined' && m.a === me) logLine({ text: '🏒 ' + nameOf(m.b) + ' doesn’t want to play air hockey right now.' }, 'game');
            } else hks.set(m.id, { ...m, end: t + (m.until || 0) / 1000 });
            const space = m.mode === 'space', title = space ? 'Air Hockey Forever 2' : 'air hockey';
            if (m.a !== me && m.b !== me) { if (!quiet && m.state === 'over' && !m.why) logLine({ text: '🏒 ' + nameOf(m.win) + ' wins at ' + title + ', ' + Math.max(...m.score) + '–' + Math.min(...m.score) + '!' }, 'game'); }
            else {
                const playing = myHk();
                if (playing && playing.id !== m.id && playing.state !== 'asked') {         // a challenge while you're at the table: just the toast
                    if (m.state === 'asked' && m.b === me && !quiet) U.toast('🏒 ' + nameOf(m.a) + ' wants a game next.');
                    return paintHk();
                }
                if (hkL.id !== m.id) {
                    Object.assign(hkL, { id: m.id, mine: null, foe: null, lastN: 0, streak: { h: '', n: 0 }, fire: '', charge: 0, holes: [], locks: {}, phase: m.phase || 'normal', phaseStart: t - (m.phaseAgo || 0) / 1000 - 99 });
                    hkL.pucks.clear();
                }
                hkDims(m);
                if (m.phase && m.phase !== hkL.phase) {                         // judgement, or the white
                    hkL.phase = m.phase; hkL.phaseStart = t - (m.phaseAgo || 0) / 1000;
                    hkL.mine = null; hkL.foe = null; hkL.tgt = null; hkL.holes = [];
                    if (!quiet) { if (m.phase === 'space') hkSfx.fall(); else if (m.phase === 'white') hkSfx.white(); hkFx.shake = 6; }
                }
                if (m.state === 'asked' && !was && m.b === me && !quiet) U.toast('🏒 ' + nameOf(m.a) + ' challenges you to ' + (space ? 'Air Hockey Forever 2: Air in Space Time!' : 'air hockey!'));
                if (m.state === 'ready') { hkL.pucks.clear(); hkL.beep = -1; hkL.side = ''; hkL.holes = []; hkL.locks = {}; if (m.fault && was && was.state === 'playing') { hkSfx.rail(200); hkFx.shake = 3; } }
                if (m.state === 'playing' && was && was.state !== 'playing') { hkL.goStart = t; hkSfx.beep(true); }
                if (m.state === 'goal' && was && was.state !== 'goal') hkGoal(m.by, t);
                if (m.state === 'over' && (!was || was.state !== 'over')) {
                    hkL.overStart = t;
                    if (!quiet) {
                        const won = m.win === me, sc = (m.a === me ? m.score : [m.score[1], m.score[0]]).join('–');
                        logLine({ text: '🏒 ' + (m.why === 'left' && won ? nameOf(m.a === me ? m.b : m.a) + ' left — you win!' : won ? 'You win at ' + title + ', ' + sc + '!' : nameOf(m.win) + ' wins at ' + title + ', ' + sc + '.') }, 'game');
                        if (won) { hkFx.flash = 0.4; hkFx.flashC = '#ffd34a'; hkConfetti(A.W / 2, 40, 90); }
                        if (space && !m.why) hkSfx.end();
                    }
                }
            }
            if (m.state === 'over' && !m.why) { const p = people.get(m.win); if (p) p.star = performance.now() + 15000; }
            paintHk();
        }
        function onHkAt(m) {
            const g = myHk();
            if (!g || g.id !== m.id) return;
            const t = now(), foeH = g.a === me ? g.b : g.a;
            // Their mallet: where it is, and how it's moving (so it can be drawn a little ahead, not behind).
            const f = m.m[foeH];
            if (f) {
                if (hkL.foeTo) { const dtm = Math.max(0.016, t - hkL.foeTo.at); hkL.foeV = { x: (f[0] - hkL.foeTo.x) / dtm, y: (f[1] - hkL.foeTo.y) / dtm }; }
                hkL.foeTo = { x: f[0], y: f[1], at: t };
                if (!hkL.foe) hkL.foe = { x: f[0], y: f[1], vx: 0, vy: 0 };
            }
            if (!hkL.mine && m.m[me]) hkL.mine = { x: m.m[me][0], y: m.m[me][1], vx: 0, vy: 0 };
            hkL.holes = (m.holes || []).map(([id, x, y, kind, left, old]) => ({ id, x, y, kind, end: t + left / 1000, start: t - old / 1000 }));
            const locks = {};
            for (const [h, ms] of Object.entries(m.locks || {})) locks[h] = t + ms / 1000;
            hkL.locks = locks;
            const holed = new Set();
            for (const e of m.ev || []) { hkEvent(e, t); if (e.k === 'warp' || e.k === 'split') holed.add(e.pid); }
            // A hit the station counted: mine (it took my word for it), or theirs — that one lands here now,
            // from where the station has it, with its bang and hit-stop.
            const newHit = (m.n || 0) > hkL.lastN, theirs = newHit && m.hb !== me;
            if (newHit) hkL.lastN = m.n;
            const list = m.ps || [[0, ...m.p]], seen = new Set();
            for (const [pid, x, y, vx, vy, sp] of list) {
                seen.add(pid);
                const srv = { x, y, vx, vy, spin: (sp || 0) / 100 };
                let P = hkL.pucks.get(pid);
                if (!P) { hkL.pucks.set(pid, { id: pid, ...srv, trail: [], hitAt: -9, wait: 0 }); continue; }
                if (theirs && (m.hp === pid || !m.hp)) {
                    Object.assign(P, srv); hkL.freeze = t + (m.fz || 0) / 1000; P.wait = 0; P.hitAt = -9;
                    hkBang(x, y, m.hs || Math.hypot(vx, vy), !!m.pw, false);
                    continue;
                }
                if (holed.has(pid)) { Object.assign(P, srv); P.wait = 0; P.hitAt = -9; P.holeAt = t; continue; }     // a black hole had it: where it came out
                if (newHit && m.hb === me && m.hp === pid) P.hitAt = -9;       // confirmed: back to following the station
                if (g.state !== 'playing') { Object.assign(P, srv); continue; }
                // Waiting on the other one's hit, or a black hole (the puck reached it here): hold it until the news comes.
                if (P.wait && t - P.wait < 0.45) { if (Math.hypot(P.x - x, P.y - y) > 60) { Object.assign(P, srv); P.wait = 0; } continue; }
                // Just after my own hit, mine is the newer news: keep it until the station says it took it (or ~0.6 s).
                if (t - P.hitAt < 0.6) continue;
                // Otherwise the station's puck: eased into, unless it's well out.
                if (Math.hypot(P.x - x, P.y - y) > 140) Object.assign(P, srv);
                else { P.x += (x - P.x) * 0.4; P.y += (y - P.y) * 0.4; P.vx = vx; P.vy = vy; P.spin = srv.spin; }
            }
            for (const pid of [...hkL.pucks.keys()]) if (!seen.has(pid)) hkL.pucks.delete(pid);
        }
        /* The effects are cleared away as the table's drawn; with the window hidden mid-game they'd pile up (the other
           player's hits still come in), so each list keeps only its newest few hundred. */
        const HK_FX_MAX = { sparks: 400, rings: 60, words: 12, confetti: 300, warps: 12 };
        function hkFxTrim() { for (const k in HK_FX_MAX) { const a = hkFx[k]; if (a.length > HK_FX_MAX[k]) a.splice(0, a.length - HK_FX_MAX[k]); } }
        /** Black holes doing their thing: the flash, the word, the sound. */
        function hkEvent(e, t) {
            hkFxTrim();
            const [sx, sy] = hkTo(e.x, e.y);
            if (e.k === 'warp') {
                const [tx, ty] = hkTo(e.to[0], e.to[1]);
                hkFx.rings.push({ x: sx, y: sy, at: t, c: '#b88cf2', big: 1.2 }, { x: tx, y: ty, at: t + 0.05, c: '#ffffff', big: 1.2 });
                hkFx.warps.push({ x: sx, y: sy, tx, ty, at: t });
                hkFx.words.push({ x: tx, y: ty - 8, at: t, mph: 'WARP!', word: '', c: '#b88cf2', big: false });
                hkSfx.warp();
            } else if (e.k === 'split') {
                hkFx.rings.push({ x: sx, y: sy, at: t, c: '#4fd36e', big: 1.6 });
                for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; hkFx.sparks.push({ x: sx, y: sy, vx: Math.cos(a) * 70, vy: Math.sin(a) * 45, at: t, life: 0.5, c: i % 2 ? '#4fd36e' : '#ffffff' }); }
                hkFx.words.push({ x: sx, y: sy - 8, at: t, mph: 'SPLIT!', word: 'x3', c: '#4fd36e', big: false });
                hkSfx.split();
            } else if (e.k === 'lock') {
                hkL.lockGot[e.h] = t;
                const M = e.h === me ? hkL.mine : hkL.foe, [mx, my] = M ? hkTo(M.x, M.y) : [sx, sy];
                hkFx.rings.push({ x: mx, y: my, at: t, c: '#7ef0ff', big: 1.4 });
                hkFx.words.push({ x: mx, y: my - 10, at: t, mph: e.h === me ? 'LOCKED!' : 'THEY’RE LOCKED!', word: '', c: '#7ef0ff', big: e.h === me });
                hkSfx.lock();
            } else if (e.k === 'pop') {
                hkFx.rings.push({ x: sx, y: sy, at: t, c: '#ffffff', big: 0.5 });
            }
        }

        /* The table on the screen: lying across it (your goal on the left), tilted towards you — the far rail
           narrower, everything smaller the further back it is. u: along the table from your goal (0–h),
           v: across it from the far rail (0–w). The white's table is bigger, so it's drawn a little bigger. */
        const HKS = { cx: 120, y0: 44, th: 80, len: 205, far: 0.8 };
        function hkFit() { const white = hkL.phase === 'white'; HKS.y0 = white ? 40 : 44; HKS.th = white ? 88 : 80; HKS.len = white ? 218 : 205; }
        const hkUV = (x, y) => (hkA() ? [HKT.h - y, x] : [y, HKT.w - x]);
        const hkXY = (u, v) => (hkA() ? [v, HKT.h - u] : [HKT.w - v, u]);
        function hkScr(u, v) { const f = v / HKT.w, k = HKS.far + (1 - HKS.far) * f, s = HKS.len / HKT.h; return [HKS.cx + (u - HKT.h / 2) * s * k, HKS.y0 + f * HKS.th, k * s / 0.205]; }
        function hkTo(x, y) { return hkScr(...hkUV(x, y)); }
        function hkFrom(sx, sy) {
            const f = Math.max(-0.2, Math.min(1.2, (sy - HKS.y0) / HKS.th)), k = HKS.far + (1 - HKS.far) * f, s = HKS.len / HKT.h;
            return hkXY((sx - HKS.cx) / (s * k) + HKT.h / 2, f * HKT.w);
        }
        const hkR = (r, k) => r * 0.205 * k;                                    // a radius on the table, on the screen
        function hkClamp(x, y) {
            x = Math.max(HKT.mr, Math.min(HKT.w - HKT.mr, x));
            y = hkA() ? Math.max(HKT.h / 2 + HKT.mr, Math.min(HKT.h - HKT.mr, y)) : Math.max(HKT.mr, Math.min(HKT.h / 2 - HKT.mr, y));
            return [x, y];
        }
        function hkPointer(e) {
            if (!hkView()) return false;
            const [sx, sy] = roomXY(e);
            hkL.tgt = hkClamp(...hkFrom(sx, sy));
            return true;
        }
        /** The puck off a mallet: the same sums as engine/hall-hockey.js hitOff (spin from swiping across, power). */
        function hkHitOff(pk, m, power = 0) {
            const dx = pk.x - m.x, dy = pk.y - m.y, d = Math.hypot(dx, dy), min = HKT.mr + HKT.pr;
            if (d >= min || d === 0) return 0;
            const nx = dx / d, ny = dy / d;
            pk.x = m.x + nx * min; pk.y = m.y + ny * min;
            const rvx = pk.vx - (m.vx || 0), rvy = pk.vy - (m.vy || 0), vn = rvx * nx + rvy * ny;
            if (vn >= 0) return 0;
            pk.vx -= (1 + HKT.hitE) * vn * nx; pk.vy -= (1 + HKT.hitE) * vn * ny;
            const across = (m.vx || 0) * -ny + (m.vy || 0) * nx;
            pk.spin = Math.max(-HKT.spinMax, Math.min(HKT.spinMax, across * HKT.spinPer));
            let sp = Math.hypot(pk.vx, pk.vy);
            if (power > 0) { const k = 1 + (HKT.powerUp - 1) * Math.min(1, power); pk.vx *= k; pk.vy *= k; sp *= k; }
            const caps = hkCaps(), max = power > 0 ? caps.maxPower : caps.maxPuck;
            if (sp > max) { pk.vx *= max / sp; pk.vy *= max / sp; sp = max; }
            return sp;
        }
        function hkCurve(pk, h) {
            const s = pk.spin || 0;
            if (!s) return;
            const a = s * h, c = Math.cos(a), si = Math.sin(a), vx = pk.vx;
            pk.vx = vx * c - pk.vy * si; pk.vy = vx * si + pk.vy * c;
            pk.spin = Math.abs(s) < 0.02 ? 0 : s * Math.exp(-HKT.spinDecay * h);
        }
        function hkPull(pk, h) {
            for (const q of hkL.holes) {
                const dx = q.x - pk.x, dy = q.y - pk.y, d = Math.hypot(dx, dy);
                if (d < 1 || d > HKT.pull) continue;
                const a = HKT.pullA * (1 - d / HKT.pull) * h;
                pk.vx += dx / d * a; pk.vy += dy / d * a;
            }
        }

        /* ---- the bangs ---- */
        function hkBang(x, y, s, pw, mineHit) {
            hkFxTrim();
            const t = now(), [sx, sy] = hkTo(x, y), k = Math.min(1, s / HKT.maxPower), [col, word] = hkTier(s, pw);
            if (t - (hkFx.bangAt || 0) < 0.18 && !pw) return;                 // one bang a hit, not a rattle
            hkFx.bangAt = t;
            hkFx.shake = Math.max(hkFx.shake, 1 + k * 5 + (pw ? 3 : 0));
            hkFx.rings.push({ x: sx, y: sy, at: t, c: col, big: 0.6 + k + (pw ? 0.6 : 0) });
            for (let i = 0; i < 8 + Math.round(k * 14); i++) {
                const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 90 * (0.5 + k);
                hkFx.sparks.push({ x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 20, at: t, life: 0.25 + Math.random() * 0.35, c: Math.random() < 0.5 ? col : '#ffffff' });
            }
            if (s >= 900) { hkFx.words = hkFx.words.filter(w => t - w.at > 0.5); hkFx.words.push({ x: sx, y: sy - 8, at: t, mph: hkMph(s) + ' MPH', word, c: col, big: pw || s >= 2000 }); }
            if (pw) { hkFx.flash = 0.18; hkFx.flashC = '#7ef0ff'; hkL.powerUntil = t + 1.4; }
            if (s >= 1200) hkL.hop = { at: t, h: Math.min(10, s / 260) };
            if (s >= 1700) hkFx.crowdUp = Math.max(hkFx.crowdUp, 0.6);
            hkSfx.hit(s, pw);
        }
        function hkConfetti(sx, sy, n) {
            const t = now(), C = ['#ff4fd8', '#39e6ff', '#ffe14d', '#4fd36e', '#ff8a2a', '#ffffff'];
            for (let i = 0; i < n; i++) hkFx.confetti.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 120, at: t, c: C[i % C.length], spin: Math.random() * 6 });
        }
        /** Where a player stands (or floats): at their end, or (the ending) drifting into the middle. */
        function hkSpot(h, t) {
            const g = myHk(), left = h === me, home = [left ? 9 : A.W - 9, HKS.y0 + HKS.th * 0.75];
            if (!g || g.state !== 'over' || g.mode !== 'space' || g.why) return home;
            const k = Math.min(1, Math.max(0, (t - hkL.overStart - 0.6) / 2.2)), e = k * k * (3 - 2 * k);
            const mid = [A.W / 2 + (left ? -16 : 16), A.H / 2 + 14];
            return [home[0] + (mid[0] - home[0]) * e, home[1] + (mid[1] - home[1]) * e];
        }
        function hkGoal(by, t) {
            hkL.goalAt = t;
            hkL.streak = hkL.streak.h === by ? { h: by, n: hkL.streak.n + 1 } : { h: by, n: 1 };
            const P = [...hkL.pucks.values()][0], [sx, sy] = P ? hkTo(P.x, P.y) : [A.W / 2, 80];
            hkFx.shake = 9; hkFx.flash = 0.35; hkFx.flashC = by === me ? '#4fd36e' : '#ff4040'; hkFx.crowdUp = 1.6;
            hkConfetti(sx < A.W / 2 ? 12 : A.W - 12, sy, 70);
            const [ax, ay] = hkSpot(by, t);
            hkConfetti(ax, ay - 14, 30);                                         // the scorer's own cheer
            hkSfx.goal();
            if (hkL.fire && hkL.fire !== by) hkL.fire = '';                      // the other one's put the fire out
            if (hkL.streak.n >= 3 && hkL.fire !== by) {
                // ON FIRE: they burst into flames.
                hkL.fire = by; hkL.fireAt = t;
                hkFx.flash = 0.5; hkFx.flashC = '#ff8a2a'; hkFx.shake = 12;
                for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90; hkFx.sparks.push({ x: ax, y: ay - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, at: t, life: 0.6 + Math.random() * 0.6, c: ['#ffe14d', '#ff8a2a', '#ff3b3b', '#ffffff'][i % 4] }); }
                hkSfx.fire();
            }
        }

        /** Every frame at the table: your mallet (and charge), the other one's (ahead a little), the pucks (spin, the pull, hit-stop, your hits). */
        function hkStep(dt) {
            const g = myHk(), t = now();
            if (!g) return;
            if (!hkL.mine) { const y = hkA() ? HKT.h - 150 : 150; hkL.mine = { x: HKT.w / 2, y, vx: 0, vy: 0 }; }
            const M = hkL.mine, lockedMe = (hkL.locks[me] || 0) > t;
            // Keys: your mallet goes the way they point on your screen.
            let kx = 0, ky = 0;
            if (keys.has('a') || keys.has('arrowleft')) kx -= 1; if (keys.has('d') || keys.has('arrowright')) kx += 1;
            if (keys.has('w') || keys.has('arrowup')) ky -= 1; if (keys.has('s') || keys.has('arrowdown')) ky += 1;
            if (kx || ky) {
                const [u, v] = hkUV(...(hkL.tgt || [M.x, M.y])), k = HKT.keyV * dt;
                hkL.tgt = hkClamp(...hkXY(u + kx * k, v + ky * k));
            }
            // Charging a power shot: it fills, and your mallet's slower meanwhile.
            const was = hkL.charge;
            hkL.charge = hkL.charging && g.state === 'playing' ? Math.min(1, hkL.charge + dt / HKT.chargeS) : 0;
            if (was < 1 && hkL.charge >= 1) hkSfx.charged();
            const [tx, ty] = hkL.tgt ? hkClamp(...hkL.tgt) : [M.x, M.y], dx = tx - M.x, dy = ty - M.y, d = Math.hypot(dx, dy);
            const s = lockedMe ? 0 : Math.min(d, HKT.maxMallet * (hkL.charging ? HKT.chargeSlow : 1) * dt), ux = d ? dx / d : 0, uy = d ? dy / d : 0;
            M.vx = dt ? ux * s / dt : 0; M.vy = dt ? uy * s / dt : 0;
            // Theirs: towards where it was last heard of, carried on the way it was going (a little), quickly.
            const F = hkL.foe;
            let fdx = 0, fdy = 0;
            if (F && hkL.foeTo) {
                const age = Math.min(0.08, t - hkL.foeTo.at), v = (hkL.locks[g.a === me ? g.b : g.a] || 0) > t ? { x: 0, y: 0 } : hkL.foeV || { x: 0, y: 0 };
                const gx = hkL.foeTo.x + v.x * age, gy = hkL.foeTo.y + v.y * age, e = Math.min(1, dt * 30);
                fdx = (gx - F.x) * e; fdy = (gy - F.y) * e;
                F.vx = dt ? fdx / dt : 0; F.vy = dt ? fdy / dt : 0;
            }
            const frozen = t < hkL.freeze, live = g.state === 'playing' ? [...hkL.pucks.values()] : [];
            for (const P of live) if (P.wait && t - P.wait >= 0.45) P.wait = 0;
            // In small steps, so a fast swing (or a slow frame) can't jump the mallet clean over a puck.
            const fastest = live.reduce((a, P) => Math.max(a, P.wait || frozen ? 0 : Math.hypot(P.vx, P.vy) * dt), 0);
            const n = Math.max(1, Math.ceil(Math.max(s, fastest) / 20));
            let hit = 0, hitP = null, rail = 0, railP = null;
            for (let i = 0; i < n; i++) {
                M.x += ux * s / n; M.y += uy * s / n;
                if (F) { F.x += fdx / n; F.y += fdy / n; }
                if (frozen) continue;
                const h = dt / n;
                for (const P of live) {
                    if (P.wait) continue;
                    hkCurve(P, h); hkPull(P, h);
                    P.x += P.vx * h; P.y += P.vy * h;
                    const r0 = rail;
                    if (P.x < HKT.pr) { P.x = HKT.pr; P.vx = Math.abs(P.vx) * HKT.wallE; rail = Math.max(rail, Math.abs(P.vx)); }
                    if (P.x > HKT.w - HKT.pr) { P.x = HKT.w - HKT.pr; P.vx = -Math.abs(P.vx) * HKT.wallE; rail = Math.max(rail, Math.abs(P.vx)); }
                    const mouth = Math.abs(P.x - HKT.w / 2) < HKT.goal / 2 - HKT.pr * 0.3;
                    if (!mouth) {
                        if (P.y < HKT.pr) { P.y = HKT.pr; P.vy = Math.abs(P.vy) * HKT.wallE; rail = Math.max(rail, Math.abs(P.vy)); }
                        if (P.y > HKT.h - HKT.pr) { P.y = HKT.h - HKT.pr; P.vy = -Math.abs(P.vy) * HKT.wallE; rail = Math.max(rail, Math.abs(P.vy)); }
                    } else P.y = Math.max(-HKT.pr * 2, Math.min(HKT.h + HKT.pr * 2, P.y));      // in the goal: the station says so
                    if (rail > r0) railP = P;
                    // Into a black hole, as you see it: it waits there till the station says what happened.
                    if (t - (P.holeAt || 0) > 0.7 && hkL.holes.some(q => Math.hypot(q.x - P.x, q.y - P.y) < HKT.holeR * 0.7)) { P.wait = P.holeAt = t; continue; }
                    // (Not again straight after your hit: the puck sits still for the hit-stop while your mallet carries on,
                    // and touching it then would shove it out backwards.)
                    const pw = hkL.charge >= 0.25 ? hkL.charge : 0, got = t >= (hkL.noHitUntil || 0) ? hkHitOff(P, M, pw) : 0;
                    if (got) { hit = got; hitP = P; hkL.pw = pw > 0; if (pw) hkL.charge = 0; break; }
                    // Their mallet reaching it, as you see it: hold the puck there till the station says where they sent it.
                    if (F && t - (P.foeHeld || 0) > 0.5) {
                        const dx2 = P.x - F.x, dy2 = P.y - F.y, d2 = Math.hypot(dx2, dy2), min = HKT.mr + HKT.pr;
                        if (d2 < min && d2 > 0 && (P.vx - F.vx) * dx2 + (P.vy - F.vy) * dy2 < 0) {
                            P.x = F.x + dx2 / d2 * min; P.y = F.y + dy2 / d2 * min;
                            P.wait = P.foeHeld = t;
                        }
                    }
                }
                if (hit) break;
            }
            const key = Math.round(M.x) + ',' + Math.round(M.y);
            if (key !== hkL.sent && t - hkL.sentAt > 0.016) { hkL.sent = key; hkL.sentAt = t; core.send({ t: 'hall-hk-m', id: g.id, x: Math.round(M.x), y: Math.round(M.y) }); }
            if (hit && t - hkL.hitAt > 0.08) {
                hkL.hitAt = hitP.hitAt = t; hkL.freeze = t + hkFreezeFor(hit) / 1000; hkL.noHitUntil = hkL.freeze + 0.15;
                core.send({ t: 'hall-hk-hit', id: g.id, pid: hitP.id, x: Math.round(hitP.x), y: Math.round(hitP.y), vx: Math.round(hitP.vx), vy: Math.round(hitP.vy), spin: +(hitP.spin || 0).toFixed(3), pw: !!hkL.pw });
                hkBang(hitP.x, hitP.y, hit, !!hkL.pw, true);
            }
            if (rail > 500 && railP && t - hkL.railAt > 0.08) {
                hkL.railAt = t; hkSfx.rail(rail);
                const [sx, sy] = hkTo(railP.x, railP.y);
                hkFx.rings.push({ x: sx, y: sy, at: t, c: hkL.phase === 'white' ? '#c8c4d0' : '#ffffff', big: 0.35 });
                hkFx.shake = Math.max(hkFx.shake, rail / 900);
            }
            if (!frozen) { const k = Math.exp(-HKT.drag * dt); for (const P of live) if (!P.wait) { P.vx *= k; P.vy *= k; } }
        }

        /* ---- the scenes ---- */
        const STARS = Array.from({ length: 90 }, (_, i) => [(i * 97.3) % 240, (i * 53.7 + (i % 7) * 11) % 150, i % 5]);
        function hkSpaceBg(L, t, a = 1) {
            L.globalAlpha = a;
            L.fillStyle = '#05030f'; L.fillRect(0, 0, A.W, A.H);
            for (const [cx, cy, r, c] of [[50, 40, 70, 'rgba(184,140,242,0.18)'], [190, 110, 80, 'rgba(57,230,255,0.12)'], [150, 30, 50, 'rgba(255,79,216,0.12)']]) {
                const gr = L.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
                L.fillStyle = gr; L.fillRect(cx - r, cy - r, r * 2, r * 2);
            }
            for (const [x, y, k] of STARS) { L.fillStyle = (k + Math.floor(t * 3)) % 5 ? '#c8c0ff' : '#ffffff'; L.fillRect(Math.round((x - t * (1 + k)) % 240 + 240) % 240, y, 1, 1); }
            L.globalAlpha = 1;
        }
        function hkWhiteBg(L, t) {
            L.fillStyle = '#ffffff'; L.fillRect(0, 0, A.W, A.H);
            L.globalAlpha = 0.25;
            for (let i = 0; i < 6; i++) { const x = (i * 47 + t * 4) % 260 - 10; L.fillStyle = '#e8e4f8'; L.beginPath(); L.ellipse(x, 30 + i * 18, 30, 6, 0, 0, Math.PI * 2); L.fill(); }
            L.globalAlpha = 1;
        }
        function hkArenaBg(L, t) {
            L.fillStyle = '#140b26'; L.fillRect(0, 0, A.W, A.H);
            L.globalAlpha = 0.12; L.fillStyle = '#ff4fd8';
            for (const [ox, sp] of [[60, 0.7], [180, -0.6]]) { const sw = Math.sin(t * sp) * 30; L.beginPath(); L.moveTo(ox + sw - 6, 0); L.lineTo(ox + sw + 6, 0); L.lineTo(ox + sw * 2 + 40, A.H); L.lineTo(ox + sw * 2 - 40, A.H); L.fill(); L.fillStyle = '#39e6ff'; }
            L.globalAlpha = 1;
        }
        function hkCrowd(L, t, dy = 0, a = 1) {
            hkFx.crowdUp = Math.max(0, hkFx.crowdUp - 1 / 60);
            const CROWD = ['#ff8a9a', '#ffd34a', '#7ef0ff', '#b88cf2', '#4fd36e', '#ff8a2a', '#e8e4f0'];
            L.globalAlpha = a;
            for (let i = 0; i < 34; i++) {
                const x = 4 + i * 7 + (i % 2) * 3, jump = hkFx.crowdUp > 0 ? Math.abs(Math.sin(t * 14 + i)) * 5 * Math.min(1, hkFx.crowdUp) : Math.abs(Math.sin(t * 2 + i * 1.7)) * 1.2;
                const y = 30 + (i % 3) * 3 - jump + dy * (0.6 + (i % 4) * 0.2);
                L.fillStyle = '#2a1f48'; L.fillRect(x - 3, y + 3, 7, 8);
                L.fillStyle = CROWD[i % CROWD.length]; L.fillRect(x - 2, y - 2, 5, 5);
                if (hkFx.crowdUp > 0.3 && i % 2) { L.fillRect(x - 4, y - 4 - jump * 0.3, 1, 3); L.fillRect(x + 4, y - 4 - jump * 0.3, 1, 3); }
            }
            L.globalAlpha = 1;
        }
        /** The table: rails, top, markings, goal mouths — in the arena's colours, space's, or the white's. */
        function hkTable(L, t, style, g) {
            const c = (u, v) => hkScr(u, v);
            const [flx, fly] = c(0, 0), [frx] = c(HKT.h, 0), [nlx, nly] = c(0, HKT.w), [nrx] = c(HKT.h, HKT.w);
            const quad = (pts, fill) => { L.fillStyle = fill; L.beginPath(); L.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) L.lineTo(p[0], p[1]); L.closePath(); L.fill(); };
            const S = style === 'space' ? { side: 'rgba(30,20,70,0.6)', side2: '#39e6ff', out: '#000', rail: '#b88cf2', top: 'rgba(20,12,50,0.55)', dots: 'rgba(126,240,255,0.35)', mid: '#ff4fd8', lines: '#39e6ff', slot: '#000' }
                : style === 'white' ? { side: '#eceaf4', side2: '#d8d4e8', out: '#c8c4d8', rail: '#e8e4f4', top: '#fbfaff', dots: '#ece8f6', mid: '#e8c8e0', lines: '#d8dcf0', slot: '#c8c4d8' }
                : { side: '#1a1430', side2: '#ff4fd8', out: '#000000', rail: '#39e6ff', top: '#eaf6ff', dots: '#cfe2f6', mid: '#e8343c', lines: '#2f66b8', slot: '#05030c' };
            if (style !== 'white') {
                quad([[nlx - 6, nly + 4], [nrx + 6, nly + 4], [nrx + 6, nly + 12], [nlx - 6, nly + 12]], S.side);
                quad([[nlx - 6, nly + 4], [nrx + 6, nly + 4], [nrx + 5, nly + 9], [nlx - 5, nly + 9]], S.side2);
            }
            quad([[flx - 5, fly - 4], [frx + 5, fly - 4], [nrx + 6, nly + 4], [nlx - 6, nly + 4]], S.out);
            quad([[flx - 4, fly - 3], [frx + 4, fly - 3], [nrx + 5, nly + 3], [nlx - 5, nly + 3]], S.rail);
            quad([[flx, fly], [frx, fly], [nrx, nly], [nlx, nly]], S.top);
            if (style === 'space') {                                            // a glowing grid on the dark
                L.strokeStyle = 'rgba(57,230,255,0.18)'; L.lineWidth = 1;
                for (let u = 0; u <= HKT.h; u += 100) { const [a, b] = c(u, 0), [d, e] = c(u, HKT.w); L.beginPath(); L.moveTo(a, b); L.lineTo(d, e); L.stroke(); }
                for (let v = 0; v <= HKT.w; v += 100) { const [a, b] = c(0, v), [d, e] = c(HKT.h, v); L.beginPath(); L.moveTo(a, b); L.lineTo(d, e); L.stroke(); }
            } else {
                L.fillStyle = S.dots;
                for (let u = 40; u < HKT.h; u += 50) for (let v = 30; v < HKT.w; v += 50) { const [x, y] = c(u, v); L.fillRect(Math.round(x), Math.round(y), 1, 1); }
            }
            const line = (u, col) => { const [a, b] = c(u, 0), [d, e] = c(u, HKT.w); L.strokeStyle = col; L.lineWidth = 1; L.beginPath(); L.moveTo(a, b); L.lineTo(d, e); L.stroke(); };
            line(HKT.h / 2, S.mid); line(HKT.h * 0.3, S.lines); line(HKT.h * 0.7, S.lines);
            const oval = (u, v, ru, rv, col, from = 0, to = Math.PI * 2) => {
                L.strokeStyle = col; L.beginPath();
                for (let i = 0; i <= 24; i++) { const a = from + (to - from) * i / 24, [x, y] = c(u + Math.cos(a) * ru, v + Math.sin(a) * rv); i ? L.lineTo(x, y) : L.moveTo(x, y); }
                L.stroke();
            };
            oval(HKT.h / 2, HKT.w / 2, 80, 80, S.mid);
            oval(0, HKT.w / 2, 150, 150, S.lines, -Math.PI / 2, Math.PI / 2); oval(HKT.h, HKT.w / 2, 150, 150, S.lines, Math.PI / 2, Math.PI * 1.5);
            for (const u of [0, HKT.h]) {
                const [x1, y1] = c(u, HKT.w / 2 - HKT.goal / 2), [x2, y2] = c(u, HKT.w / 2 + HKT.goal / 2), glow = g && t - hkL.goalAt < 1 && ((u === 0) === (g.by !== me));
                L.strokeStyle = glow && Math.floor(t * 12) % 2 ? '#ffe14d' : S.slot; L.lineWidth = 4;
                L.beginPath(); L.moveTo(x1 + (u ? 2 : -2), y1); L.lineTo(x2 + (u ? 2 : -2), y2); L.stroke(); L.lineWidth = 1;
            }
        }
        /** A black hole: a swirling disc, its ring in its kind's colour, opening and closing. */
        function hkHole(L, q, t) {
            const [sx, sy, k] = hkTo(q.x, q.y), grow = Math.min(1, (t - q.start) / 0.4, Math.max(0, (q.end - t) / 0.4)), r = hkR(HKT.holeR, k) * grow;
            if (r < 0.5) return;
            const col = q.kind === 'warp' ? '#b88cf2' : q.kind === 'split' ? '#4fd36e' : '#7ef0ff';
            L.save();
            L.globalAlpha = 0.35; L.fillStyle = col; L.beginPath(); L.ellipse(sx, sy, r * 1.9, r * 1.05, 0, 0, Math.PI * 2); L.fill();
            L.globalAlpha = 1;
            for (let i = 0; i < 3; i++) {                                       // the swirl
                L.strokeStyle = i % 2 ? col : '#ffffff'; L.lineWidth = 1;
                L.beginPath(); L.ellipse(sx, sy, r * (1.45 - i * 0.3), r * (0.8 - i * 0.17), 0, t * (4 + i * 2) + i, t * (4 + i * 2) + i + Math.PI * 1.3); L.stroke();
            }
            L.fillStyle = '#000000'; L.beginPath(); L.ellipse(sx, sy, r * 0.8, r * 0.45, 0, 0, Math.PI * 2); L.fill();
            L.restore();
            // Bits being drawn in.
            if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2; hkFx.sparks.push({ x: sx + Math.cos(a) * r * 2.2, y: sy + Math.sin(a) * r * 1.2, vx: -Math.cos(a) * r * 4, vy: -Math.sin(a) * r * 2.2, at: t, life: 0.45, c: col }); }
        }
        /** The players at their ends (floating in space), cheering, gutted, on fire. */
        function hkPlayers(L, g, t, foeH, style) {
            for (const h of [me, foeH]) {
                const p = people.get(h);
                if (!p) continue;
                const [x, y0] = hkSpot(h, t), bob = style !== 'normal' ? Math.round(Math.sin(t * 2 + (h === me ? 0 : 1.5)) * 2) : 0, y = y0 + bob;
                const scored = t - hkL.goalAt < 2 && g.by === h, lost = t - hkL.goalAt < 2 && g.by && g.by !== h;
                const won = g.state === 'over' && g.win === h, beaten = g.state === 'over' && g.win && g.win !== h;
                const cheer = scored || won;
                const po = { x, y, face: h === me ? 1 : -1, emote: cheer ? 'cheer' : beaten && g.mode !== 'space' ? 'sit' : '', et: t - hkL.goalAt, t,
                    mood: beaten ? 'cry' : lost ? 'angry' : cheer ? 'happy' : '', noShadow: style !== 'normal' };
                const onFire = hkL.fire === h;
                if (onFire) A.aura(L, 'fire', '', x, y, t, false, p.l, po);
                A.person(L, p.l, po);
                if (onFire) A.aura(L, 'fire', '', x, y, t, true, p.l, po);
                if (cheer) {                                                    // a cheer: sparkles round them, the odd streamer
                    for (let i = 0; i < 6; i++) {
                        const a = t * 4 + i * Math.PI / 3, rx = x + Math.cos(a) * 10, ry = y - 12 + Math.sin(a) * 6;
                        L.fillStyle = ['#ffe14d', '#ffffff', '#ff4fd8', '#7ef0ff'][i % 4];
                        L.fillRect(Math.round(rx), Math.round(ry), 1, 1);
                        if ((Math.floor(t * 8) + i) % 3 === 0) { L.fillRect(Math.round(rx) - 1, Math.round(ry), 3, 1); L.fillRect(Math.round(rx), Math.round(ry) - 1, 1, 3); }
                    }
                    if (Math.random() < 0.15) hkConfetti(x, y - 18, 3);
                }
                if (beaten && g.mode === 'space') for (let i = 0; i < 2; i++) { const k = (t * 1.6 + i * 0.5) % 1; L.fillStyle = '#6ab0ff'; L.globalAlpha = 1 - k; L.fillRect(Math.round(x + (i ? 2 : -2) + (i ? k * 3 : -k * 3)), Math.round(y - 12 + k * 6), 1, 2); L.globalAlpha = 1; }
            }
        }

        /** The arena (or space, or the white): table, players, black holes, mallets, pucks and their trails, the bangs; then the words. */
        function hkFrame(dt, t) {
            const g = myHk(), foeH = g.a === me ? g.b : g.a, L = lc, ph = hkL.phase, pa = t - hkL.phaseStart;
            hkFit();
            hkStep(dt);
            const style = ph === 'white' ? 'white' : ph === 'space' ? 'space' : 'normal';
            // The scene, and the changes between them: the board falling away into space; the giant black hole into the white.
            let tableDy = 0, tableA = 1, swallow = 0, whiteOver = 0;
            if (style === 'normal') { hkArenaBg(L, t); hkCrowd(L, t); }
            else if (style === 'space') {
                if (pa < 2.6) {
                    const k = Math.min(1, pa / 2.2);
                    hkArenaBg(L, t); hkCrowd(L, t, k * k * 140, 1);
                    hkSpaceBg(L, t, Math.min(1, pa / 1.6));
                    if (pa < 1.6) { const k2 = pa / 1.6; tableDy = k2 * k2 * 160; tableA = 1 - k2; }        // the old board, falling
                    else { tableDy = 0; tableA = Math.min(1, (pa - 1.6) / 1); }                              // the new one, appearing
                } else hkSpaceBg(L, t);
            } else {
                if (pa < 2.2) { hkSpaceBg(L, t); swallow = pa / 2.2; }
                else hkWhiteBg(L, t);
                whiteOver = pa < 2.2 ? Math.max(0, (pa - 1.6) / 0.6) : pa < 3.4 ? 1 - (pa - 2.2) / 1.2 : 0;
            }
            if (g.state === 'over' && g.mode === 'space' && !g.why) {
                const oa = t - hkL.overStart;
                whiteOver = Math.max(whiteOver, Math.min(1, Math.max(0, (oa - (HKT.overSpace - 2.4)) / 1.4)));
            }
            // The table and what's on it — in the swallow, all of it pulled in and turning towards the middle.
            L.save();
            if (swallow) { const s2 = 1 - swallow * 0.9; L.translate(A.W / 2, A.H / 2); L.rotate(swallow * swallow * 2.5); L.scale(s2, s2); L.translate(-A.W / 2, -A.H / 2); }
            L.translate(0, tableDy); L.globalAlpha = tableA;
            const oldStyle = style === 'space' && pa < 1.6 ? 'normal' : style === 'white' && pa < 2.2 ? 'space' : style;      // (what's falling, or being swallowed, is the old board)
            hkTable(L, t, oldStyle, g);
            L.globalAlpha = 1;
            L.restore();
            L.save();
            if (swallow) { const s2 = 1 - swallow * 0.9; L.translate(A.W / 2, A.H / 2); L.rotate(swallow * swallow * 2.5); L.scale(s2, s2); L.translate(-A.W / 2, -A.H / 2); }
            if (style === 'normal' || pa > 1.2 || style === 'white') hkPlayers(L, g, t, foeH, style);
            if (style === 'space' && (g.state === 'playing' || g.state === 'ready')) for (const q of hkL.holes) hkHole(L, q, t);
            const P0 = [...hkL.pucks.values()];
            // Mallets and pucks, back to front: a disc with a side to it, a knob on top, a shadow.
            const shirt = (h) => { const p = people.get(h); return (A.PARTS.find(q => q.key === 'shirt').colors || [])[(p && p.l && p.l.shirt) || 0] || '#ff2f6e'; };
            const disc = (x, y, rx, ry, top, side, th) => {
                L.fillStyle = '#000'; L.beginPath(); L.ellipse(x, y + th, rx + 1, ry + 1, 0, 0, Math.PI * 2); L.fill();
                L.fillStyle = side; L.beginPath(); L.ellipse(x, y + th, rx, ry, 0, 0, Math.PI * 2); L.fill(); L.fillRect(x - rx, y, rx * 2, th);
                L.fillStyle = '#000'; L.beginPath(); L.ellipse(x, y, rx + 1, ry + 1, 0, 0, Math.PI * 2); L.fill();
                L.fillStyle = top; L.beginPath(); L.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); L.fill();
            };
            const items = [];
            if (pa > (style === 'space' ? 2 : style === 'white' ? 3 : 0) || g.state === 'playing') {
                if (hkL.foe) items.push({ k: 'm', o: hkL.foe, h: foeH });
                if (hkL.mine) items.push({ k: 'm', o: hkL.mine, h: me });
                if (g.state !== 'goal' && !(g.state === 'over' && g.mode === 'space')) for (const P of P0) items.push({ k: 'p', o: P });
            }
            items.sort((a, b) => hkUV(a.o.x, a.o.y)[1] - hkUV(b.o.x, b.o.y)[1]);
            // The trails first (under everything), coloured by how hard each puck's going — or, in the white, a laser.
            for (const P of P0) {
                if (g.state !== 'playing') { P.trail = []; continue; }
                const [sx, sy] = hkTo(P.x, P.y);
                P.trail.push({ x: sx, y: sy, at: t });
                while (P.trail.length && t - P.trail[0].at > 0.22) P.trail.shift();
                const sp = Math.hypot(P.vx, P.vy);
                if (style === 'white' && sp >= HKT.laser) {
                    // A laser: a long beam back along its path, white-hot core.
                    const tail = P.trail[0] || { x: sx, y: sy }, col = Math.floor(t * 20) % 2 ? '#ff4fd8' : '#39e6ff';
                    for (const [w, c, a] of [[7, col, 0.25], [4, col, 0.6], [1.5, '#ffffff', 1]]) { L.globalAlpha = a; L.strokeStyle = c; L.lineWidth = w; L.lineCap = 'round'; L.beginPath(); L.moveTo(tail.x, tail.y); L.lineTo(sx, sy); L.stroke(); }
                    L.globalAlpha = 1; L.lineWidth = 1; L.lineCap = 'butt';
                    continue;
                }
                if (P.trail.length > 1) {
                    const [col] = hkTier(sp, t < hkL.powerUntil);
                    for (let i = 1; i < P.trail.length; i++) {
                        const a = P.trail[i - 1], b = P.trail[i], k = 1 - (t - b.at) / 0.22;
                        L.globalAlpha = Math.max(0, k) * Math.min(1, sp / 700); L.strokeStyle = col; L.lineWidth = Math.max(1, 4 * k);
                        L.beginPath(); L.moveTo(a.x, a.y); L.lineTo(b.x, b.y); L.stroke();
                    }
                    L.globalAlpha = 1; L.lineWidth = 1;
                    if (t < hkL.powerUntil) for (let i = 0; i < 2; i++) hkFx.sparks.push({ x: sx + (Math.random() - 0.5) * 4, y: sy, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 30, at: t, life: 0.3, c: Math.random() < 0.5 ? '#7ef0ff' : '#ffffff' });
                }
            }
            for (const it of items) {
                const [sx, sy, k] = hkTo(it.o.x, it.o.y);
                if (it.k === 'm') {
                    const r = hkR(HKT.mr, k), mineOne = it.h === me, locked = (hkL.locks[it.h] || 0) > t;
                    L.fillStyle = 'rgba(0,0,0,0.3)'; L.beginPath(); L.ellipse(sx, sy + 3, r, r * 0.5, 0, 0, Math.PI * 2); L.fill();
                    if (mineOne && hkL.charge > 0) {                            // the charge: a ring filling, white-hot when full
                        const full = hkL.charge >= 1;
                        L.strokeStyle = full ? (Math.floor(t * 16) % 2 ? '#ffffff' : '#7ef0ff') : '#7ef0ff'; L.lineWidth = full ? 2 : 1;
                        L.beginPath(); L.ellipse(sx, sy, r + 3, (r + 3) * 0.55, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hkL.charge); L.stroke(); L.lineWidth = 1;
                    }
                    if (hkL.fire === it.h && Math.random() < 0.6) hkFx.sparks.push({ x: sx + (Math.random() - 0.5) * r * 2, y: sy - 3, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 30, at: t, life: 0.35, c: Math.random() < 0.5 ? '#ff8a2a' : '#ffe14d' });
                    disc(sx, sy - 2, r, r * 0.55, shirt(it.h), '#1a1430', 2);
                    disc(sx, sy - 5, r * 0.45, r * 0.25, '#ffffff', '#c8c4d0', 3);
                    if (locked) {                                               // in stasis: iced over, a ring counting down
                        const left = (hkL.locks[it.h] - t) / 1.5;
                        L.globalAlpha = 0.55; L.fillStyle = '#bfefff'; L.beginPath(); L.ellipse(sx, sy - 3, r + 2, (r + 2) * 0.6, 0, 0, Math.PI * 2); L.fill(); L.globalAlpha = 1;
                        L.strokeStyle = '#7ef0ff'; L.beginPath(); L.ellipse(sx, sy - 3, r + 4, (r + 4) * 0.6, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left)); L.stroke();
                        L.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) L.fillRect(Math.round(sx - r + ((i * 7 + Math.floor(t * 6)) % (r * 2))), Math.round(sy - 4 - (i % 2)), 1, 1);
                    }
                } else {
                    const r = hkR(HKT.pr, k), hop = hkL.hop && t - hkL.hop.at < 0.3 ? Math.sin((t - hkL.hop.at) / 0.3 * Math.PI) * hkL.hop.h : 0;
                    const squash = t < hkL.freeze ? 1.35 : 1, waiting = it.o.wait && Math.floor(t * 20) % 2;
                    L.fillStyle = 'rgba(0,0,0,0.35)'; L.beginPath(); L.ellipse(sx, sy + 2, r, r * 0.5, 0, 0, Math.PI * 2); L.fill();
                    disc(sx, sy - 1 - hop, r * squash, r * 0.55 / squash, waiting ? '#b88cf2' : t < hkL.powerUntil ? '#3a8fd8' : '#2a2834', '#000000', 2);
                    L.fillStyle = '#ffffff'; L.globalAlpha = 0.6; L.fillRect(Math.round(sx - r * 0.4), Math.round(sy - 2 - hop - r * 0.2), 2, 1); L.globalAlpha = 1;
                }
            }
            L.restore();
            // The giant black hole (into the white): growing in the middle, swallowing it all.
            if (swallow) {
                const R = 8 + swallow * swallow * 150, cx = A.W / 2, cy = A.H / 2;
                L.fillStyle = '#000'; L.beginPath(); L.arc(cx, cy, R, 0, Math.PI * 2); L.fill();
                for (let i = 0; i < 4; i++) { L.strokeStyle = ['#b88cf2', '#ffffff', '#39e6ff', '#ff4fd8'][i]; L.lineWidth = 2; L.beginPath(); L.arc(cx, cy, R + 3 + i * 3, t * (3 + i) + i, t * (3 + i) + i + Math.PI * 1.2); L.stroke(); }
                L.lineWidth = 1;
            }
            // The bangs: rings, sparks, confetti, warps.
            for (let i = hkFx.rings.length - 1; i >= 0; i--) {
                const r = hkFx.rings[i], k = (t - r.at) / 0.3;
                if (k > 1) { hkFx.rings.splice(i, 1); continue; }
                if (k < 0) continue;
                L.globalAlpha = 1 - k; L.strokeStyle = k < 0.15 ? '#ffffff' : r.c; L.lineWidth = Math.max(1, 3 * (1 - k));
                L.beginPath(); L.ellipse(r.x, r.y, 4 + k * 22 * r.big, (4 + k * 22 * r.big) * 0.55, 0, 0, Math.PI * 2); L.stroke();
            }
            L.globalAlpha = 1; L.lineWidth = 1;
            for (let i = hkFx.warps.length - 1; i >= 0; i--) {
                const w = hkFx.warps[i], k = (t - w.at) / 0.35;
                if (k > 1) { hkFx.warps.splice(i, 1); continue; }
                L.globalAlpha = 1 - k; L.strokeStyle = '#b88cf2'; L.setLineDash([2, 3]); L.beginPath(); L.moveTo(w.x, w.y); L.lineTo(w.tx, w.ty); L.stroke(); L.setLineDash([]);
            }
            L.globalAlpha = 1;
            for (let i = hkFx.sparks.length - 1; i >= 0; i--) {
                const s = hkFx.sparks[i], a = t - s.at;
                if (a > s.life) { hkFx.sparks.splice(i, 1); continue; }
                L.globalAlpha = 1 - a / s.life; L.fillStyle = s.c;
                L.fillRect(Math.round(s.x + s.vx * a), Math.round(s.y + s.vy * a + 60 * a * a), 1, 1);
            }
            for (let i = hkFx.confetti.length - 1; i >= 0; i--) {
                const s = hkFx.confetti[i], a = t - s.at;
                if (a > 2.2) { hkFx.confetti.splice(i, 1); continue; }
                L.globalAlpha = Math.min(1, (2.2 - a) * 2); L.fillStyle = s.c;
                L.fillRect(Math.round(s.x + s.vx * a), Math.round(s.y + s.vy * a + 90 * a * a), Math.floor(t * 10 + s.spin) % 2 ? 2 : 1, 2);
            }
            L.globalAlpha = 1;
            // Onto the screen, shaking.
            hkFx.shake = Math.max(0, hkFx.shake - dt * 30);
            const u = cv.width / A.W, sh = hkFx.shake * u, ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = style === 'white' ? '#ffffff' : '#140b26'; ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.drawImage(low, Math.round(ox), Math.round(oy), cv.width, cv.height);
            if (hkFx.flash > 0) { ctx.globalAlpha = Math.min(0.6, hkFx.flash * 2); ctx.fillStyle = hkFx.flashC; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; hkFx.flash -= dt; }
            if (whiteOver > 0) { ctx.globalAlpha = Math.min(1, whiteOver); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
            hkHud(g, foeH, t, u, ox, oy, style, pa, whiteOver);
        }
        /** The words: the scoreboard, the speed meter, what's happening, the speed of each big hit. */
        function hkHud(g, foeH, t, u, ox, oy, style, pa, whiteOver) {
            const big = Math.max(14, Math.round(6 * u / dpr)) * dpr, small = Math.max(10, Math.round(3 * u / dpr)) * dpr, dark = style === 'white';
            const txt = (s, x, y, size, color, rot = 0, outline = '#000') => {
                ctx.save(); ctx.translate(x + ox, y + oy); ctx.rotate(rot);
                ctx.font = '900 ' + size + 'px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.lineWidth = Math.max(3, size / 4); ctx.lineJoin = 'round'; ctx.strokeStyle = outline; ctx.strokeText(s, 0, 0);
                ctx.fillStyle = color; ctx.fillText(s, 0, 0); ctx.restore();
            };
            const mid = cv.height / 2 + 4 * u;
            // The phase changing: its name, big.
            if (style === 'space' && pa < 3.6 && g.state === 'ready') txt(pa < 1.8 ? 'THE BOARD FALLS AWAY…' : 'JUDGEMENT!', cv.width / 2, mid - big, big * (pa < 1.8 ? 1.1 : 2), pa < 1.8 ? '#c8c0ff' : '#b88cf2', Math.sin(t * 3) * 0.04);
            if (style === 'white' && g.state === 'ready' && pa > 2.4 && pa < 5) txt('THE WHITE', cv.width / 2, mid - big, big * 2, '#c8c4d8', 0, '#ffffff');
            if (whiteOver >= 0.99) return;
            // Scoreboard: two chunky boxes, the number bouncing when it changes.
            const mi = g.a === me ? 0 : 1, mineS = g.score[mi], theirS = g.score[1 - mi], bump = (h) => (t - hkL.goalAt < 0.5 && g.by === h ? 1 + 0.5 * Math.sin((t - hkL.goalAt) / 0.5 * Math.PI) : 1);
            const box = (x, label, n, col, h) => {
                const w = 34 * u, hh = 11 * u, y = 2 * u;
                ctx.fillStyle = '#000'; ctx.fillRect(x - w / 2 - u + ox, y - u + oy, w + 2 * u, hh + 2 * u);
                ctx.fillStyle = col; ctx.fillRect(x - w / 2 + ox, y + oy, w, hh);
                txt(label, x - w * 0.18, y + hh / 2, small, '#ffffff');
                txt(String(n), x + w * 0.3, y + hh / 2, small * 1.6 * bump(h), '#ffe14d');
                if (hkL.fire === h) txt('🔥', x - w / 2 - 3 * u, y + hh / 2, small * 1.4 * (1 + 0.15 * Math.sin(t * 12)), '#ff8a2a');
            };
            box(cv.width / 2 - 22 * u, 'YOU', mineS, '#2f66b8', me);
            box(cv.width / 2 + 22 * u, nameOf(foeH).slice(0, 6).toUpperCase(), theirS, '#c8432f', foeH);
            txt(g.mode === 'space' ? (style === 'white' ? 'THE WHITE · FIRST TO 7' : style === 'space' ? 'JUDGEMENT · FIRST TO 7' : 'FOREVER 2 · FIRST TO 7') : 'FIRST TO 7', cv.width / 2, 17 * u, small * 0.8, dark ? '#8a86a0' : '#c8c0ff', 0, dark ? '#ffffff' : '#000');
            if (hkL.fire && t - hkL.fireAt < 2.5) {
                const a = t - hkL.fireAt, pop = a < 0.2 ? a / 0.2 * 1.5 : 1.5 - Math.min(0.4, (a - 0.2) * 0.5);
                txt((hkL.fire === me ? 'YOU’RE' : nameOf(hkL.fire).toUpperCase() + ' IS') + ' ON FIRE!!', cv.width / 2, mid - big * 1.6, big * 1.4 * pop, '#ff8a2a', Math.sin(a * 14) * 0.06, '#3a0a00');
            } else if (hkL.streak.n === 2 && t - hkL.goalAt < 3) txt('x2 STREAK!', cv.width / 2, 34 * u, small * 1.1, '#ff8a2a');
            // The speed meter: ten blocks, lit by how hard the fastest puck's going.
            const P0 = [...hkL.pucks.values()], sp = g.state === 'playing' ? P0.reduce((a, P) => Math.max(a, Math.hypot(P.vx, P.vy)), 0) : 0, top = hkCaps().maxPower, lit = Math.round(Math.min(1, sp / top) * 10);
            const mx = 6 * u, my = cv.height - 9 * u;
            txt('SPEED', mx + 12 * u, my - 4 * u, small * 0.8, dark ? '#8a86a0' : '#ffffff', 0, dark ? '#ffffff' : '#000');
            for (let i = 0; i < 10; i++) {
                ctx.fillStyle = dark ? '#d8d4e8' : '#000'; ctx.fillRect(mx + i * 4 * u + ox, my + oy, 3.4 * u, 5 * u);
                if (i < lit) { ctx.fillStyle = i < 4 ? '#4fd36e' : i < 6 ? '#ffe14d' : i < 8 ? '#ff8a2a' : i < 9 ? '#ff3b3b' : '#7ef0ff'; ctx.fillRect(mx + i * 4 * u + u * 0.4 + ox, my + u * 0.5 + oy, 2.6 * u, 4 * u); }
            }
            txt(hkMph(sp) + ' MPH', mx + 50 * u, my + 2.5 * u, small, lit >= 8 ? '#ff8a2a' : dark ? '#6a6680' : '#ffffff', 0, dark ? '#ffffff' : '#000');
            if (hkL.charge > 0) txt(hkL.charge >= 1 ? 'POWER READY!' : 'CHARGING…', cv.width - 30 * u, cv.height - 7 * u, small, hkL.charge >= 1 ? '#7ef0ff' : '#c8c0ff');
            if ((hkL.locks[me] || 0) > t) txt('LOCKED ' + ((hkL.locks[me] - t)).toFixed(1) + 's', cv.width - 30 * u, cv.height - 15 * u, small, '#7ef0ff');
            // The big hits' speeds (and the black holes' words), popping up and floating off.
            for (let i = hkFx.words.length - 1; i >= 0; i--) {
                const w = hkFx.words[i], a = t - w.at;
                if (a > 1.1) { hkFx.words.splice(i, 1); continue; }
                const pop = a < 0.12 ? 0.4 + a / 0.12 * 0.9 : a < 0.2 ? 1.3 - (a - 0.12) / 0.08 * 0.3 : 1, y = (w.y - a * 12) * u;
                ctx.globalAlpha = Math.min(1, (1.1 - a) * 3);
                txt(w.mph, w.x * u, y, (w.big ? big : small * 1.3) * pop, w.c, -0.08);
                if (w.word) txt(w.word, w.x * u, y - (w.big ? big : small * 1.3) * pop, small * 1.2 * pop, '#ffffff', 0.05);
                ctx.globalAlpha = 1;
            }
            // What's happening, big in the middle.
            const left = Math.max(0, g.end - t), P = P0[0];
            if (g.state === 'ready') {
                const n = Math.ceil(left);
                if (n !== hkL.beep && n <= 3 && n > 0) { hkL.beep = n; hkSfx.beep(false); }
                if (g.fault && left > 1.3) txt('TOO SLOW! ' + (g.fault === me ? 'YOUR' : 'THEIR') + ' PUCK’S GONE', cv.width / 2, mid, big * 1.3, '#ff8a2a', -0.04);
                else if (left <= 3) txt(String(Math.max(1, n)), cv.width / 2, mid, big * 2.6 * (1 + 0.15 * (1 - (left % 1))), '#ffe14d', 0);
                else if (style === 'normal') txt('GET READY', cv.width / 2, mid, big * 1.4, '#ffe14d', 0);
                if (left > 3 && style === 'normal') txt((touch ? 'Drag your mallet' : 'Mouse moves your mallet · hold right-click or Space: POWER SHOT · swipe across the puck: CURVE'), cv.width / 2, 28 * u, small * 0.9, '#ffffff');
            } else if (g.state === 'playing' && t - hkL.goStart < 0.7) txt('GO!', cv.width / 2, mid, big * 3 * (1 + (t - hkL.goStart)), '#4fd36e', -0.05);
            else if (g.state === 'playing' && P) {
                // Sitting in one half: count it down over the puck (it goes to the other player at zero).
                const side = P.y > HKT.h / 2 ? 'a' : 'b';
                if (hkL.side !== side) { hkL.side = side; hkL.sideAt = t; }
                const rest = HKT.stallS - (t - hkL.sideAt);
                if (rest < 2.2 && rest > 0) { const [sx, sy] = hkTo(P.x, P.y); txt(String(Math.ceil(rest)), sx * u, (sy - 10) * u, small * 1.6 * (1 + 0.3 * (1 - rest % 1)), '#ff8a2a'); }
            }
            else if (g.state === 'goal') {
                const a = t - hkL.goalAt, pop = a < 0.15 ? a / 0.15 * 1.4 : 1.4 - Math.min(0.3, (a - 0.15) * 0.6);
                txt(g.by === me ? 'GOAL!!' : 'THEY SCORE!', cv.width / 2, mid, big * 2.4 * pop, g.by === me ? '#4fd36e' : '#ff4040', Math.sin(a * 12) * 0.06);
            } else if (g.state === 'over') {
                const ending = g.mode === 'space' && !g.why, oa = t - hkL.overStart;
                if (!ending || oa > 1.5) txt(g.win === me ? 'YOU WIN!!' : g.why ? 'GAME OVER' : nameOf(g.win).toUpperCase() + ' WINS', cv.width / 2, ending ? 26 * u : mid, big * 2.2 * (1 + 0.05 * Math.sin(t * 6)), g.win === me ? '#ffd34a' : dark ? '#8a86a0' : '#e6e0f2', Math.sin(t * 3) * 0.04, dark ? '#ffffff' : '#000');
            }
        }
        const hkEl = () => $('.hall-hk', box);
        function paintHk() {
            const el = hkEl();
            if (!el) return;
            const g = myHk(), t = now();
            let html = '';
            if (g) {
                const foe = g.a === me ? g.b : g.a, F_ = '<b>' + esc(nameOf(foe)) + '</b>', left = Math.max(0, Math.ceil(g.end - t));
                const game = g.mode === 'space' ? '<b>Air Hockey Forever 2: Air in Space Time</b> 🌌' : 'air hockey! 🏒';
                if (g.state === 'asked' && g.b === me) html = '<p>' + F_ + ' challenges you to ' + game + '</p><div><button type="button" class="btn go" data-hkans="1">Play!</button><button type="button" class="btn" data-hkans="0">No thanks</button></div>';
                else if (g.state === 'asked') html = '<p>Waiting for ' + F_ + ' to say yes to ' + (g.mode === 'space' ? 'Air Hockey Forever 2' : 'air hockey') + '… (' + left + 's)</p><div><button type="button" class="btn" data-hkquit>Call it off</button></div>';
                else if (g.state !== 'over') html = '<div><button type="button" class="btn" data-hkquit>Give up</button></div>';
            }
            if (el.innerHTML !== html) el.innerHTML = html;
            el.hidden = !html;
            el.classList.toggle('hk-race', !!g && g.state !== 'asked');
            stage.classList.toggle('hall-hockey', hkView());
        }
        const hkPaintT = setInterval(() => { if (hks.size) paintHk(); for (const [id, g] of hks) if (g.state === 'over' && now() > g.end + 1) { hks.delete(id); paintHk(); } }, 250);
        offs.push(() => clearInterval(hkPaintT));
        box.addEventListener('click', (e) => {
            const b = e.target.closest('.hall-hk [data-hkans], .hall-hk [data-hkquit]');
            if (!b) return;
            e.stopPropagation();
            const g = myHk();
            if (!g) return;
            hkAudio();                                                          // (a click: sound's allowed from here on)
            if (b.dataset.hkans != null) core.send({ t: 'hall-hk-answer', id: g.id, ok: b.dataset.hkans === '1' });
            else core.send({ t: 'hall-hk-quit', id: g.id });
        }, true);
        // The mouse (or a finger): the mallet; the right button: charging a power shot.
        stage.addEventListener('pointerdown', (e) => {
            if (!hkPointer(e)) return;
            e.preventDefault(); hkAudio();
            if (e.button === 2) hkL.charging = true;
            try { stage.setPointerCapture(e.pointerId); } catch { /* fine */ }
        });
        stage.addEventListener('pointermove', (e) => { if (hkView() && (e.pointerType === 'mouse' || e.buttons)) hkPointer(e); });
        listen('pointerup', (e) => { if (e.button === 2) hkL.charging = false; });
        stage.addEventListener('contextmenu', (e) => { if (hkView()) e.preventDefault(); });
        /** A key at the table: moving (WASD, arrows), charging (Space). True when it was the table's. */
        function hkKey(e) {
            const k = e.key.toLowerCase();
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); return true; }
            if (k === ' ') { hkAudio(); hkL.charging = true; e.preventDefault(); return true; }
            return false;
        }
        listen('keyup', (e) => { if (e.key === ' ') hkL.charging = false; });
        listen('blur', () => { hkL.charging = false; });

        /* ---------- 🎮 Games: everything you can play with someone, in one menu (favourites at the top) ---------- */
        const gmEl = () => $('.hall-gm', box);
        let gmTo = '', gmFavs = [];
        try { gmFavs = JSON.parse(localStorage.getItem('ltl.gameFavs') || '[]') || []; } catch { /* none yet */ }
        const GM_GAMES = [['kart', '🏁', 'Super Nice Kart'], ['hockey', '🏒', 'Air hockey'], ['duel', '⚔', 'Duel'], ['rps', '✊', 'Rock paper scissors'],
            ['ttt', '⭕', 'Tic-tac-toe'], ['checkers', '⛀', 'Checkers'], ['chinese', '✡', 'Chinese checkers']];
        function gmOpen(h) { gmTo = h; popEl.hidden = true; gmEl().hidden = false; paintGm(); }
        /** What you can do for each game, with whoever you clicked. */
        function gmActions(id, q) {
            const b = (attrs, label, go) => '<button type="button" class="btn' + (go ? ' go' : '') + '" ' + attrs + '>' + label + '</button>';
            const note = (s) => '<span class="hp-note">' + s + '</span>';
            const qn = esc(q.n);
            if (id === 'rps') return b('data-gmact="rps"', 'Challenge ' + qn, true);
            if (id === 'duel') return safe ? note('Bonks and slaps are off for you (🎨 Look)') : q.s ? note(qn + ' doesn’t want to be hit') : duelOf(me) ? note('You’re in a duel') : b('data-gmact="duel"', 'Challenge ' + qn, true);
            if (id === 'hockey') return myHk() ? note('You’re at a table already') : b('data-gmact="hk" data-mode="classic"', '🏒 Classic', true) + b('data-gmact="hk" data-mode="space"', '🌌 Forever 2: Air in Space Time', true);
            if (id === 'kart') {
                const theirs = [...kLob.values()].find(L => kSeated(q.h, L)), mineL = kMine();
                let html = '';
                if (theirs && theirs.kind !== 'practice') html += (theirs !== mineL && theirs.seats.length < KART_MAX ? b('data-gmact="kjoin" data-kid="' + theirs.id + '"', 'Join their race', true) : '') + b('data-gmact="kwatch" data-kid="' + theirs.id + '"', '📺 Watch');
                if (!mineL) {
                    html += '<div class="gm-sub"><select name="gmTrack">' + '<option value="random">🎲 Any track</option>' + TRACKS.map(([t, n]) => '<option value="' + t + '">' + esc(n) + '</option>').join('') + '</select>' +
                        '<select name="gmLaps"><option value="1">1 lap</option><option value="3" selected>3 laps</option><option value="5">5 laps</option></select>' +
                        b('data-gmact="krace"', 'Race ' + qn, true) + '</div>' +
                        '<div class="gm-sub"><select name="gmPTrack">' + TRACKS.map(([t, n]) => '<option value="' + t + '">' + esc(n) + '</option>').join('') + '<option value="circuit">🏆 Circuit (all six)</option></select>' +
                        b('data-gmact="kpractice"', 'Practice on your own') + '</div>';
                } else html += note('You’re in a race lobby');
                const open = [...kLob.values()].filter(L => L.kind !== 'practice' && L !== theirs);
                if (open.length) html += '<div class="gm-sub"><small>Races now:</small> ' + open.map(L => '<span class="gm-race">' + esc(trackName(L.track.id)) + ' · ' + L.seats.length + '/' + KART_MAX +
                    (L !== mineL && L.seats.length < KART_MAX && !mineL ? b('data-gmact="kjoin" data-kid="' + L.id + '"', 'Join') : '') + b('data-gmact="kwatch" data-kid="' + L.id + '"', '📺') + '</span>').join('') + '</div>';
                return html;
            }
            // Board games: their table (join or watch), or a new one.
            const their = tableOf(q.h);
            if (their && their.g === id) return their.state === 'waiting' && their.seats.includes('') && !tableOf(me) ? b('data-gmact="tjoin" data-tid="' + their.id + '"', 'Join their table', true) : b('data-gmact="twatch" data-tid="' + their.id + '"', '🎲 Watch their game');
            if (tableOf(me)) return note('You’re at a table');
            if (id === 'chinese') return '<small>Players:</small> ' + [2, 3, 4, 6].map(n => b('data-gmact="tnew" data-g="chinese" data-n="' + n + '"', String(n))).join('');
            return b('data-gmact="tnew" data-g="' + id + '" data-n="2"', 'Open a table', true);
        }
        function paintGm() {
            const el = gmEl(), q = people.get(gmTo);
            if (!el || el.hidden) return;
            if (!q) { el.hidden = true; return; }
            const games = GM_GAMES.slice().sort((a, c) => (gmFavs.includes(c[0]) - gmFavs.includes(a[0])) || GM_GAMES.indexOf(a) - GM_GAMES.indexOf(c));
            const keep = {};
            for (const s of el.querySelectorAll('select')) keep[s.name] = s.value;
            el.innerHTML = '<div class="gm-top"><h3>🎮 Games with ' + esc(q.n) + '</h3><button type="button" class="btn" data-gmclose title="Close">✕</button></div>' +
                games.map(([id, icon, name], i) => {
                    const fav = gmFavs.includes(id), first = fav && i === 0, after = !fav && i > 0 && gmFavs.includes(games[i - 1][0]);
                    return (first ? '<div class="gm-head">★ Favourites</div>' : after ? '<div class="gm-head">More games</div>' : '') +
                        '<div class="gm-row' + (fav ? ' fav' : '') + '"><button type="button" class="gm-star" data-gmfav="' + id + '" title="' + (fav ? 'Not a favourite' : 'Favourite') + '">' + (fav ? '★' : '☆') + '</button>' +
                        '<span class="gm-name">' + icon + ' ' + esc(name) + '</span><span class="gm-act">' + gmActions(id, q) + '</span></div>';
                }).join('');
            for (const s of el.querySelectorAll('select')) if (keep[s.name]) s.value = keep[s.name];
        }
        box.addEventListener('click', (e) => {
            const el = gmEl();
            if (!el || !el.contains(e.target)) return;
            e.stopPropagation();
            const b = e.target.closest('button');
            if (!b) return;
            const d = b.dataset, to = gmTo, field = (n) => (el.querySelector('[name="' + n + '"]') || {}).value;
            if ('gmclose' in d) { el.hidden = true; return; }
            if (d.gmfav) {
                gmFavs = gmFavs.includes(d.gmfav) ? gmFavs.filter(x => x !== d.gmfav) : gmFavs.concat(d.gmfav);
                try { localStorage.setItem('ltl.gameFavs', JSON.stringify(gmFavs)); } catch { /* full */ }
                return paintGm();
            }
            const close = () => { el.hidden = true; };
            switch (d.gmact) {
                case 'rps': close(); return core.send({ t: 'hall-rps', to });
                case 'duel': close(); return core.send({ t: 'hall-duel', to });
                case 'hk': close(); return core.send({ t: 'hall-hk', to, mode: d.mode || 'classic' });
                case 'krace': close(); return kSend('new', { mode: 'public', track: field('gmTrack') || 'random', laps: Number(field('gmLaps')) || 3, invite: to });
                case 'kpractice': close(); return kSend('new', { mode: 'practice', track: field('gmPTrack') || 'neon', laps: Number(field('gmLaps')) || 3 });
                case 'kjoin': close(); kInvite = null; return kSend('join', { id: d.kid });
                case 'kwatch': close(); kWatchId = d.kid; kSync(); return paintKart();
                case 'tnew': close(); return core.send({ t: 'hall-table-new', g: d.g, n: Number(d.n) || 2 });
                case 'tjoin': close(); return core.send({ t: 'hall-table-sit', id: d.tid });
                case 'twatch': close(); view = d.tid; sel = null; hops = []; gamesEl.hidden = false; return paintGames();
            }
        }, true);
        listen('keydown', (e) => { if (e.key === 'Escape' && gmEl() && !gmEl().hidden) gmEl().hidden = true; });
        const gmT = setInterval(() => { const el = gmEl(); if (el && !el.hidden && !el.querySelector('select:focus')) paintGm(); }, 1000);
        offs.push(() => clearInterval(gmT));

        /* ---------- rock paper scissors ---------- */
        // id → { id, a, b, state, picks, win, until }: shown over both players, finished ones for a few seconds.
        const games = new Map();
        let myPick = '';
        const nameOf = (h) => (people.get(h) || {}).n || 'someone';
        function popOpenGame(h) {
            const og = openGameOf(h);
            if (!og) return '';
            const mineAlready = [...kLob.values()].some(L => L.state && (L.seats || []).includes(me));
            return (og.n < og.max && !mineAlready ? '<button type="button" class="btn go" data-kpop="join" data-kid="' + esc(og.id) + '">' + og.icon + ' Join their race (' + og.n + '/' + og.max + ')</button>' : '') +
                '<button type="button" class="btn" data-kpop="watch" data-kid="' + esc(og.id) + '">👀 Watch their race</button>';
        }
        function openPop(q, e) {
            const sr = stage.getBoundingClientRect();
            const their = tableOf(q.h);
            const mineHeld = (mine() || {}).o;
            popEl.innerHTML = '<b>' + esc(q.n) + '</b>' + (q.afk ? '<small class="hp-afk">💤 away' + (q.afk !== 'afk' ? ': ' + esc(q.afk) : '') + '</small>' : '') + (mineHeld ? '<button type="button" class="btn go" data-give="' + esc(q.h) + '">' +
                (bombMine() ? '💣 Pass them the bomb!' : mineHeld === BOMB && !bomb ? '💣 Hand them a lit bomb (hot potato!)' : '🎁 Give them your ' + heldHtml(mineHeld)) + '</button>' : '') +
                '<button type="button" class="btn go" data-gmto="' + esc(q.h) + '">🎮 Games</button>' + popOpenGame(q.h) +
                (safe ? '<span class="hp-note">Bonks and slaps are off for you (🎨 Look)</span>'
                    : q.s ? '<span class="hp-note">' + esc(q.n) + ' doesn’t want to be hit</span>'
                    : HITS.map(([k, icon, name]) => '<button type="button" class="btn" data-hit="' + k + '" data-to="' + esc(q.h) + '">' + icon + ' ' + name + '</button>').join(''));
            popEl.style.left = Math.min(sr.width - 220, Math.max(4, e.clientX - sr.left + 8)) + 'px';
            popEl.style.top = Math.max(4, e.clientY - sr.top - 30) + 'px';
            popEl.hidden = false;
        }
        popEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const jb = e.target.closest('[data-join]');
            if (jb) { popEl.hidden = true; return core.send({ t: 'hall-table-sit', id: jb.dataset.join }); }
            const kp = e.target.closest('[data-kpop]');
            if (kp) {
                popEl.hidden = true;
                if (kp.dataset.kpop === 'join') { kInvite = null; return kSend('join', { id: kp.dataset.kid }); }
                kWatchId = kp.dataset.kid; kSync(); return paintKart();
            }
            const wb = e.target.closest('[data-watch]');
            if (wb) { popEl.hidden = true; view = wb.dataset.watch; sel = null; hops = []; gamesEl.hidden = false; return paintGames(); }
            const hb = e.target.closest('[data-hit]');
            if (hb) { popEl.hidden = true; return doHit(hb.dataset.to, hb.dataset.hit); }
            const gmb = e.target.closest('[data-gmto]');
            if (gmb) return gmOpen(gmb.dataset.gmto);
            const hkb = e.target.closest('[data-hk]');
            if (hkb) { popEl.hidden = true; return core.send({ t: 'hall-hk', to: hkb.dataset.hk, mode: hkb.dataset.hkmode || 'classic' }); }
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
                spot(b.x, b.y);
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
                spot(p.x, p.y);
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
            const k = e.target.closest('.hall-kart [data-kact]');
            if (k) {
                e.stopPropagation();
                const act = k.dataset.kact, id = k.dataset.kid || ks.id, track = k.dataset.ktrack;
                if (act === 'join') { kSend('join', { id }); kInvite = null; }
                else if (act === 'leave') kSend('leave', { id });
                else if (act === 'start') kSend('start', { id, ...(track ? { track } : {}) });
                else if (act === 'vote') kSend('vote', { id, track });
                else if (act === 'watch') { kWatchId = id; kInvite = null; kSync(); }
                else if (act === 'unwatch') { kWatchId = ''; kSync(); }
                else if (act === 'nothanks') kInvite = null;
                paintKart();
                return;
            }
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
        // Nice points (things you've given people), ebil points (bombs you've passed) and abductions (the UFO took you): REWARDS.
        const POINT_KEYS = { nice: 'ltl.hallNice', ebil: 'ltl.hallEbil', ayy: 'ltl.hallAyy' }, points = { nice: 0, ebil: 0, ayy: 0 };
        for (const k in POINT_KEYS) { try { points[k] = Number(localStorage.getItem(POINT_KEYS[k])) || 0; } catch { /* none yet */ } }
        const pointsOf = (kind) => points[kind] || 0;
        /** A point more: kept, and whatever it unlocks announced. */
        function gotPoint(kind) {
            const n = ++points[kind], [icon, word] = POINTS[kind];
            try { localStorage.setItem(POINT_KEYS[kind], String(n)); } catch { /* this time only */ }
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
            flat();
            if (top && line >= 0) bubble(BT_YELLS[line], ...(r25 ? v25.at(top.x, top.y, btD ? btD.y : top.y + 50) : [top.x * u, top.y * u]), u);
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
                spot(p.x, p.y);
                for (let k = 0; k < 3; k++) { const a2 = t * 7 + k * 2.1; popWord('*', p.x * u + Math.cos(a2) * 6 * u, (p.y - 16) * u + Math.sin(a2) * 2 * u, u * 0.8, '#ffd34a'); }
            }
            for (const [h, at] of btTech) {
                const p = people.get(h), k = t - at;
                if (k > 1) { btTech.delete(h); continue; }
                if (p) { spot(p.x, p.y); popWord('TECH!', p.x * u, (p.y - 20 - k * 6) * u, u, '#7ee3ff'); }
            }
            flat();
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
        /* ---------- blown up holding the bomb ---------- */
        let charCv = null;
        /** Them, burnt black (their own look under it, hat and all), with embers and smoke; returns the head's y like A.person. */
        function charred(look, po, t, bl) {
            const W = 48, H = 64, ax = 24, ay = 56;
            if (!charCv) charCv = document.createElement('canvas');
            charCv.width = W; charCv.height = H;
            const g = charCv.getContext('2d');
            const head = A.person(g, look, { ...po, x: ax, y: ay, noShadow: true });
            lc.fillStyle = 'rgba(0,0,0,0.45)'; lc.fillRect(Math.round(po.x) - 4, Math.round(po.y) - 1, 9, 2);      // its shadow, on the room
            g.globalCompositeOperation = 'source-atop';
            const fade = Math.max(0, Math.min(1, (bl.land + CHAR_S - t) / 0.35));     // the soot falls away at the end
            g.globalAlpha = 0.85 * fade; g.fillStyle = '#17110d'; g.fillRect(0, 0, W, H);
            g.globalAlpha = fade;
            for (let i = 0; i < 6; i++) {                                              // embers glowing on the soot
                const ex = (i * 37 + Math.floor(t * 6) * 13) % 14 - 7, ey = (i * 23) % 18;
                if ((i + Math.floor(t * 10)) % 3) { g.fillStyle = i % 2 ? '#ff7a1a' : '#ffd040'; g.fillRect(ax + ex, ay - 4 - ey, 1, 1); }
            }
            lc.drawImage(charCv, Math.round(po.x) - ax, Math.round(po.y) - ay);
            // Smoke curling up off them.
            lc.fillStyle = '#6b6670';
            for (let i = 0; i < 4; i++) {
                const k = (t * 0.9 + i / 4) % 1;
                lc.globalAlpha = 0.55 * (1 - k) * fade;
                lc.fillRect(Math.round(po.x - 3 + i * 2 + Math.sin(t * 3 + i) * 2), Math.round(head - 2 - k * 12), 2, 2);
            }
            lc.globalAlpha = 1;
            return head - ay + Math.round(po.y);
        }
        /** Shaking it off: soot and dust dropping off them. */
        function dust(po, t, bl) {
            const k = (t - (bl.end - SHAKE_S)) / SHAKE_S;
            lc.fillStyle = '#8a8178';
            for (let i = 0; i < 8; i++) {
                const side = i % 2 ? 1 : -1, sp = 0.6 + (i % 4) * 0.3;
                lc.globalAlpha = 0.8 * (1 - k);
                lc.fillRect(Math.round(po.x + side * (4 + k * 6 * sp)), Math.round(po.y - 14 + (i % 5) * 2 + k * k * 14 * sp), 1, 1);
            }
            lc.globalAlpha = 1;
        }
        /** Over their heads: stars while they're stunned on the floor, and coughing up smoke. */
        function drawBlasted(t, u, heads) {
            for (const [h, bl] of blasted) {
                const p = people.get(h);
                if (!p || !heads.has(h) || t < bl.land || t > bl.end - SHAKE_S) continue;
                spot(p.x, p.y);
                const hy = heads.get(h), x = p.x * u, f = p.face < 0 ? -1 : 1, s = t - bl.land;
                for (let k = 0; k < 3; k++) {
                    const a2 = t * 6 + k * 2.1;
                    popWord('*', x + Math.cos(a2) * 6 * u, (hy - 3) * u + Math.sin(a2) * 2 * u, u * 0.8, '#ffd34a');
                }
                // A cough every so often: a puff of smoke out of the mouth, and the word.
                const c = s % 0.55;
                if (s > 0.2 && c < 0.4) {
                    ctx.fillStyle = 'rgba(110,104,115,' + (0.7 * (1 - c / 0.4)).toFixed(2) + ')';
                    for (let i = 0; i < 3; i++) {
                        ctx.beginPath();
                        ctx.arc(x + f * (4 + c * 22 + i * 2) * u, (hy + 4 - c * 6 - i) * u, (1 + c * 3 + i * 0.4) * u, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    if (c < 0.3) popWord(Math.floor(s / 0.55) % 2 ? 'cough' : 'hack', x + f * 10 * u, (hy - 8 - c * 8) * u, u * 0.7, '#d8d0c8');
                }
            }
        }
        /** On the duellists: stars when stunned, snowflakes when slowed (one a level, frost at 3), and the fish and snowballs in a row so far. */
        function drawDuels(t, u, heads) {
            const es = Math.max(10, Math.round(3.6 * u / dpr)) * dpr;
            for (const d of duels.values()) {
                if (d.state !== 'fighting' && d.state !== 'ready') continue;
                for (const h of [d.a, d.b]) {
                    const p = people.get(h), s = d.st[h];
                    if (!p || !s || !heads.has(h)) continue;
                    spot(p.x, p.y);
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
                    if (label) spot(p.x, p.y);
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
        /** Over each CRT: what's on and the seats left (gold while there's room to join, bobbing). */
        const crtTops = new Map();
        function openGameSigns(u, t) {
            for (const [h, top] of crtTops) {
                const p = people.get(h), og = p && openGameOf(h);
                if (!og) continue;
                spot(p.x, p.y);
                const free = og.max - og.n, lift = free > 0 ? Math.round(Math.abs(Math.sin(t * 3)) * 2) : 0;
                const text = og.icon + ' ' + og.name + ' · ' + (free > 0 ? free + (free === 1 ? ' SEAT' : ' SEATS') : 'FULL') + (og.busy ? ' · RACING' : '');
                const fs = Math.max(12, Math.round(3.6 * u / dpr)) * dpr;
                ctx.font = 'bold ' + fs + 'px "Courier New", monospace';
                badge(text, crtX(p) * u - (ctx.measureText(text).width + fs * 0.6) / 2, (top - 2 - lift) * u, u, free > 0);
            }
        }
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
                        if (p && heads.has(h)) spot(p.x, p.y);
                        if (p && heads.has(h)) badge(GAME_ICONS[tb.g] + ' JOIN ' + sat + '/' + tb.seats.length, (p.x + 8) * u, (heads.get(h) - 2 - lift) * u, u, true);
                    });
                    continue;
                }
                if (tb.state !== 'playing') continue;
                tb.seats.forEach((h, i) => {
                    const p = people.get(h);
                    if (p) spot(p.x, p.y);
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
            if (kartKeyPick(e)) return;
            if (kartView() && kartKey(e)) return;
            if (hkView() && hkKey(e)) return;
            if (rmOn() && e.key === 'Shift') { keys.add('shift'); return; }                               // the boss fight: Shift flies slow
            if (rmOn() && (e.key === ' ' || e.key.toLowerCase() === 'b')) { if (!e.repeat) rmBomb(); e.preventDefault(); return; }       // Space or B: a bomb
            if (e.key === 'Enter') { input.focus(); e.preventDefault(); return; }
            const k = e.key.toLowerCase();
            if (k === 'j' && bombMine()) { if (!e.repeat) passBomb(); e.preventDefault(); return; }       // hot potato: J passes it
            if (keymap.dash && keyNorm(e.key) === keymap.dash) { sprintKey = true; if (e.repeat) return; }
            if (actionKey(e)) return;
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); e.preventDefault(); }
        });
        listen('keyup', (e) => { keys.delete(e.key.toLowerCase()); if (keymap.dash && keyNorm(e.key) === keymap.dash) sprintKey = false; });
        listen('blur', () => { keys.clear(); sprintKey = false; });

        // Stretch (⛶ in the actions, remembered): the room fills the whole stage, out of shape if it must.
        let stretch = false;
        try { stretch = localStorage.getItem('ltl.hallStretch') === '1'; } catch { /* default */ }
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
            { id: 'look', icon: '🎨', name: 'Change how you look', run: () => openLook() },
            { id: 'stretch', icon: '⛶', name: 'Stretch the room to fill the space (again: keep its shape)', run: () => toggleStretch() }
        ];
        const KEYS0 = Object.fromEntries([...EMOTES.slice(0, 10).map(([id], i) => ['e:' + id, String((i + 1) % 10)]), ['jump', ' '], ['dash', 'Shift'], ['duel:bonk', 'j'], ['duel:slap', 'k'], ['duel:snowball', 'l']]);
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
                return '<button type="button" class="btn' + (a.id === 'stretch' && stretch ? ' on' : '') + '" data-act="' + a.id + '" title="' + esc(a.name) + (k ? ' (' + esc(keyName(k)) + ')' : '') + '">' + a.icon +
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
        function toggleStretch() {
            stretch = !stretch;
            try { localStorage.setItem('ltl.hallStretch', stretch ? '1' : '0'); } catch { /* full */ }
            fit(); paintActs();
            U.toast(stretch ? 'The room stretches to fill the space' : 'The room keeps its shape');
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
            kartDrive(dt);
            if (rmOn()) { rmStep(dt); return; }                               // in a plane: no walking
            if (p && !kartView() && !hkView()) {
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
            spot(p.x, p.y);
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
            // As big as fits: the full width unless the stage is too short for it (no rounding down to whole
            // pixels, which left a wide margin; the room is drawn small and blown up without smoothing, so it stays crisp).
            scale = Math.max(0.5, Math.min(w / A.W, hgt / A.H));
            dpr = Math.min(2, window.devicePixelRatio || 1);
            // Stretched, the canvas keeps the room's shape inside and the page pulls it out to the stage's.
            if (r25) {                                                          // 2.5D: the whole stage (the camera frames the room in it)
                cv.style.width = Math.round(w) + 'px'; cv.style.height = Math.round(hgt) + 'px';
                cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
            } else {
                cv.style.width = Math.round(stretch ? Math.max(w, A.W * 0.5) : A.W * scale) + 'px';
                cv.style.height = Math.round(stretch ? Math.max(hgt, A.H * 0.5) : A.H * scale) + 'px';
                cv.width = Math.round(A.W * scale * dpr);
                cv.height = Math.round(A.H * scale * dpr);
            }
            if (v25) {
                v25.el.hidden = !r25;
                if (r25) { v25.size(cv.width, cv.height); Object.assign(v25.el.style, { left: cv.offsetLeft + 'px', top: cv.offsetTop + 'px', width: cv.style.width, height: cv.style.height }); }
            }
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
                const fr = emoteNow(im), sz = picSize(fr);
                if (!sz) return;
                const pw = Math.min(ph * 1.5, ph * sz[0] / sz[1]), cx = bx + w / 2 + (i - (pics.length - 1) / 2) * ph * 1.15;
                ctx.drawImage(fr, Math.round(cx - pw / 2), Math.round(by + pad * 0.7), Math.round(pw), Math.round(ph));
            });
            ctx.fillStyle = '#141018'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            lines.forEach((ln, i) => ctx.fillText(ln, bx + w / 2, by + pad * 0.8 + ph + i * lh));
        }

        /** The CSS transform that bends a w × h box onto four points (top-left, top-right, bottom-right, bottom-left). */
        function quadMatrix(w, h, P) {
            const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = P;
            const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3, den = dx1 * dy2 - dx2 * dy1 || 1e-9;
            const g = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
            const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3;
            return 'matrix3d(' + [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, x0, y0, 0, 1].map(v => +v.toFixed(6)).join(',') + ')';
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
            tvEl.hidden = false;
            if (r25 && v25) {
                // 2.5D: the video bent onto the screen on the back wall (its four corners where the camera sees them).
                const S = A.screenAt(screenLive, tvK), k = cv.clientWidth / cv.width, w = 320, h = Math.round(320 * S.h / S.w);
                const e = Math.max(0, Math.min(1, tvK)), f = screenLive ? e * e * (3 - 2 * e) : 1;     // the wall's screen, or the TV on the stage
                const P = [[S.x, S.y], [S.x + S.w, S.y], [S.x + S.w, S.y + S.h], [S.x, S.y + S.h]].map(([x, y]) => v25.wallPt(x, y, f));
                if (P.some(q => !q)) { tvEl.hidden = true; return true; }
                const css = 'left:' + cv.offsetLeft + 'px;top:' + cv.offsetTop + 'px;width:' + w + 'px;height:' + h + 'px;transform-origin:0 0;transform:' + quadMatrix(w, h, P.map(([x, y]) => [x * k, y * k]));
                if (tvEl.style.cssText !== css) tvEl.style.cssText = css;
                return true;
            }
            const r = cv.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = r.width / A.W, ky = r.height / A.H, S = A.screenAt(screenLive, tvK);
            const css = 'left:' + (r.left - sr.left + S.x * k) + 'px;top:' + (r.top - sr.top + S.y * ky) + 'px;width:' + (S.w * k) + 'px;height:' + (S.h * ky) + 'px';
            if (tvEl.style.cssText !== css) tvEl.style.cssText = css;
            return true;
        }

        let last = 0;
        function frame(ms) {
            if (stopped) return;
            requestAnimationFrame(frame);
            if (document.hidden || ms - last < 1000 / (hkView() || kartView() || (r25 && !onBattery) ? 60 : FPS) - 2) return;      // the games and 2.5D: 60 a second (2.5D on battery: 30)
            const dt = Math.min(0.1, (ms - (last || ms)) / 1000) * clockRate;
            last = ms;
            step(dt);
            const room25 = !kartView() && !hkView() && !rmOn() && want25();   // the full-screen games draw as they always have
            if (room25 !== r25) { r25 = room25; fit(); paintWatch(); }
            if (watch && (rmOn() || kartView() || hkView())) stopWatch();       // a game takes over the screen: you're up
            if (rmOn() || kartView() || hkView()) tvEl.hidden = true;         // (and FunpostTV's picture isn't left floating over it)
            if (kartView()) { drawRace(dt, now()); return; }
            const hv = hkView();
            if (hkL.was && !hv && hkL.whiteEnd) { hkL.backAt = now(); hkL.whiteEnd = false; }        // Forever 2's ending: back to the hall out of the white
            hkL.was = hv;
            if (hv) { const g = myHk(); hkL.whiteEnd = !!(g && g.state === 'over' && g.mode === 'space' && !g.why); hkFrame(dt, now()); return; }
            if (rmOn()) { rmFrame(now(), dt); return; }
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
            tvNow = !!tv;
            if (watch) {
                if (!tv && intro == null) stopWatch('📺 FunpostTV’s off the stage');
                else if (bt.state === 'enter' || bt.state === 'zap' || isBurger(me)) stopWatch('🍔 Burgertime!');
                else if (ayyMe) stopWatch();
                else watchTick();
            }
            if (v25) v25.watch(watch && r25 ? { seatX: watch.x, live: !!onAir.live, deskX: A.deskX(tvK), look: watch.look, zoom: watch.zoom } : null);
            const hideMe = !!(r25 && watch && watch.seated);
            fadeFrom = hideMe ? watch.y + 4 : null;
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
            cards25 = []; under25 = [];
            // (2.5D has a mirror ball and club lights of its own: the 2D disco ball and spotlights aren't painted on its walls.)
            const fxR = r25 ? { ...(fx || { level: onAir.music ? 2 : 0 }), on: { ...((fx && fx.on) || {}), disco: false, spots: false } } : fx;
            under(() => A.fxBack(lc, t, onAir, fxR));
            if (dbOn()) under(court);
            for (let i = crops.length - 1; i >= 0; i--) {                       // crop circles, under everyone
                const k = t - crops[i].at, c = crops[i];
                if (k > CROP_S) { crops.splice(i, 1); continue; }
                if (k >= 0) under(() => A.cropCircle(lc, c.x, c.y, Math.min(1, k / 0.6, (CROP_S - k) / 10)));
            }
            const sorted = [...people.values()].filter(p => !isEaten(p.h)).sort((a, b) => a.y - b.y), list25 = [];
            const heads = new Map(), fight = duelOf(me);
            crtTops.clear();
            btStep(dt);
            if (btOn() && btStart) under(() => A.wallBurst(lc, t - btStart, 5));
            if (btOn()) under(() => smashMark(t));
            for (let i = swaves.length - 1; i >= 0; i--) { const s = t - swaves[i].at, w = swaves[i]; if (s > 1.4) swaves.splice(i, 1); else under(() => A.shockwave(lc, w.x, w.y, s)); }
            let danielTop = null, danielDrawn = !btD;
            for (const p of sorted) {
                if (!danielDrawn && btD.y < p.y) { card(btD.x, btD.y, 0, 200, 190, 100, 176, () => { danielTop = drawDaniel(t); }); danielDrawn = true; }
                if (isBurger(p.h)) {
                    // Zapped: a burger on legs (with a gold star if it made it).
                    const bl = p.lift || 0;
                    card(p.x, p.y - bl, bl, 48, 64, 24, 58, () => heads.set(p.h, A.burger(lc, p.x, p.y - bl, t, { walking: p.walking, face: p.face, star: bt.state === 'burp' && bt.stars.includes(p.h) }).y), true);
                    continue;
                }
                const ay = ayyLift(p, t);
                if (ay && ay.gone) continue;                                       // up in the UFO
                const [ox, oy] = hits.length ? hitOffset(p, t) : [0, 0];
                // Riding a UFO: dashing or sprinting takes them up a bit.
                const up = p.l && p.l.ride === 1 && (p.dashUntil > t || (p.h === me ? running : p.run)) ? 7 : 0;
                p.hover = (p.hover || 0) + (up - (p.hover || 0)) * Math.min(1, dt * 10);
                const og = !p.walking && openGameOf(p.h);
                const po = { x: p.x + ox, y: p.y + oy - (p.lift || 0) - (ay ? ay.lift : 0), face: p.face, step: p.walking ? Math.floor(t * 8) % 2 : undefined, emote: p.e || (og ? 'sit' : p.e), et: t - p.et, t, talk: p.sayUntil > t,
                    mood: p.f, jumpT: p.jumpAt ? t - p.jumpAt : null, dash: p.dashUntil > t, hover: p.hover, noShadow: !!(ay && ay.lift) };
                if (r25) list25.push({ h: p.h, x: po.x, y: p.y, lift: p.y - po.y });
                (hideMe && p.h === me ? (x, y, l, w, h, ax, ay, fn) => fn() : card)(po.x, p.y, p.y - po.y, 72, 100, 36, 84, () => {
                if (ay) lc.globalAlpha = ay.a;
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
                const bl = blasted.get(p.h);
                if (bl && t >= bl.end) blasted.delete(p.h);
                if (bl && t < bl.end) {
                    if (t > bl.end - SHAKE_S) po.x += Math.floor(t * 30) % 2 ? 1 : -1;      // shaking it off
                    if (t < bl.land + CHAR_S) heads.set(p.h, charred(p.l, po, t, bl));
                    else heads.set(p.h, A.person(lc, p.l, po));
                    if (t > bl.end - SHAKE_S) dust(po, t, bl);
                } else heads.set(p.h, A.person(lc, p.l, po));
                lc.globalAlpha = 1;
                if (au) A.aura(lc, au[1], au[2], po.x, po.y, t, true, p.l, po);
                if (og) crtTops.set(p.h, A.crt(lc, crtX(p), p.y, t, og.kind));
                if (p.star > performance.now()) A.star(lc, po.x, heads.get(p.h) - 4, t);           // survived Burgertime
                if (p.afk) A.afkFlag(lc, po.x, heads.get(p.h), t);                       // away (/afk)
                const back = btBack.get(p.h);
                if (back && t - back < 1) A.sparkle(lc, po.x, po.y, t - back); else if (back) btBack.delete(p.h);
                }, !po.noShadow);
            }
            if (!danielDrawn && btD) card(btD.x, btD.y, 0, 200, 190, 100, 176, () => { danielTop = drawDaniel(t); });
            else if (!danielDrawn) danielTop = drawDaniel(t);
            drawAyy(t);
            for (let i = booms.length - 1; i >= 0; i--) { const s = t - booms[i].at, b = booms[i]; if (s > 2.2) booms.splice(i, 1); else card(b.x, b.y, 0, 120, 120, 60, 84, () => A.explosion(lc, b.x, b.y, s)); }
            if (bt.state === 'burp' && t - btBurp > 2.2 && t - btBurp < 9) under(() => A.rubble(lc, t - btBurp - 2.2, 7));
            under(() => A.lights(lc, t, onAir, fxR));
            if (intro != null && !r25) A.introOver(lc, t, intro, introSecs);     // (2.5D does its own)
            // Off air, Radioman still talks to everyone: from a little frame in the corner, sliding in and out.
            // (2.5D: these frames go over the room, in its bottom corners.)
            let cameoAt = null, boothOn = false;
            if (r25) hudG.clearRect(0, 0, A.W, A.H);
            withLc(r25 ? hudG : lc, () => {
                boothOn = speakerBoxes(dt, t, onAir);
                if (hostTalking && !onAir.live && !boothOn) cameoAt = A.cameo(lc, t, true, Math.min(1, (t - hostSay.at) / 0.25, (hostSay.until - t) / 0.25), air.tag);
            });
            ctx.imageSmoothingEnabled = false;
            const quake = hits.some(x => x.n === 3 && t - x.at > 0.12 && t - x.at < 0.45) || (bt.state === 'burp' && t - btBurp > 2.6 && t - btBurp < 3.6) || (bt.state === 'enter' && t - btStart < 0.7)
                || booms.some(b => t - b.at < 0.5) || swaves.some(w => t - w.at < 0.3) ? cv.width / A.W * 2 : 0;
            if (r25) {
                ctx.clearRect(0, 0, cv.width, cv.height);
                v25.frame({ t, dt, air: onAir, info, talking: hostTalking, deskX: A.deskX(tvK), intro, introSecs, club: !!onAir.music, people: list25, cards: cards25,
                    under: (g) => withLc(g, () => { for (const fn of under25) fn(); }) });
                if (boothOn || cameoAt) {                                       // the corner frames: the room's own size, along the bottom
                    const k = Math.min(cv.width / A.W, cv.height / A.H), hx = (cv.width - A.W * k) / 2, hy = cv.height - A.H * k;
                    ctx.drawImage(hudC, hx, hy, A.W * k, A.H * k);
                    if (cameoAt) cameoAt = { x: (hx + (cameoAt.x + 4) * k) , y: hy + cameoAt.y * k, scr: true };
                }
            } else ctx.drawImage(low, Math.round((Math.random() - 0.5) * quake), Math.round((Math.random() - 0.5) * quake), cv.width, cv.height);
            if (quake) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.25; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
            // Names under feet, bubbles over heads, at screen resolution.
            const u = r25 ? v25.unit : cv.width / A.W, nfs = Math.max(10, Math.round(2.6 * u / dpr)) * dpr;
            spotU = u;
            const meP = mine();
            hideSpot = hideMe && meP ? [meP.x, meP.y] : null;
            const at = (x, y, foot) => r25 ? v25.at(x, y, foot) : [x * u, y * u];
            const far = r25 && v25.far, ub = r25 ? Math.max(u, 2.6 * dpr) : u;     // (2.5D: bubbles stay readable however far back the room is)
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            for (const p of far ? [] : sorted) {
                if (ayyAway.has(p.h) && !heads.has(p.h)) continue;                 // up in the UFO: no name on the floor
                if (hideSpot && p.h === me) continue;
                ctx.font = 'bold ' + nfs + 'px "Courier New", monospace';
                ctx.globalAlpha = fight && p.h !== fight.a && p.h !== fight.b ? 0.3 : 1;
                const [nx, ny] = at(p.x, p.y + 1.5, p.y);
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(p.n, nx + dpr, ny + dpr);
                ctx.fillStyle = p.c || (p.h === me ? '#ffd34a' : '#e6e0f2'); ctx.fillText(p.n, nx, ny);
                if (p.h === me) ctx.fillRect(Math.round(nx - ctx.measureText(p.n).width / 2), Math.round(ny + nfs + dpr), Math.round(ctx.measureText(p.n).width), Math.max(1, dpr));   // underlined: that's you
            }
            ctx.globalAlpha = 1;
            sprintBar(u);
            drawGlows(sorted, heads, u, t);
            drawHeld(sorted, heads, u);
            if (duels.size) drawDuels(t, u, heads);
            if (blasted.size) drawBlasted(t, u, heads);
            if (db.state) drawBall(t, u, heads);
            drawMoods(sorted, heads, u, t);
            drawHits(t, u, heads);
            flat();
            if (hideSpot) watchHands(t);
            if (!far) for (const p of sorted) if (p.sayUntil > t && heads.has(p.h) && !(hideSpot && p.h === me)) bubble(p.say, ...at(p.x, heads.get(p.h), p.y), ub);
            drawBtWords(t, u, danielTop);
            for (const b of booms) if (t - b.at < 1) { spot(b.x, b.y); popWord('BOOM!', b.x * u, (b.y - 26 - (t - b.at) * 8) * u, u * 1.6, '#ff9020'); }
            gameBadges(t, u, heads);
            tableBadges(u, heads, t);
            openGameSigns(u, t);
            flat();
            if (hostTalking && onAir.live) bubble(hostSay.text, ...(r25 ? v25.atStage(A.RADIOMAN_MOUTH.x + A.deskX(tvK) + 16, A.RADIOMAN_MOUTH.y - 6) : [(A.RADIOMAN_MOUTH.x + A.deskX(tvK) + 16) * u, (A.RADIOMAN_MOUTH.y - 6) * u]), u);
            if (cameoAt && t - hostSay.at > 0.2) bubble(hostSay.text, ...(cameoAt.scr ? [cameoAt.x, cameoAt.y] : [(cameoAt.x + 4) * u, cameoAt.y * u]), u);
            drawAbducted(t, u);
            if (t - (hkL.backAt || -9) < 1.4) { ctx.globalAlpha = Math.max(0, 1 - (t - hkL.backAt) / 1.4); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
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
                '<div class="hl-row"><span>Aura colour</span><div>' + [['natural', 'conic-gradient(#ff8fc0 0 25%, #ffb020 0 50%, #5ad0ff 0 75%, #ffffff 0)']].concat(Object.entries(A.AURA_COLORS), [['rainbow', RAINBOW_BG]]).map(([id, c]) =>
                    '<button type="button" class="hl-sw" data-auracolor="' + id + '" title="' + (id === 'natural' ? 'Natural (each aura’s own colours)' : id) + '" style="background:' + c + '"></button>').join('') +
                    '<small class="hl-note">for every aura — Natural keeps each one’s own colours</small></div></div>' +
                sec('Points') +
                ['nice', 'ebil', 'ayy'].map(k => {
                    const n = pointsOf(k), next = REWARDS.find(r => r[0] === k && r[1] > n);
                    return '<div class="hl-row"><span>' + POINTS[k][0] + ' ' + ({ nice: 'Nice', ebil: 'Ebil', ayy: 'Abducted' })[k] + '</span><div class="hl-pts"><b>' + n + '</b> ' +
                        (next ? '<small>next: ' + esc(next[4]) + ' at ' + next[1] + '</small>' : '<small>everything unlocked!</small>') + '<small class="hl-how">' + HOW[k] + '</small></div></div>';
                }).join('') +
                sec('You') +
                '<div class="hl-row"><span>Name</span><form class="hl-name"><input name="n" maxlength="32" value="' + esc(core.name || '') + '" placeholder="Your name">' +
                    '<button class="btn">Save</button></form></div>' +
                '<div class="hl-row"><span>Name colour</span><div>' + ['', ...NAME_COLORS].map(c =>
                    '<button type="button" class="hl-sw hl-nc" data-nc="' + c + '" title="' + (c || 'The usual') + '" style="background:' + (c || '#2a2438') + '">' + (c ? '' : '✕') + '</button>').join('') + '</div></div>' +
                sec('Options') +
                (v25Offered() ? '<div class="hl-row"><span>View</span><select data-view>' +
                    [['auto', 'Auto (Effects ' + ({ simple: 'Simple: 2D', mid: 'Mid: 2.5D', advanced: 'Advanced: 2.5D' })[fxLevel()] + ')'], ['2d', '2D'], ['25d', '2.5D'], ['3d', '3D (coming: 2.5D for now)']].map(([v, n]) =>
                        '<option value="' + v + '"' + (viewPref === v ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' : '') +
                '<div class="hl-row"><span>This panel</span><label class="hl-auto"><input type="checkbox" data-lookauto' + (lookAuto ? ' checked' : '') + '> Close it when I click the room or walk</label></div>' +
                '<div class="hl-row"><span>Fun</span><label class="hl-safe"><input type="checkbox" data-safe' + (safe ? '' : ' checked') + '> Bonks, fish slaps and snowballs ' +
                    '<small>(off: nobody can hit you, and you can’t hit anyone)</small></label></div>' +
                '</div><div class="hl-foot"><button type="button" class="btn" data-rand>🎲 Surprise me</button><button type="button" class="btn btn-primary" data-done>Done</button></div></div>';
            paintLook();
        }
        const HOW = { nice: 'give people what you’re holding (click them → 🎁 Give)', ebil: 'pass a lit 💣 on (hand someone a bomb to start hot potato)', ayy: 'get taken by the UFO (it comes now and then when someone says “ayy lmao”)' };
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
            if (e.target.matches('[data-view]')) { viewPref = e.target.value; try { localStorage.setItem('ltl.hallView', viewPref); } catch { /* this time only */ } return; }
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
                setAura(!id || aura.split(':')[0] === id ? '' : withColor(id, auraColor));
                return paintLook();
            }
            if (ac) {
                // The aura colour: for the one you have on now, and the next you pick.
                auraColor = ac.dataset.auracolor;
                try { localStorage.setItem('ltl.hallAuraColor', auraColor); } catch { /* full */ }
                const kind = aura.split(':')[0];
                if (kind) setAura(withColor(kind, auraColor));
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
