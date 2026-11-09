/* =============================================================
   THE HALL'S ART — everything in the room, drawn in pixels on a
   240×150 canvas that the window scales up without smoothing.
   No image files: the room, the people and Radioman are drawn
   from rectangles and a few small pixel maps, so a new hair
   style or colour is a line of code.
   ============================================================= */
(function () {
    'use strict';

    const W = 240, H = 150;
    /** Where people can walk, in room pixels (their feet). */
    const FLOOR = { x0: 8, x1: 232, y0: 66, y1: 146 };

    /* ---------- the parts a look is made of (counts match engine/hall.js LOOK) ---------- */
    // People colours, then fun ones: pink, red, purple, blue, green, yellow, Radioman grey.
    const SKIN = ['#f6d2b8', '#f1c19b', '#ddb08c', '#c98c5e', '#8d5a3b', '#5c3a24',
        '#ff9ad2', '#e8564a', '#a77cf0', '#6aa8ff', '#6fd46f', '#f5e04b', '#bdbdbd'];
    const HAIR_COLOR = ['#1b1b1b', '#3a2416', '#7a3b1e', '#c2402e', '#f2d24b', '#e8e4d8', '#5b5b66', '#3fae5a', '#d65ca8'];
    const SHIRT = [['#c8432f', '#ff6b4f'], ['#2f8f48', '#4fd36e'], ['#b84a8e', '#ff7ccc'], ['#2f66b8', '#5aa0ff'], ['#c9861f', '#ffc046'],
        ['#6448b0', '#9f80ff'], ['#24242c', '#44444f'], ['#c8c4d0', '#ffffff'], ['#1f9a9a', '#4fe0e0'], ['#b8a222', '#f5e04b']];
    const PANTS = ['#2b2b3a', '#3b5a9a', '#5a4632', '#6b6b75', '#1f4a2e', '#7a2a3a'];
    const PARTS = [
        { key: 'skin', label: 'Skin', colors: SKIN },
        { key: 'hair', label: 'Hair', names: ['None', 'Short', 'Spiky', 'Long', 'Bowl', 'Mohawk', 'Bun'] },
        { key: 'hairColor', label: 'Hair colour', colors: HAIR_COLOR },
        { key: 'face', label: 'Face', names: ['Plain', 'Beard', 'Moustache', 'Blush', 'Freckles', 'Glowing eyes'] },
        { key: 'top', label: 'Top', names: ['Tee', 'Hoodie', 'Jacket', 'Tank', 'Suit', 'Dress'] },
        { key: 'shirt', label: 'Colour', colors: SHIRT.map(s => s[1]) },
        { key: 'pants', label: 'Pants', colors: PANTS },
        { key: 'extra', label: 'Extra', names: ['None', 'Cap', 'Headphones', 'Shades', 'Crown', 'Beanie', 'Bow', 'Halo', 'Horns', 'Party hat', 'Flower', 'Burger',
            'Flower crown', 'Tiara', 'Skull mask', 'Demon horns', 'Crown of flames'] },
        { key: 'back', label: 'Back', names: ['None', 'Angel wings', 'Fairy wings', 'Seraph wings', 'Devil tail', 'Bat wings', 'Villain cape'] }
    ];
    // Anyone can have these; the rest are earned (the secret burger, and what nice and ebil points unlock: app/ui/hall.js REWARDS).
    const FREE = { extra: 11, back: 1, face: 5 };
    const randomLook = () => Object.fromEntries(PARTS.map(p => [p.key, Math.floor(Math.random() * (FREE[p.key] || (p.colors || p.names).length))]));

    /* ---------- a tiny 3×5 pixel font (rows of 3 bits: 4 left, 2 middle, 1 right) ---------- */
    const FONT = {
        A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11153',
        K: '55655', L: '44447', M: '57755', N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222',
        U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
        0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34656', 7: '71222', 8: '75757', 9: '75711',
        ' ': '00000', '-': '00700', '.': '00002', '!': '22202', "'": '22000', ':': '02020', '?': '61202', '&': '25253',
        '/': '11244', '(': '12221', ')': '42224', ',': '00024', '#': '57575', '+': '02720', '[': '64446', ']': '31113', '♪': '32266', '*': '05250', '%': '41214', '@': '25743', '=': '07070'
    };
    function text(l, str, x, y, color) {
        l.fillStyle = color;
        for (const ch of String(str).toUpperCase()) {
            const g = FONT[ch];
            if (!g) { x += 4; continue; }                 // a letter the little font hasn't got: a gap
            for (let r = 0; r < 5; r++) {
                const bits = +g[r];
                if (bits & 4) l.fillRect(x, y + r, 1, 1);
                if (bits & 2) l.fillRect(x + 1, y + r, 1, 1);
                if (bits & 1) l.fillRect(x + 2, y + r, 1, 1);
            }
            x += 4;
        }
        return x;
    }
    const textWidth = (str) => String(str).length * 4 - 1;

    /* ---------- drawing helpers ---------- */
    let l = null;                           // the low-res context being drawn
    const R = (x, y, w, h, c) => { l.fillStyle = c; l.fillRect(Math.round(x), Math.round(y), w, h); };
    /** Pixels along an arc, so it stays crisp when scaled. */
    function arc(cx, cy, r, a0, a1, c) {
        l.fillStyle = c;
        const steps = Math.max(6, Math.round(r * Math.abs(a1 - a0)));
        let last = '';
        for (let i = 0; i <= steps; i++) {
            const a = a0 + (a1 - a0) * i / steps, x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r), k = x + ',' + y;
            if (k !== last) { l.fillRect(x, y, 1, 1); last = k; }
        }
    }

    /* =========================================================
       RADIOMAN — the host, behind his desk (he's a microphone: no mic, a coffee)
       ========================================================= */
    // d dome, D dome shade, m the mark on his dome, f face, s lower face, e ear,
    // b brow, w eye white, k pupil / mouth, t teeth
    const RM_HEAD = [
        '.......dddddd.......',
        '....dddddddddddd....',
        '...dddddddddddddD...',
        '..ddmddmddmddddddD..',
        '..dddmdmdmdddddddD..',
        '..ddmmmmmmmddddddDD.',
        '..dddmdmdmddddddDDD.',
        '..ddmddmddmdddddDDD.',
        '..ddddddddddddddDDD.',
        'e.ffffffffffffffff.e',
        'e.fbbbfffffffbbbff.e',
        'eeffwkkfffffffwkkfee',
        'eeffffffffffffffffee',
        'e.ssfffffffffffffs.e',
        'e.sssfkkkkkkkkkfss.e',
        '..sssfkkkkkkkttfss..',
        '..ssssfkkkkkkkfsss..',
        '...ssssskkkkkssss...',
        '....ssssssssssss....',
        '......ssssssss......'
    ];
    const RM_PAL = { d: '#c9c9c9', D: '#aaaaaa', m: '#8e8e8e', f: '#bdbdbd', s: '#a3a3a3', e: '#9c9c9c', b: '#3a3a3a', w: '#f4f4f4', k: '#151515', t: '#f4f4f4' };
    // Talking: the mouth closes a little every other frame.
    const RM_MOUTH_SMALL = { 14: 'e.sssffffffffffss.e', 15: '..sssffkkkkkkttfss..', 16: '..ssssfkkkkkkkfsss..', 17: '...sssssssssssss....' };
    const RX = 120, RY = 13;                // his head's top centre

    function radioman(t, air) {
        const nod = air.music ? (Math.floor(t * 4) % 2) : 0;            // nods along twice a second
        const talking = air.talking;
        const small = talking && Math.floor(t * 7) % 2 === 1;
        // Jacket, then the head on top of it.
        for (let r = 0; r < 14; r++) {
            const w = 22 + Math.min(r, 4) * 2;
            R(RX - w / 2, RY + 19 + r, w, 1, '#6f7480');
        }
        R(RX - 5, RY + 19, 10, 2, '#8a909c');                         // collar
        R(RX - 1, RY + 23, 1, 1, '#4c515c'); R(RX - 1, RY + 27, 1, 1, '#4c515c');
        const hy = RY + nod;
        RM_HEAD.forEach((row, r) => {
            if (small && RM_MOUTH_SMALL[r]) row = RM_MOUTH_SMALL[r].padEnd(20, '.').slice(0, 20);
            for (let c = 0; c < row.length; c++) {
                const ch = row[c];
                if (ch !== '.') R(RX - 10 + c, hy + r, 1, 1, RM_PAL[ch]);
            }
        });
        // Talk lines off the side of his mouth (his coffee's on the other side).
        if (talking) {
            const f = Math.floor(t * 6) % 2, x = RX + 12, y = hy + 15;
            R(x, y - 4 - f, 2 + f, 1, '#ffffff');
            R(x + 1, y, 3 + f, 1, '#ffffff');
            R(x, y + 4 + f, 2 + f, 1, '#ffffff');
        }
        desk(t, air.live, true, nod);
    }
    /** The desk, its ON AIR lamp and his coffee (and his hands on it, when he's there). */
    function desk(t, lit, hands, nod) {
        R(RX - 28, RY + 30, 56, 3, '#8a5a3a'); R(RX - 28, RY + 30, 56, 1, '#a8774f');
        R(RX - 26, RY + 33, 52, 11, '#5a3a22');
        if (hands) { R(RX - 13, RY + 28, 5, 3, '#b0b0b0'); R(RX + 9, RY + 28, 5, 3, '#b0b0b0'); }
        // The ON AIR lamp on the desk's front.
        R(RX - 13, RY + 36, 26, 7, '#1a1020');
        text(l, 'ON AIR', RX - 11, RY + 37, lit ? (Math.floor(t * 2) % 2 ? '#ff4a4a' : '#ff2a2a') : '#4a2a2a');
        // His coffee: a mug on the desk, well clear of his left hand (RX - 13), steam curling up.
        const cx = RX - 22, cy = RY + 25;
        R(cx, cy, 5, 5, '#e8e2d6'); R(cx, cy, 5, 1, '#fffaf0'); R(cx + 4, cy + 1, 1, 4, '#c8c0b2');   // the mug
        R(cx + 1, cy + 1, 3, 1, '#4a2a16');                                                           // the coffee
        R(cx - 2, cy + 1, 2, 1, '#e8e2d6'); R(cx - 2, cy + 1, 1, 3, '#e8e2d6'); R(cx - 2, cy + 3, 2, 1, '#e8e2d6');   // the handle
        R(cx + 1, cy + 3, 3, 1, '#c0392b');                                                           // a stripe
        l.globalAlpha = 0.55;
        for (let i = 0; i < 2; i++) {
            const k = (t * 0.8 + i * 0.5) % 1, sy = cy - 1 - Math.floor(k * 6);
            R(cx + 1 + i * 2 + Math.round(Math.sin(t * 3 + i * 2 + k * 5)), sy, 1, 2, '#ffffff');
        }
        l.globalAlpha = 1;
    }

    /* =========================================================
       THE ENTRANCE — the go-live countdown. The screen counts down;
       near the end smoke fills the stage, the desk appears out of
       nowhere as it clears, and Radioman walks out from the wings
       to it, sitting down just as the show goes live.
       `left` = seconds to live (0 or less: just gone live).
       ========================================================= */
    const ENTRANCE = 4.5;                   // seconds of smoke, desk and walk (fewer if the countdown's shorter)
    function phases(secs) {
        const E = Math.min(ENTRANCE, Math.max(1, secs)), k = E / ENTRANCE;
        return { smoke: E, desk: E - 1.5 * k, clear: 1.5 * k, sit: 0.6 * k };
    }
    /** Radioman on his feet, his head's top at y: jacket, trousers, fancy gold slippers, legs swapping as he walks. */
    function rmStanding(x, y, step) {
        RM_HEAD.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] !== '.') R(x - 10 + c, y + r, 1, 1, RM_PAL[row[c]]); });
        for (let r = 0; r < 12; r++) { const w = 16 + Math.min(r, 3) * 2; R(x - w / 2, y + 19 + r, w, 1, '#6f7480'); }
        R(x - 5, y + 19, 10, 2, '#8a909c');                                      // collar
        R(x - 1, y + 23, 1, 1, '#4c515c'); R(x - 1, y + 27, 1, 1, '#4c515c');   // buttons
        const a = step ? 1 : -1;                                                 // arms swinging, then legs
        R(x - 12, y + 21 + a, 2, 8, '#646a76'); R(x + 10, y + 21 - a, 2, 8, '#646a76');
        R(x - 12, y + 29 + a, 2, 2, '#b0b0b0'); R(x + 10, y + 29 - a, 2, 2, '#b0b0b0');
        R(x - 5 + a, y + 31, 4, 5, '#3a3d48'); R(x + 1 - a, y + 31, 4, 5, '#3a3d48');
        // Fancy gold slippers: a curled-up toe (he walks right), a shine, a darker sole.
        for (const sx of [x - 6 + a, x + 1 - a]) {
            R(sx, y + 35, 4, 1, '#e8b830'); R(sx, y + 36, 6, 1, '#d4a020'); R(sx, y + 37, 6, 1, '#8a6410');
            R(sx + 6, y + 35, 1, 1, '#ffd84a');                                    // the curl
            R(sx + 1, y + 35, 1, 1, '#fff2a8');                                    // the shine
            R(sx + 4, y + 35, 1, 1, '#e0304a');                                    // a ruby on the toe
        }
    }
    /** The middle of the stage during the countdown (in place of centre()). */
    function entrance(t, left, secs, air, info) {
        const P = phases(secs);
        if (left > P.desk) return centre(t, { ...air, live: false }, { ...info, tv: left > P.smoke && info.tv });
        if (left <= 0) return radioman(t, { ...air, live: true, talking: false });
        // Out of the wings on the left to his chair, then down into it.
        const walk = Math.min(1, (P.desk - left) / Math.max(0.1, P.desk - P.sit)), x = Math.round(34 + (RX - 34) * walk);
        const step = walk < 1 ? Math.floor(t * 6) % 2 : 0, y = left > P.sit ? 12 : 12 + Math.round(1 - left / P.sit);
        rmStanding(x, y + (walk < 1 ? step : 0), step);
        l.globalAlpha = Math.min(1, (P.desk - left) / 0.3);
        desk(t, false, false, 0);
        l.globalAlpha = 1;
    }
    /** Over everything: the countdown on the screen, the smoke, the magic, and ON AIR at zero. */
    function introOver(t, left, secs) {
        const P = phases(secs);
        // The right-hand screen counts down; at zero it says so.
        const S = SCREEN;
        R(S.x, S.y, S.w, S.h, '#0b0610');
        if (left > 0) {
            const n = String(Math.ceil(left)), frac = left - Math.floor(left), big = frac > 0.85 ? 4 : 3;
            text(l, 'LIVE IN', S.x + Math.round((S.w - textWidth('LIVE IN')) / 2), S.y + 2, '#ff9ad2');
            l.save(); l.translate(S.x + Math.round((S.w - textWidth(n) * big) / 2), S.y + 9 - (big - 3) * 2); l.scale(big, big);
            text(l, n, 0, 0, left <= 3 ? '#ff4a4a' : '#ffc046');
            l.restore();
        } else if (Math.floor(-left * 4) % 2 === 0) {
            l.save(); l.translate(S.x + Math.round((S.w - textWidth('ON AIR') * 2) / 2), S.y + 8); l.scale(2, 2);
            text(l, 'ON AIR', 0, 0, '#ff2a2a');
            l.restore();
        }
        // Smoke: thickening over the stage, then clearing to show the desk.
        const d = left > P.smoke ? 0 : left > P.desk ? (P.smoke - left) / (P.smoke - P.desk) : Math.max(0, 1 - (P.desk - left) / P.clear);
        if (d > 0) {
            l.fillStyle = '#d8d4f0';
            for (let i = 0; i < 26; i++) {
                const x = 30 + (i * 37) % 180 + Math.sin(t * 0.6 + i) * 6, y = 10 + (i * 13) % 44 + Math.cos(t * 0.5 + i * 2) * 3;
                puff(x, y, 24 + (i % 4) * 4, 11 + (i % 3) * 3, 0.95 * d);
            }
            l.globalAlpha = 1;
        }
        // The desk appearing: a flash, a ring and sparkles where it lands.
        const m = P.desk - left;
        if (m >= 0 && m < 0.9) {
            const f = 1 - m / 0.9;
            l.fillStyle = '#ffffff'; puff(RX, RY + 36, 34, 13, 1.4 * f); l.globalAlpha = f;
            arc(RX, RY + 36, 6 + m * 40, 0, Math.PI * 2, '#fff6a8');
            for (let i = 0; i < 18; i++) {
                const a = hash(i) * Math.PI * 2, r = 4 + m * (20 + hash(i + 9) * 24);
                R(RX + Math.cos(a) * r, RY + 36 + Math.sin(a) * r * 0.6, 1, 1, i % 3 ? '#fff6a8' : '#ffffff');
            }
            l.globalAlpha = 1;
        }
    }

    /**
     * Radioman off stage (not live, but typing in chat): his head in a little
     * frame in the bottom-left corner, mouth going. `k` 0–1 slides it in.
     * Returns the frame's top centre, for the speech bubble.
     */
    function cameo(t, talking, k, tag) {
        const fw = 26, fh = 32, x = Math.round(3 - (1 - k) * (fw + 6)), y = H - fh - 3;
        R(x - 1, y - 1, fw + 2, fh + 2, '#ffffff'); R(x, y, fw, fh, '#1d1830');
        for (let i = 0; i < fw; i += 4) R(x + i, y, 2, fh, '#211b37');           // the studio wall behind him
        const small = talking && Math.floor(t * 7) % 2 === 1, bob = talking ? Math.floor(t * 4) % 2 : 0;
        RM_HEAD.forEach((row, r) => {
            if (small && RM_MOUTH_SMALL[r]) row = RM_MOUTH_SMALL[r].padEnd(20, '.').slice(0, 20);
            for (let c = 0; c < row.length; c++) if (row[c] !== '.') R(x + 3 + c, y + 3 + r + bob, 1, 1, RM_PAL[row[c]]);
        });
        if (talking && Math.floor(t * 6) % 2) { R(x + fw - 2, y + 15, 1, 1, '#ffffff'); R(x + fw - 3, y + 19, 2, 1, '#ffffff'); }
        // A little red name strip (the studio sets the name): centred if it fits, scrolling if it doesn't.
        const name = String(tag == null ? 'LRM' : tag).toUpperCase(), nw = textWidth(name);
        R(x, y + fh - 7, fw, 7, '#d0302a');
        if (nw <= fw - 2) text(l, name, x + Math.round((fw - nw) / 2), y + fh - 6, '#ffffff');
        else {
            const loop = nw + 12, off = Math.floor((t * 14) % loop);
            l.save(); l.beginPath(); l.rect(x + 1, y + fh - 7, fw - 2, 7); l.clip();
            text(l, name, x + 1 - off, y + fh - 6, '#ffffff'); text(l, name, x + 1 - off + loop, y + fh - 6, '#ffffff');
            l.restore();
        }
        return { x: x + fw / 2, y: y - 1 };
    }

    /* =========================================================
       SPEAKER BOXES — on a call (or a voicemail on air): Radioman's
       frame bottom-left, each caller's bottom-right, mouths going
       while they talk. A caller with no look is Anonymous: the
       green man, of 4chan fame.
       ========================================================= */
    // g green skin, G its shade, k eyes / mouth, w shirt, t tie, s suit
    const ANON_HEAD = [
        '......gggggggg......',
        '....gggggggggggG....',
        '...ggggggggggggggG..',
        '..gggggggggggggggG..',
        '..gggggggggggggggGG.',
        '..gggggggggggggggGG.',
        '..gggkkggggggkkggGG.',
        '..gggkkggggggkkggGG.',
        '..gggggggggggggggGG.',
        '..gggggggggggggggGG.',
        '..ggggkggggggkgggGG.',
        '..gggggkkkkkkggggG..',
        '...ggggggggggggggG..',
        '....ggggggggggggG...',
        '......ggggggggg.....',
        '.....wwwwwttwwww....',
        '...sssswwwttwwwsss..',
        '..sssssswwttwwsssss.',
        '.sssssssswttwsssssss',
        'sssssssssttssssssss.'
    ];
    const ANON_PAL = { g: '#7fbf6a', G: '#66a352', k: '#1c2a18', w: '#f2f2f2', t: '#1e1e26', s: '#2b2b33' };
    // Talking: the smile opens and closes.
    const ANON_MOUTH_OPEN = { 10: '..gggggggggggggggGG.', 11: '..gggggkkkkkkggggG..', 12: '...ggggkkkkkkgggggG.' };

    function sprite(rows, pal, x, y, swap) {
        rows.forEach((row, r) => {
            if (swap && swap[r]) row = swap[r].padEnd(20, '.').slice(0, 20);
            for (let c = 0; c < row.length; c++) if (row[c] !== '.') R(x + c, y + r, 1, 1, pal[row[c]]);
        });
    }

    /**
     * One speaker box. side -1 = bottom-left (sliding in from the left), 1 = bottom-right;
     * slot 0 is the corner, 1 and 2 sit further in. who = { rm: true } | { look } | {} (Anonymous).
     * `k` 0–1 slides it in; returns the box's top centre (for a speech bubble).
     */
    function speakerBox(t, side, slot, k, talking, name, who, strip) {
        const fw = 26, fh = 32, gap = 4, off = (1 - k) * (fw + 6 + slot * (fw + gap));
        const x = side < 0 ? Math.round(3 + slot * (fw + gap) - off) : Math.round(W - 3 - fw - slot * (fw + gap) + off), y = H - fh - 3;
        R(x - 1, y - 1, fw + 2, fh + 2, talking ? '#ffffff' : '#bdb6d0'); R(x, y, fw, fh, '#1d1830');
        for (let i = 0; i < fw; i += 4) R(x + i, y, 2, fh, '#211b37');           // the wall behind them
        const flap = talking && Math.floor(t * 7) % 2 === 1, bob = talking ? Math.floor(t * 4) % 2 : 0;
        if (who.rm) sprite(RM_HEAD, RM_PAL, x + 3, y + 3 + bob, flap ? RM_MOUTH_SMALL : null);
        else if (who.look) {
            // Their own character, close up: twice the size, head and shoulders.
            l.save();
            l.beginPath(); l.rect(x, y, fw, fh - 7); l.clip();
            l.translate(x + fw / 2 - 1, y + 3 + bob); l.scale(2, 2);
            person(l, who.look, { x: 0, y: 15, face: side < 0 ? 1 : -1, t, talk: talking, noShadow: true });
            l.restore();
        } else sprite(ANON_HEAD, ANON_PAL, x + 3, y + 3 + bob, flap ? ANON_MOUTH_OPEN : null);
        // Little sound marks on the side facing the room.
        if (talking && Math.floor(t * 6) % 2) {
            const sx = side < 0 ? x + fw - 2 : x + 1;
            R(sx, y + 15, 1, 1, '#ffffff'); R(side < 0 ? sx - 1 : sx, y + 19, 2, 1, '#ffffff');
        }
        // A name strip: centred if it fits, scrolling if it doesn't.
        const label = String(name || 'ANONYMOUS').toUpperCase(), nw = textWidth(label);
        R(x, y + fh - 7, fw, 7, strip);
        if (nw <= fw - 2) text(l, label, x + Math.round((fw - nw) / 2), y + fh - 6, '#ffffff');
        else {
            const loop = nw + 12, o = Math.floor((t * 14) % loop);
            l.save(); l.beginPath(); l.rect(x + 1, y + fh - 7, fw - 2, 7); l.clip();
            text(l, label, x + 1 - o, y + fh - 6, '#ffffff'); text(l, label, x + 1 - o + loop, y + fh - 6, '#ffffff');
            l.restore();
        }
        return { x: x + fw / 2, y: y - 1 };
    }

    /* =========================================================
       THE ROOM
       ========================================================= */
    /** The Sign's colours (as on the LED sign itself). */
    const SIGN_COLORS = { red: '#ff3030', amber: '#ffb21c', green: '#33ff6e', cyan: '#2be6ff', pink: '#ff4fd8', white: '#f2f2ff', rainbow: '#ff4fd8' };
    const TILE = ['#2a1a40', '#1a2a40', '#40182c', '#183a30'];
    const LIT = ['#b04fd0', '#4f8cff', '#ff5a8a', '#3fd38f'];

    function speaker(x, t, music, side) {
        R(x, 24, 20, 34, '#2a2438'); R(x, 24, 20, 1, '#3d3552');
        const pump = music && Math.floor(t * 4) % 2 ? 1 : 0;
        R(x + 6, 28, 8, 7, '#0c0a12'); R(x + 8, 30, 4, 3, '#2a2438');
        R(x + 3 - pump, 39 - pump, 14 + 2 * pump, 14 + 2 * pump, '#0c0a12');
        R(x + 7, 43, 6, 6, '#3d3552'); R(x + 9, 45, 2, 2, '#0c0a12');
        if (!music) return;
        // Noise lines: arcs rolling out of the woofer into the room.
        const cx = x + 10, cy = 46, out = side < 0 ? 0 : Math.PI;
        for (let i = 0; i < 3; i++) {
            const r = 12 + ((t * 18 + i * 6) % 18);
            const a = Math.max(0, 1 - (r - 12) / 18);
            l.globalAlpha = 0.25 + 0.75 * a;
            arc(cx, cy, r, out - 0.7, out + 0.7, i % 2 ? '#ffc046' : '#ffffff');
        }
        l.globalAlpha = 1;
    }

    /**
     * The whole room behind the people. `air` = { live, talking, music };
     * `info` = { station, song } for the sign and the screen.
     */
    function room(ctx, t, air, info) {
        l = ctx;
        const beat = Math.floor(t * 2);
        // Back wall.
        R(0, 0, W, 58, '#1d1830');
        for (let x = 0; x < W; x += 8) R(x, 0, 4, 58, '#211b37');
        R(0, 56, W, 2, '#120f1c');
        // The station's name in lights, on the left wall.
        const name = (info.station || 'On Air').toUpperCase().replace(/[^A-Z0-9 !&#+\-.]/g, '').trim().slice(0, 12) || 'ON AIR';
        const nw = textWidth(name), nx = Math.round(62 - nw / 2);
        R(nx - 3, 7, nw + 6, 11, '#120e1e');
        l.globalAlpha = 0.35; text(l, name, nx + 1, 11, '#ff5ab0'); l.globalAlpha = 1;
        text(l, name, nx, 10, air.music && beat % 2 ? '#ff9ad2' : '#ff5ab0');
        // The screen on the right: what's on. While live, FunpostTV plays here (the window lays
        // it over); off air it gets the centre of the stage instead (see centre()).
        const tvK = air.live ? info.tvK || 0 : 0;
        if (tvK > 0) {
            // Live with FunpostTV on: its screen moves off the wall to the middle of the stage, growing as it goes.
            const S = screenAt(true, tvK);
            floor(t, air, beat);
            if (tvK >= 1) screenStand(CENTRE_TV);
            R(S.x - 2, S.y - 2, S.w + 4, S.h + 4, '#05050a'); R(S.x, S.y, S.w, S.h, '#000000');
            if (info.tv) ticker(S.x - 2, S.y + S.h + 2, S.w + 4, t, info);
            return;
        }
        R(150, 6, 60, 30, '#05050a'); R(152, 8, 56, 26, '#0b1424');
        const chip = air.live ? 'LIVE' : 'AUTODJ';
        R(153, 9, textWidth(chip) + 2, 7, air.live ? '#d0302a' : '#2f66b8');
        text(l, chip, 154, 10, '#ffffff');
        const song = (info.song || '').toUpperCase();
        l.save(); l.beginPath(); l.rect(153, 17, 54, 6); l.clip();
        if (song) {
            const sw = textWidth(song) + 20, off = song.length > 13 ? (t * 14) % sw : 0;
            text(l, song, 154 - off, 18, '#ffc046');
            if (song.length > 13) text(l, song, 154 - off + sw, 18, '#ffc046');
        }
        l.restore();
        for (let i = 0; i < 13; i++) {
            const h = air.music ? 1 + Math.round((Math.sin(t * 7 + i * 1.3) * 0.5 + 0.5) * (beat % 2 ? 7 : 5)) : 1;
            R(154 + i * 4, 33 - h, 3, h, i % 2 ? '#ff6b4f' : '#ffc046');
        }
        floor(t, air, beat);
    }

    /** Under FunpostTV: the station's Sign scrolling (or what's playing, if the Sign is off). */
    function ticker(x, y, w, t, info) {
        R(x, y, w, 8, '#05050a'); R(x + 1, y + 1, w - 2, 6, '#140a06');
        const sign = info.sign && info.sign.items && info.sign.items.filter(Boolean);
        const msg = (sign && sign.length ? sign.map(s => String(s).replace(/\s+/g, ' ').trim()).join('    *    ') : '♪ ' + (info.song || 'FunpostTV')).toUpperCase();
        const col = SIGN_COLORS[info.sign && info.sign.color] || SIGN_COLORS.amber;
        l.save(); l.beginPath(); l.rect(x + 2, y + 1, w - 4, 6); l.clip();
        const tw = textWidth(msg) + 24, off = (t * 16) % tw;
        text(l, msg, x + 3 - off, y + 2, col); text(l, msg, x + 3 - off + tw, y + 2, col);
        l.restore();
    }

    /* The middle of the stage: Radioman at his desk while the show is live; off air,
       FunpostTV big in the middle if it's on, or else a big radio playing the AutoDJ. */
    const CENTRE_TV = { x: 84, y: 3, w: 72, h: 34 };
    function centre(t, air, info) {
        if (air.live) return deskSide(t, air, info.tvK || 0);
        if (info.tv) {
            const S = CENTRE_TV;
            screenStand(S);
            R(S.x - 3, S.y - 2, S.w + 6, S.h + 4, '#05050a'); R(S.x, S.y, S.w, S.h, '#000000');
            ticker(S.x - 3, S.y + S.h + 2, S.w + 6, t, info);
            return;
        }
        boombox(t, air);
    }
    /* The desk's teleport: FunpostTV coming on while live puts the desk (and Radioman) where the
       wall screen was, in a puff of magic halfway through the screen's move; back again after. */
    const DESK_ASIDE = 60;
    const deskX = (k) => (k >= 0.5 ? DESK_ASIDE : 0);
    function deskSide(t, air, k) {
        const gone = k > 0.38 && k < 0.62;                                       // between the two places
        if (!gone) {
            l.save(); l.translate(deskX(k), 0);
            radioman(t, air);
            l.restore();
        }
        if (k <= 0.15 || k >= 0.85) return;
        // Puffs and sparkles at both places: strongest at the moment he goes.
        const f = Math.max(0, 1 - Math.abs(k - 0.5) / 0.35);
        for (const x of [RX, RX + DESK_ASIDE]) {
            l.fillStyle = '#e8e0ff'; puff(x, RY + 24, 26, 18, 0.9 * f);
            l.globalAlpha = f;
            for (let i = 0; i < 14; i++) {
                const a = hash(i + x) * Math.PI * 2, r = 6 + (1 - f) * 22 + hash(i * 7 + x) * 10;
                R(x + Math.cos(a) * r, RY + 24 + Math.sin(a) * r * 0.7, 1, 1, i % 3 ? '#fff6a8' : '#ffffff');
            }
            l.globalAlpha = 1;
        }
    }
    /** A projector screen's tripod: a pole down the middle and two legs splayed out onto the stage. */
    function screenStand(S) {
        const top = S.y + S.h, foot = 57, cx = S.x + S.w / 2, metal = '#7c7890', shine = '#b4b0c8', splay = 0.4;
        const legX = (side, y) => Math.round(cx + side * (S.w / 2 - 10) + side * (y - top) * splay);
        R(cx - 1, top, 2, foot - top, metal); R(cx - 1, top, 1, foot - top, shine);
        for (const side of [-1, 1]) {
            for (let y = top; y < foot; y++) { const x = legX(side, y); R(x, y, 2, 1, metal); R(side < 0 ? x : x + 1, y, 1, 1, shine); }
            const fx = legX(side, foot);
            R(fx - 1, foot, 4, 1, '#1a1424');                                     // its foot on the stage
        }
        R(cx - 2, foot, 4, 1, '#1a1424');
        const by = foot - 5;                                                      // the brace between the legs
        R(legX(-1, by) + 1, by, legX(1, by) - legX(-1, by), 1, metal);
    }
    function boombox(t, air) {
        const cx = RX, top = 16, pump = air.music && Math.floor(t * 4) % 2 ? 1 : 0;
        R(cx - 2, top - 9, 1, 9, '#8a8aa0');                                   // antenna
        R(cx - 20, top - 3, 40, 3, '#3d3552'); R(cx - 20, top - 3, 3, 6, '#3d3552'); R(cx + 17, top - 3, 3, 6, '#3d3552');   // handle
        R(cx - 30, top, 60, 33, '#2b2838'); R(cx - 30, top, 60, 2, '#4a4360'); R(cx - 30, top + 31, 60, 2, '#1a1724');
        for (const sx of [cx - 17, cx + 17]) {                                  // speakers, thumping with the music
            R(sx - 9 - pump, top + 9 - pump, 18 + 2 * pump, 18 + 2 * pump, '#0c0a12');
            R(sx - 6, top + 12, 12, 12, '#3d3552'); R(sx - 2, top + 16, 4, 4, '#0c0a12');
        }
        R(cx - 7, top + 5, 14, 9, '#0b1424');                                   // the dial
        text(l, 'FM', cx - 3, top + 7, air.music ? '#ffc046' : '#665');
        R(cx - 7, top + 17, 14, 2, '#5a5470'); R(cx - 7 + Math.round((Math.sin(t * 0.7) * 0.5 + 0.5) * 12), top + 16, 1, 4, '#ff4a4a');
        for (let i = 0; i < 3; i++) R(cx - 6 + i * 5, top + 23, 3, 2, i === 1 ? '#d0302a' : '#5a5470');   // buttons
        if (!air.music) return;
        for (const [sx, dir] of [[cx - 17, Math.PI], [cx + 17, 0]]) {            // noise lines out of both sides
            for (let i = 0; i < 2; i++) {
                const r = 13 + ((t * 18 + i * 7) % 14);
                l.globalAlpha = Math.max(0.2, 1 - (r - 13) / 14);
                arc(sx, top + 18, r, dir - 0.6, dir + 0.6, i ? '#ffc046' : '#ffffff');
            }
        }
        l.globalAlpha = 1;
    }

    /** Lamps, stage, speakers and the dance floor. */
    function floor(t, air, beat) {
        // Lamps on the ceiling.
        R(58, 0, 6, 3, '#3a3448'); R(176, 0, 6, 3, '#3a3448');
        // Stage.
        R(30, 49, 180, 9, '#4a2e1c'); R(30, 49, 180, 1, '#7b573c');
        speaker(4, t, air.music, -1);
        speaker(W - 24, t, air.music, 1);
        // Floor: boards, and the dance floor in the middle.
        R(0, 58, W, H - 58, '#1a1424');
        for (let y = 62; y < H; y += 6) R(0, y, W, 1, '#151020');
        for (let ty = 0; ty < 6; ty++) for (let tx = 0; tx < 8; tx++) {
            const lit = air.music && (tx + ty + beat) % 4 === 0;
            R(56 + tx * 16, 70 + ty * 8, 15, 7, lit ? LIT[(tx + beat) % 4] : TILE[(tx + ty) % 4]);
        }
    }

    /* =========================================================
       STAGE EFFECTS — fx = { level 0–3, on: {lasers, disco, smoke,
       spots, fire}, bursts: [{k, at}] } (engine/hall.js fxState).
       fxBack goes behind the people, lights over them. The beat is
       the room's own (two a second): the station doesn't know a
       song's tempo.
       ========================================================= */
    const PARTY = ['#ff3b6b', '#ff9f1c', '#ffe600', '#39ff14', '#00e5ff', '#5a7bff', '#d14fff'];
    const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    const burstOf = (fx, k, secs, t) => (fx.bursts || []).filter(b => b.k === k && t - b.at >= 0 && t - b.at < secs);

    function fxBack(ctx, t, air, fx) {
        l = ctx;
        if (!fx) return;
        const lv = fx.level || 0, on = fx.on || {}, beat = Math.floor(t * 2);
        if (on.disco && lv >= 2) discoBall(t, lv);
        // Fire jets either side of the stage on every other bar at a rave.
        if (on.fire && lv >= 3 && beat % 4 === 0 && (t * 2) % 1 < 0.7) { flame(37, t, 14); flame(203, t, 14); }
        // Someone set the fire off: jets from the stage's edges in to the middle, wave after wave, then all at once.
        for (const b of burstOf(fx, 'fire', FIRE_SECS, t)) {
            const s = t - b.at;
            FIRE_WAVES.forEach((xs, i) => { const a = s - i * 0.4; if (a >= 0 && a < 0.9) for (const x of xs) flame(x, t, (20 + i * 4) * Math.min(1, a / 0.12)); });
            if (s >= FIRE_ALL) for (const xs of FIRE_WAVES) for (const x of xs) flame(x, t, 36 * Math.min(1, (s - FIRE_ALL) / 0.12, (FIRE_SECS - s) / 0.25));
        }
    }
    const FIRE_WAVES = [[37, 203], [64, 176], [91, 149], [113, 127]], FIRE_ALL = 1.75, FIRE_SECS = 2.9;

    /** The disco ball over the dance floor, and its sparkles going round the room. */
    function discoBall(t, lv) {
        const cx = 120, cy = 7, r = 4, turn = Math.floor(t * 6);
        R(cx, 0, 1, cy - r, '#8a8aa0');
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
            if (x * x + y * y > r * r + 1) continue;
            const k = (x + turn + y * 2 + 99) % 3;
            R(cx + x, cy + y, 1, 1, k === 0 ? '#ffffff' : k === 1 ? '#c8c8dc' : '#7a7a92');
        }
        const n = lv >= 3 ? 26 : 16;
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2 + t * (lv >= 3 ? 1.1 : 0.6);
            const x = cx + Math.cos(a) * (40 + hash(i) * 75), y = 44 + Math.sin(a) * (14 + hash(i + 9) * 50);
            if (y < 1 || y > 148) continue;
            l.globalAlpha = 0.45 + 0.4 * hash(i + Math.floor(t * 4));
            R(x, y, 1 + (i % 2), 1, PARTY[i % PARTY.length]);
        }
        l.globalAlpha = 1;
    }

    /** A jet of fire standing on the stage. */
    function flame(x, t, h) {
        const top = 49;
        R(x - 3, top, 6, 2, '#2a2438');                                       // the burner
        const hh = Math.round(h * (0.75 + 0.25 * Math.sin(t * 23 + x)));
        for (let i = 0; i < hh; i++) {
            const k = i / hh, w = Math.max(1, Math.round((1 - k) * 6)), j = Math.round(Math.sin(t * 31 + i * 0.9 + x) * k * 2);
            R(x - w / 2 + j, top - 1 - i, w, 1, k < 0.2 ? '#fff3a0' : k < 0.45 ? '#ffc046' : k < 0.75 ? '#ff6a1f' : '#c8102e');
        }
    }

    /** Spotlights, lasers, smoke and confetti, over everything. */
    function lights(ctx, t, air, fx) {
        l = ctx;
        fx = fx || { level: air.music ? 2 : 0, on: { spots: true } };
        const lv = fx.level || 0, on = fx.on || {};
        const flash = Math.floor(t * 2) % 2 === 0 && (t * 2) % 1 < 0.25;
        if (on.spots && lv >= 1) {
            const sweep = Math.sin(t * (lv >= 3 ? 1.6 : lv >= 2 ? 0.8 : 0.35)) * (lv >= 2 ? 50 : 30);
            const beams = lv >= 3 ? [[61, '#ff7ccc', 1], [179, '#5aa0ff', -1], [100, '#ffe600', -1], [140, '#39ff14', 1]] : [[61, '#ff7ccc', 1], [179, '#5aa0ff', -1]];
            for (const [ox, col, dir] of beams) {
                const tx = ox + sweep * dir;
                l.globalAlpha = lv === 1 ? 0.08 : flash ? 0.22 : 0.13;
                l.fillStyle = col;
                l.beginPath(); l.moveTo(ox - 1, 3); l.lineTo(ox + 1, 3); l.lineTo(tx + 16, 140); l.lineTo(tx - 16, 140); l.closePath(); l.fill();
            }
            l.globalAlpha = 1;
        }
        const zap = burstOf(fx, 'lasers', 3, t).length > 0;
        if ((on.lasers && lv >= 2) || zap) lasers(t, zap ? 3 : lv);
        const puffs = burstOf(fx, 'smoke', 7, t);
        if ((on.smoke && lv >= 2) || puffs.length) smoke(t, lv, puffs);
        for (const b of burstOf(fx, 'confetti', CONFETTI_SECS, t)) confetti(t - b.at, b.at);
    }

    /** Laser beams fanning out from both sides of the stage; a strobe at a rave. */
    function lasers(t, lv) {
        if (lv >= 3 && (t * 4) % 1 > 0.7) return;
        const n = lv >= 3 ? 5 : 3;
        l.save();
        l.globalCompositeOperation = 'lighter';
        l.lineWidth = 1;
        for (const [ox, side] of [[34, 1], [206, -1]]) {
            for (let i = 0; i < n; i++) {
                const a = Math.sin(t * (lv >= 3 ? 2.2 : 1.2) + i * 0.9 + side) * 0.9;
                const tx = ox + side * (60 + i * 25) + Math.sin(a) * 90, ty = 150;
                l.strokeStyle = PARTY[(i * 2 + (side > 0 ? 0 : 3) + Math.floor(t * 2)) % PARTY.length];
                l.globalAlpha = 0.55;
                l.beginPath(); l.moveTo(ox + 0.5, 47.5); l.lineTo(tx + 0.5, ty); l.stroke();
            }
        }
        l.restore();
    }

    /** Haze rolling along the front of the stage (thicker at a rave), and puffs when someone sets it off. */
    function smoke(t, lv, puffs) {
        const haze = lv >= 3 ? 0.16 : lv >= 2 ? 0.1 : 0;
        l.fillStyle = '#d8d4f0';
        if (haze) for (let i = 0; i < 9; i++) {
            const x = ((i * 31 + t * (6 + i % 3 * 3)) % 300) - 30, y = 56 + (i % 3) * 6 + Math.sin(t * 0.7 + i) * 2;
            puff(x, y, 22, 5, haze * (0.6 + 0.4 * Math.sin(t + i)));
        }
        for (const b of puffs) {
            const s = t - b.at, fade = Math.max(0, 1 - s / 7);
            for (let i = 0; i < 14; i++) {
                const x = 20 + hash(i + b.at) * 200 + Math.sin(s * 0.8 + i) * 6, y = 62 + hash(i + 3) * 40 - s * 4;
                puff(x, y, 14 + s * 4, 6 + s * 2, 0.3 * fade);
            }
        }
        l.globalAlpha = 1;
    }

    /** A soft cloud: the same ellipse three times, smaller and thicker towards the middle. */
    function puff(x, y, rx, ry, a) {
        for (const k of [1, 0.7, 0.42]) {
            l.globalAlpha = a / 2.2;
            l.beginPath(); l.ellipse(x, y, rx * k, ry * k, 0, 0, Math.PI * 2); l.fill();
        }
    }

    /* Confetti: two cannons on either side of the room fire it up and across (twice each), then it
       flutters and rains all the way down to the floor, with glittery streamers curling among it.
       A piece flies with drag: it slows from its launch to a steady fall (and sways as it falls). */
    const CONFETTI_SECS = 7.5, DRAG = 2.4;
    function flight(side, s, vx, vy, fall) {
        const e = (1 - Math.exp(-DRAG * s)) / DRAG;
        return { x: side < 0 ? -2 + vx * e : W + 2 - vx * e, y: 64 + fall * s + (vy - fall) * e };
    }
    function confetti(s, seed) {
        const fade = Math.min(1, (CONFETTI_SECS - s) / 1.2);
        // The cannons going off: a flash at each side.
        for (const v of [0, 0.45]) {
            const f = 1 - (s - v) / 0.3;
            if (f > 0 && f <= 1) for (const side of [-1, 1]) {
                l.fillStyle = '#fff6c8'; puff(side < 0 ? 0 : W, 64, 10 * (2 - f), 6 * (2 - f), 0.9 * f);
            }
        }
        l.globalAlpha = 1;
        // Streamers: long glittery ribbons, a few per side, trailing behind where they've been.
        for (let i = 0; i < 12; i++) {
            const side = i % 2 ? 1 : -1, h1 = hash(i + seed * 3), h2 = hash(i * 5 + seed);
            const at = s - (i % 4 < 2 ? 0 : 0.45) - h2 * 0.1;
            if (at <= 0) continue;
            const vx = 90 + h1 * 190, vy = -(60 + h2 * 70), fall = 9 + h1 * 6, col = PARTY[(i * 3) % PARTY.length];
            let last = null;
            for (let k = 0; k < 14; k++) {
                const ts = at - k * 0.045;
                if (ts <= 0) break;
                const p = flight(side, ts, vx, vy, fall), x = p.x + Math.sin(ts * 3 + i + k * 0.6) * (2 + k * 0.4), y = p.y;
                if (y > 148) continue;
                l.globalAlpha = fade * (1 - k / 16);
                if (last) { const n = Math.max(1, Math.round(Math.max(Math.abs(x - last.x), Math.abs(y - last.y)))); for (let j = 0; j < n; j++) R(last.x + (x - last.x) * j / n, last.y + (y - last.y) * j / n, 1, 1, col); }
                // Glitter on the ribbon: points catching the light.
                if (hash(k + i * 17 + Math.floor(s * 12)) > 0.72) R(x, y, 1, 1, '#ffffff');
                last = { x, y };
            }
        }
        // The confetti: lots of little pieces, tumbling (now wide, now narrow) as they fall.
        for (let i = 0; i < 170; i++) {
            const side = i % 2 ? 1 : -1, h1 = hash(i + seed), h2 = hash(i * 3 + seed), h3 = hash(i * 7 + seed);
            const at = s - (i % 4 < 2 ? 0 : 0.45) - h3 * 0.15;
            if (at <= 0) continue;
            const p = flight(side, at, 60 + h1 * 250, -(55 + h2 * 95), 20 + h3 * 16);
            if (p.y > 149 || p.x < -3 || p.x > W + 3) continue;
            const x = p.x + Math.sin(at * (3 + h1 * 3) + i) * 3 * Math.min(1, at), turn = Math.sin(at * (8 + h2 * 8) + i);
            l.globalAlpha = fade;
            const glitter = i % 9 === 0;                                           // some of it is glitter: it twinkles
            const col = glitter ? (Math.floor(at * 10 + i) % 2 ? '#ffffff' : '#ffe680') : PARTY[i % PARTY.length];
            if (Math.abs(turn) < 0.25) R(x, p.y, 1, 1, col);                       // edge on
            else if (i % 2) R(x, p.y, 2, 1, col); else R(x, p.y, 1, 2, col);
        }
        l.globalAlpha = 1;
    }


    /* =========================================================
       AURAS (the Glow tab) — behind you, and a little in front for
       some: kind = glow super charge rings rainbow shadow ultra,
       `c` a colour (for those that take one). Feet at (x, y).
       ========================================================= */
    const AURA_COLORS = { yellow: '#ffd34a', green: '#39ff14', pink: '#ff2fd0', cyan: '#00e5ff', orange: '#ff7a00', purple: '#b04fff' };
    const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
    function auraGlow(x, y, t, c, k) {
        const cy = y - 10, p = 0.8 + 0.2 * Math.sin(t * 3);
        const g = l.createRadialGradient(x, cy, 1, x, cy, 14 * k);
        g.addColorStop(0, rgba(c, 0.55 * p)); g.addColorStop(0.55, rgba(c, 0.25 * p)); g.addColorStop(1, rgba(c, 0));
        l.save(); l.globalCompositeOperation = 'lighter'; l.fillStyle = g;
        l.beginPath(); l.ellipse(x, cy, 9 * k, 14 * k, 0, 0, Math.PI * 2); l.fill(); l.restore();
    }
    /** A spiky flame shape all round you, tallest over the head: white-hot near you, the colour at the edge. */
    function auraFlames(x, y, t, c, tall) {
        l.save(); l.globalCompositeOperation = 'lighter';
        const tick = Math.floor(t * 12);
        for (let dx = -10; dx <= 10; dx++) {
            const e = Math.sqrt(Math.max(0, 1 - (dx / 11) ** 2)), spike = (dx + 30) % 3 === 0 ? 1 : 0.55;
            const top = y - 4 - e * (22 + 10 * spike * hash(dx * 13 + tick)) * tall, bottom = y - 1;
            for (let yy = Math.round(top); yy <= bottom; yy++) {
                const k = (yy - top) / (bottom - top), hot = (1 - Math.abs(dx) / 11) * k;
                l.fillStyle = hot > 0.55 ? rgba('#ffffff', 0.35) : rgba(c, 0.18 + 0.4 * (1 - k * 0.6));
                l.fillRect(Math.round(x + dx), yy, 1, 1);
            }
        }
        for (let i = 0; i < 8; i++) {                                         // sparks flying up
            const s = (t * 1.2 + hash(i)) % 1;
            l.fillStyle = rgba(i % 2 ? '#ffffff' : c, 1 - s);
            l.fillRect(Math.round(x + (hash(i + 3) - 0.5) * 22), Math.round(y - 6 - s * 34), 1, 1);
        }
        l.restore();
    }
    function auraLightning(x, y, t) {
        if (Math.floor(t * 8) % 3) return;                                    // now and then
        l.save(); l.globalCompositeOperation = 'lighter'; l.strokeStyle = 'rgba(255,255,255,0.9)'; l.lineWidth = 1;
        for (let b = 0; b < 2; b++) {
            const seed = Math.floor(t * 8) * 7 + b, side = b ? 1 : -1;
            let px = x + side * 6, py = y - 22;
            l.beginPath(); l.moveTo(px + 0.5, py + 0.5);
            for (let s = 0; s < 5; s++) { px += side * (hash(seed + s) * 3 - 1); py += 4; l.lineTo(Math.round(px) + 0.5, Math.round(py) + 0.5); }
            l.stroke();
        }
        l.restore();
    }
    function auraRings(x, y, t, c) {
        l.save(); l.globalCompositeOperation = 'lighter'; l.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const s = (t * 0.7 + i / 3) % 1;
            l.strokeStyle = rgba(c, 0.7 * (1 - s));
            l.beginPath(); l.ellipse(x, y - 1, 5 + s * 12, 2 + s * 4, 0, 0, Math.PI * 2); l.stroke();
        }
        l.restore();
        auraGlow(x, y, t, c, 0.8);
    }
    function auraRainbow(x, y, t) {
        const hue = (t * 120) % 360;
        auraGlow(x, y, t, hslHex(hue), 1.1);
        l.save(); l.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) {
            const a = t * 2 + i / 10 * Math.PI * 2;
            l.fillStyle = 'hsla(' + ((hue + i * 36) % 360) + ',100%,65%,0.9)';
            l.fillRect(Math.round(x + Math.cos(a) * 9), Math.round(y - 10 + Math.sin(a) * 13), 1, 1);
        }
        l.restore();
    }
    function hslHex(h) {
        const f = (n) => { const k = (n + h / 30) % 12, v = 0.6 - 0.4 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(Math.min(1, v) * 255).toString(16).padStart(2, '0'); };
        return '#' + f(0) + f(8) + f(4);
    }
    /** Dark smoke curling up off you, and a dark pool at your feet (some of the smoke goes in front). */
    function auraShadow(x, y, t, front) {
        if (!front) { l.fillStyle = 'rgba(20,0,35,0.45)'; l.beginPath(); l.ellipse(x, y, 10, 3, 0, 0, Math.PI * 2); l.fill(); }
        const n = front ? 6 : 14;
        for (let i = 0; i < n; i++) {
            const s = (t * 0.5 + hash(i + (front ? 40 : 0))) % 1;
            const sx = x + (hash(i + (front ? 9 : 5)) - 0.5) * (front ? 12 : 16) + Math.sin(t * 2 + i) * 3, sy = y - (front ? 4 : 2) - s * (front ? 22 : 30);
            l.fillStyle = i % 3 || front ? 'rgba(30,5,50,' + (0.6 * (1 - s)) + ')' : 'rgba(140,50,200,' + (0.45 * (1 - s)) + ')';
            l.beginPath(); l.ellipse(sx, sy, 2 + s * 3, 1.5 + s * 2, 0, 0, Math.PI * 2); l.fill();
        }
    }
    /* Ultra: a thin bright edge hugging your outline exactly (your own shape, a pixel out), and
       quick afterimages of you when you move. Drawn from your own sprite on a little canvas. */
    let sil = null, tint = null;
    function silhouette(look, o, color, grow) {
        if (!sil) { sil = document.createElement('canvas'); sil.width = sil.height = 48; tint = document.createElement('canvas'); tint.width = tint.height = 48; }
        const s = sil.getContext('2d'), g = tint.getContext('2d'), keep = l;
        s.clearRect(0, 0, 48, 48);
        person(s, look, { ...o, x: 24, y: 40, noShadow: true });
        l = keep;
        g.clearRect(0, 0, 48, 48);
        g.globalCompositeOperation = 'source-over';
        // Grown by `grow` pixels, rounded (no square corners): every offset within that many steps.
        for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) if ((dx || dy) && Math.abs(dx) + Math.abs(dy) <= grow) g.drawImage(sil, dx, dy);
        if (!grow) g.drawImage(sil, 0, 0);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = color; g.fillRect(0, 0, 48, 48);
        g.globalCompositeOperation = 'source-over';
        return tint;
    }
    function auraUltra(x, y, t, look, o, trail) {
        // Afterimages first (oldest, faintest), then the edge right round you.
        if (trail && trail.length) {
            const ghost = silhouette(look, o, '#9cc8ff', 0);
            l.save(); l.globalCompositeOperation = 'lighter';
            for (const [gx, gy, at] of trail) {
                const a = 1 - (t - at) / 0.35;
                if (a <= 0 || (Math.abs(gx - x) < 1 && Math.abs(gy - y) < 1)) continue;
                l.globalAlpha = 0.35 * a; l.drawImage(ghost, Math.round(gx - 24), Math.round(gy - 40));
            }
            l.restore();
        }
        const flick = 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 5.3);
        l.save();
        l.globalAlpha = 0.35 * flick; l.drawImage(silhouette(look, o, '#6aa8ff', 3), Math.round(x - 24), Math.round(y - 40));
        l.globalAlpha = 0.95 * flick; l.drawImage(silhouette(look, o, '#e8f4ff', 1), Math.round(x - 24), Math.round(y - 40));
        // A few silver flecks drifting up off you.
        l.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
            const s = (t * 0.8 + hash(i + 70)) % 1;
            l.globalAlpha = 0.9 * (1 - s);
            R(x + (hash(i + 71) - 0.5) * 12, y - 6 - s * 20, 1, 1, i % 2 ? '#ffffff' : '#9cc8ff');
        }
        l.restore();
    }
    const EARNED = { hearts: (...a) => auraHearts(...a), butterflies: (...a) => auraButterflies(...a), twinkle: (...a) => auraTwinkle(...a), heaven: (...a) => auraHeaven(...a),
        fire: (x, y, t, front) => auraFire(x, y, t, front, false), brimstone: (...a) => auraBrimstone(...a), hellfire: (...a) => auraHellfire(...a), storm: (...a) => auraStorm(...a) };
    /** An aura, behind the person (front false) or the bits over them (front true). */
    function aura(ctx, kind, color, x, y, t, front, look, o, trail) {
        l = ctx;
        const c = color === 'rainbow' ? hslHex((t * 120) % 360) : AURA_COLORS[color] || AURA_COLORS.yellow;
        if (front) {
            if (kind === 'shadow') auraShadow(x, y, t, true);
            if (kind === 'charge') auraLightning(x, y, t);
            if (kind === 'petals') auraPetals(x, y, t, true);
            if (EARNED[kind]) EARNED[kind](x, y, t, true);
            return;
        }
        if (EARNED[kind]) return EARNED[kind](x, y, t, false);
        if (kind === 'glow') auraGlow(x, y, t, c, 1);
        else if (kind === 'super') { auraGlow(x, y, t, c, 0.9); auraFlames(x, y, t, c, 1); }
        else if (kind === 'charge') { auraGlow(x, y, t, c, 1); auraFlames(x, y, t, c, 1.3); }
        else if (kind === 'rings') auraRings(x, y, t, c);
        else if (kind === 'rainbow') auraRainbow(x, y, t);
        else if (kind === 'shadow') auraShadow(x, y, t, false);
        else if (kind === 'ultra') auraUltra(x, y, t, look, o, trail);
        else if (kind === 'petals') auraPetals(x, y, t, false);
    }
    /** Flower petals blowing past on the wind: some behind you, some in front (front), drifting and turning. */
    function auraPetals(x, y, t, front) {
        const COL = ['#ffb7d5', '#ff8fc0', '#fff0f6', '#ffd1e4', '#f7a1c4'];
        for (let i = front ? 1 : 0; i < 20; i += 2) {
            const k = ((t * (0.45 + (i % 3) * 0.12) + i * 0.137) % 1);           // how far across it's blown
            const px = x - 16 + k * 34 + Math.sin(t * 2 + i) * 1.5;
            const py = y - 20 + ((i * 7) % 18) + Math.sin(t * 3.1 + i * 1.7) * 3 + k * 4;
            const a = Math.min(1, k * 5, (1 - k) * 5);
            l.globalAlpha = a * (front ? 0.95 : 0.8);
            const c = COL[i % COL.length], flip = Math.floor(t * 6 + i) % 3;
            if (flip === 0) R(px, py, 2, 1, c); else if (flip === 1) { R(px, py, 1, 1, c); R(px + 1, py + 1, 1, 1, c); } else R(px, py, 1, 2, c);
        }
        l.globalAlpha = 1;
    }

    /* =========================================================
       PEOPLE — feet at (x, y); about 9 wide and 17 tall
       ========================================================= */
    /**
     * o = { x, y, face (1 right, -1 left), step (0/1 while walking), emote (wave dance jump sit cheer clap point spin headbang sleep),
     *       et (seconds into the emote), t, talk }
     */
    function person(ctx, look, o) {
        l = ctx;
        const L = look || {};
        const skin = SKIN[L.skin] || SKIN[0], hc = HAIR_COLOR[L.hairColor] || HAIR_COLOR[0];
        const sh = SHIRT[L.shirt] || SHIRT[0], pa = PANTS[L.pants] || PANTS[0];
        const t = o.t, e = o.emote || '';
        // Spinning turns them round and round; everyone else faces where they're going.
        const f = e === 'spin' ? (Math.floor(t * 8) % 2 ? 1 : -1) : o.face < 0 ? -1 : 1;
        let x = Math.round(o.x), y = Math.round(o.y), lift = 0;
        const jumpT = o.jumpT, mood = o.mood || '';
        if (e === 'jump') lift = Math.round(Math.abs(Math.sin(o.et * Math.PI / 0.6)) * 6);
        else if (e === 'dance') lift = Math.floor(t * 4) % 2;
        else if (e === 'cheer' || e === 'spin') lift = Math.floor(t * 5) % 2;
        if (jumpT != null && jumpT >= 0 && jumpT < 0.6) lift = Math.max(lift, Math.round(Math.sin(jumpT / 0.6 * Math.PI) * 8));     // Space: a jump
        if (!o.noShadow) R(x - 4, y - 1, 9, 2, 'rgba(0,0,0,0.45)');                   // shadow stays on the floor
        if (o.dash) {                                                   // Shift: a dash, with speed lines behind
            const back = f > 0 ? -1 : 1;
            l.globalAlpha = 0.6;
            for (let i = 0; i < 3; i++) R(back > 0 ? x + 5 + i : x - 10 - i, y - 12 + i * 4, 6, 1, '#ffffff');
            l.globalAlpha = 1;
        }
        y -= lift;
        const sit = e === 'sit' || e === 'sleep';
        if (L.back) backPiece(L.back, x, sit ? y + 1 : y, f, t, o.step === 0 || o.step === 1);
        if (sit) {
            R(x - 3 + (f > 0 ? 1 : -1), y - 3, 7, 2, pa);
            R(f > 0 ? x + 4 : x - 4, y - 3, 1, 2, '#15151c');
        } else {
            // Walking lifts one foot then the other; dancing too.
            const walk = o.step === 0 || o.step === 1, dance = e === 'dance' ? Math.floor(t * 4) % 2 : -1;
            const la = walk ? o.step : dance === 1 ? 1 : 0, ra = walk ? 1 - o.step : dance === 0 ? 1 : 0;
            R(x - 2, y - 4, 2, 4 - la, pa); R(x + 1, y - 4, 2, 4 - ra, pa);
            R(x - 2, y - 1 - la, 2, 1, '#15151c'); R(x + 1, y - 1 - ra, 2, 1, '#15151c');
        }
        const by = sit ? y - 8 : y - 9;                                 // top of the body
        // The top: tee, hoodie, jacket, tank, suit or dress (the shirt colour runs through all of them).
        const top = L.top || 0, SUIT = '#26262e';
        const body = top === 4 ? SUIT : sh[0], sleeve = top === 3 ? skin : body;
        R(x - 3, by, 7, 5, body); R(x - 3, by, 7, 1, top === 4 ? '#3a3a46' : sh[1]);
        if (top === 1) { R(x - 3, by - 1, 7, 1, sh[1]); R(x - 1, by + 1, 1, 2, '#eeeeee'); R(x + 1, by + 1, 1, 2, '#eeeeee'); R(x - 2, by + 3, 5, 1, sh[1]); }
        else if (top === 2) { R(x - 1, by, 3, 5, '#e8e4f0'); R(x, by + 1, 1, 1, '#888'); R(x, by + 3, 1, 1, '#888'); }
        else if (top === 3) { R(x - 3, by, 1, 1, skin); R(x + 3, by, 1, 1, skin); }
        else if (top === 4) { R(x - 1, by, 3, 1, '#eeeeee'); R(x, by + 1, 1, 3, sh[1]); }
        else if (top === 5 && !sit) { R(x - 4, by + 4, 9, 3, sh[0]); R(x - 4, by + 6, 9, 1, sh[1]); }
        // Arms.
        const armUp = (side, wobble) => R(side < 0 ? x - 4 : x + 4, by - 3 - wobble, 1, 4, skin);
        const armDown = (side) => { R(side < 0 ? x - 4 : x + 4, by + 1, 1, 3, sleeve); R(side < 0 ? x - 4 : x + 4, by + 4, 1, 1, skin); };
        const armOut = (side) => { R(side < 0 ? x - 7 : x + 4, by + 1, 4, 1, sleeve); R(side < 0 ? x - 7 : x + 7, by + 1, 1, 1, skin); };
        if (e === 'wave') { armDown(-f); armUp(f, Math.floor(t * 6) % 2); }
        else if (e === 'cheer') { armUp(-1, 0); armUp(1, 0); }
        else if (e === 'dance') { const a = Math.floor(t * 2) % 2; if (a) { armUp(-1, 0); armDown(1); } else { armDown(-1); armUp(1, 0); } }
        else if (e === 'point') { armDown(-f); armOut(f); }
        else if (e === 'spin') { armOut(-1); armOut(1); }
        else if (e === 'clap') {
            R(x - 4, by + 1, 1, 2, sleeve); R(x + 4, by + 1, 1, 2, sleeve);
            if (Math.floor(t * 6) % 2) R(x - 1, by + 2, 3, 1, skin);                // hands together
            else { R(x - 3, by + 2, 1, 1, skin); R(x + 3, by + 2, 1, 1, skin); }
        }
        else if (e === 'headbang') { armUp(-1, 0); R(x + 4, by + 1, 1, 3, sleeve); R(x + 4, by + 4, 1, 1, skin); }
        else { armDown(-1); armDown(1); }
        // Head, face.
        const hy = by - 6 + (e === 'headbang' && Math.floor(t * 8) % 2 ? 2 : 0);
        R(x - 3, hy, 7, 6, mood === 'sick' ? '#a8d08a' : skin);
        const ex = f > 0 ? [x, x + 2] : [x - 2, x];
        // Eyes, by how they feel.
        if (e === 'sleep') { R(ex[0] - 1, hy + 3, 2, 1, '#111'); R(ex[1], hy + 3, 2, 1, '#111'); }
        else if (mood === 'love') { for (const ey of ex) { R(ey - 1, hy + 2, 1, 1, '#ff3d6e'); R(ey + 1, hy + 2, 1, 1, '#ff3d6e'); R(ey, hy + 3, 1, 1, '#ff3d6e'); } }
        else if (mood === 'surprised') { R(ex[0], hy + 1, 1, 3, '#111'); R(ex[1], hy + 1, 1, 3, '#111'); }
        else if (mood === 'smug' || mood === 'happy') { R(ex[0], hy + 3, 1, 1, '#111'); R(ex[1], hy + 3, 1, 1, '#111'); R(ex[0], hy + 2, 1, 1, mood === 'happy' ? '#111' : 'rgba(0,0,0,0.35)'); R(ex[1], hy + 2, 1, 1, mood === 'happy' ? '#111' : 'rgba(0,0,0,0.35)'); }
        else if (mood === 'confused') { R(ex[0], hy + 2, 1, 2, '#111'); R(ex[1], hy + 3, 1, 1, '#111'); }
        else { R(ex[0], hy + 2, 1, 2, '#111'); R(ex[1], hy + 2, 1, 2, '#111'); }
        if (mood === 'angry') { R(ex[0] - 1, hy + 1, 2, 1, '#111'); R(ex[1], hy + 1, 2, 1, '#111'); }
        if (mood === 'cry' || mood === 'sad') { R(ex[0], hy + 4, 1, mood === 'cry' ? 2 : 1, '#6ab0ff'); if (mood === 'cry') R(ex[1], hy + 4, 1, 2, '#6ab0ff'); }
        if (mood === 'cool') { R(x - 3, hy + 2, 7, 1, '#111'); R(ex[0] - 1, hy + 2, 3, 2, '#111'); R(ex[1], hy + 2, 2, 2, '#111'); }
        // Face: beard, moustache, blush or freckles (drawn before the mouth so it shows through).
        switch (L.face) {
            case 1: R(x - 3, hy + 3, 7, 3, hc); R(x - 2, hy + 6, 5, 1, hc); break;
            case 2: R(x - 2, hy + 3, 5, 1, hc); break;
            case 3: R(ex[0] - 1, hy + 4, 1, 1, '#ff8a9a'); R(ex[1] + 1, hy + 4, 1, 1, '#ff8a9a'); break;
            case 4: R(ex[0] - 1, hy + 4, 1, 1, '#a0603a'); R(ex[0] + 1, hy + 4, 1, 1, '#a0603a'); R(ex[1] + 1, hy + 4, 1, 1, '#a0603a'); break;
        }
        // Mouth: talking, or how they feel.
        const mx = f > 0 ? x : x - 1;
        if (o.talk && Math.floor(t * 8) % 2) R(mx, hy + 4, 2, 1, '#6b2a2a');
        else if (mood === 'happy' || mood === 'love') { R(mx - 1, hy + 4, 4, 1, '#6b2a2a'); R(mx - 1, hy + 3, 1, 1, '#6b2a2a'); R(mx + 2, hy + 3, 1, 1, '#6b2a2a'); }
        else if (mood === 'sad' || mood === 'cry' || mood === 'sick') { R(mx, hy + 4, 2, 1, '#6b2a2a'); R(mx - 1, hy + 5, 1, 1, '#6b2a2a'); R(mx + 2, hy + 5, 1, 1, '#6b2a2a'); }
        else if (mood === 'surprised') R(mx, hy + 4, 2, 2, '#3a1414');
        else if (mood === 'angry') R(mx - 1, hy + 4, 4, 1, '#3a1414');
        else if (mood === 'smug') { R(mx, hy + 4, 3, 1, '#6b2a2a'); R(mx + 2, hy + 3, 1, 1, '#6b2a2a'); }
        else if (mood === 'confused') { R(mx - 1, hy + 4, 1, 1, '#6b2a2a'); R(mx, hy + 5, 1, 1, '#6b2a2a'); R(mx + 1, hy + 4, 1, 1, '#6b2a2a'); }
        else R(mx, hy + 4, 2, 1, 'rgba(90,40,40,0.55)');
        // Hair.
        switch (L.hair) {
            case 1: R(x - 3, hy - 1, 7, 2, hc); R(f > 0 ? x - 3 : x + 3, hy + 1, 1, 2, hc); break;
            case 2: R(x - 3, hy - 1, 7, 1, hc); R(x - 3, hy - 2, 1, 1, hc); R(x - 1, hy - 3, 1, 2, hc); R(x + 1, hy - 2, 1, 1, hc); R(x + 3, hy - 3, 1, 2, hc); break;
            case 3: R(x - 3, hy - 1, 7, 2, hc); R(x - 4, hy, 1, 7, hc); R(x + 4, hy, 1, 7, hc); break;
            case 4: R(x - 4, hy - 1, 9, 3, hc); break;
            case 5: R(x - 1, hy - 3, 2, 3, hc); break;
            case 6: R(x - 3, hy - 1, 7, 2, hc); R(x - 1, hy - 4, 3, 3, hc); break;
        }
        if (top === 1 && e !== 'headbang') { R(x - 4, hy + 1, 1, 5, sh[1]); R(x + 4, hy + 1, 1, 5, sh[1]); }   // the hood around the face
        // Extras.
        switch (L.extra) {
            case 1: R(x - 3, hy - 2, 7, 2, sh[1]); R(f > 0 ? x + 1 : x - 5, hy, 5, 1, sh[1]); break;
            case 2: R(x - 3, hy - 2, 7, 1, '#222'); R(x - 4, hy + 1, 1, 3, '#444'); R(x + 4, hy + 1, 1, 3, '#444'); break;
            case 3: R(x - 3, hy + 2, 7, 1, '#111'); R(ex[0] - 1, hy + 2, 3, 2, '#111'); R(ex[1], hy + 2, 2, 2, '#111'); break;
            case 4: R(x - 2, hy - 3, 5, 2, '#f5c542'); R(x - 2, hy - 4, 1, 1, '#f5c542'); R(x, hy - 4, 1, 1, '#f5c542'); R(x + 2, hy - 4, 1, 1, '#f5c542'); break;
            case 5: R(x - 3, hy - 2, 7, 3, '#3b7dd8'); R(x - 3, hy, 7, 1, '#2a5aa0'); R(x, hy - 3, 1, 1, '#ffffff'); break;
            case 6: R(x + 1, hy - 2, 2, 2, '#ff4f9a'); R(x + 4, hy - 2, 2, 2, '#ff4f9a'); R(x + 3, hy - 1, 1, 1, '#c02a6a'); break;          // bow
            case 7: R(x - 2, hy - 4, 5, 1, '#ffe066'); R(x - 3, hy - 3, 1, 1, '#ffe066'); R(x + 3, hy - 3, 1, 1, '#ffe066'); break;          // halo
            case 8: R(x - 3, hy - 2, 1, 2, '#c0392b'); R(x - 4, hy - 3, 1, 1, '#c0392b'); R(x + 3, hy - 2, 1, 2, '#c0392b'); R(x + 4, hy - 3, 1, 1, '#c0392b'); break;   // horns
            case 9: R(x - 2, hy - 1, 5, 1, '#5aa0ff'); R(x - 1, hy - 3, 3, 2, '#ff6bd0'); R(x, hy - 4, 1, 1, '#ffd34a'); R(x, hy - 5, 1, 1, '#ffffff'); break;   // party hat
            case 10: R(x - 4, hy - 1, 3, 3, '#ff7ccc'); R(x - 3, hy, 1, 1, '#ffd34a'); break;                                                // flower
            case 11:                                                                                                                         // the secret burger (Burgertime survivors)
                R(x - 3, hy - 2, 7, 1, '#d9893a'); R(x - 3, hy - 3, 7, 1, '#6b3a1f'); R(x - 4, hy - 3, 1, 1, '#ffcc33'); R(x - 3, hy - 4, 7, 1, '#5fd14f');
                R(x - 3, hy - 6, 7, 2, '#e89a45'); R(x - 2, hy - 7, 5, 1, '#e89a45'); R(x - 1, hy - 6, 1, 1, '#fff2c8'); R(x + 2, hy - 6, 1, 1, '#fff2c8'); break;
            case 12:                                                                                                                         // flower crown (nice points)
                R(x - 3, hy - 1, 7, 1, '#4fae4a');
                ['#ff7ccc', '#ffd34a', '#ffffff', '#ff9ad2'].forEach((c, i) => { R(x - 3 + i * 2, hy - 2, 1, 1, c); R(x - 3 + i * 2, hy - 3, 1, 1, i % 2 ? '#ffe9f4' : c); });
                break;
            case 13:                                                                                                                         // tiara (nice points)
                R(x - 2, hy - 2, 5, 1, '#e8e8f0'); R(x - 2, hy - 3, 1, 1, '#e8e8f0'); R(x + 2, hy - 3, 1, 1, '#e8e8f0'); R(x, hy - 4, 1, 1, '#e8e8f0');
                R(x, hy - 3, 1, 1, Math.floor(t * 3) % 4 ? '#5ad0ff' : '#ffffff'); break;
            case 14:                                                                                                                         // skull mask (ebil points)
                R(x - 3, hy + 1, 7, 5, '#ece8dc'); R(ex[0] - 1, hy + 2, 2, 2, '#111'); R(ex[1], hy + 2, 2, 2, '#111'); R(mx, hy + 4, 1, 1, '#333');
                R(x - 2, hy + 5, 5, 1, '#ece8dc'); R(x - 1, hy + 5, 1, 1, '#555'); R(x + 1, hy + 5, 1, 1, '#555'); break;
            case 15:                                                                                                                         // demon horns (ebil points)
                for (const s of [-1, 1]) {
                    R(x + s * 3, hy - 1, 1, 1, '#5a1414'); R(x + s * 4, hy - 2, 1, 2, '#6a1818'); R(x + s * 5, hy - 4, 1, 2, '#8a2020');
                    R(x + s * 4, hy - 5, 1, 1, '#b02a2a'); R(x + s * 3, hy - 6, 1, 1, '#e0d0b0');
                }
                break;
            case 16:                                                                                                                         // crown of flames (999 ebil)
                for (let i = 0; i < 5; i++) {
                    const fh = 2 + Math.round(hash(i * 7 + Math.floor(t * 12)) * 3);
                    R(x - 2 + i, hy - 3 - fh, 1, fh, i % 2 ? '#ffb020' : '#ff5a10'); R(x - 2 + i, hy - 3 - fh, 1, 1, '#ffe080');
                }
                R(x - 2, hy - 3, 5, 2, '#2a2a2a'); R(x - 2, hy - 4, 1, 1, '#2a2a2a'); R(x, hy - 4, 1, 1, '#2a2a2a'); R(x + 2, hy - 4, 1, 1, '#2a2a2a');
                R(x, hy - 2, 1, 1, '#ff2a2a'); break;
        }
        // Glowing eyes (666 nice points): white-hot, a golden glow round them, over anything on the face. Shut when asleep.
        if (L.face === 5 && e !== 'sleep') {
            const p = 0.75 + 0.25 * Math.sin(t * 4);
            l.save(); l.globalCompositeOperation = 'lighter';
            for (const ey of ex) { l.globalAlpha = 0.5 * p; R(ey - 1, hy + 2, 1, 2, '#ffc020'); R(ey + 1, hy + 2, 1, 2, '#ffc020'); R(ey, hy + 1, 1, 1, '#ffc020'); R(ey, hy + 4, 1, 1, '#ffc020'); }
            l.restore();
            for (const ey of ex) { R(ey, hy + 2, 1, 2, '#ffe680'); R(ey, hy + 2, 1, 1, '#ffffff'); }
        }
        // Asleep: Zs floating up.
        if (e === 'sleep') {
            const k = (t * 0.8) % 1;
            l.globalAlpha = 1 - k;
            R(x + 4, hy - 2 - Math.round(k * 6), 3, 1, '#ffffff'); R(x + 5, hy - 1 - Math.round(k * 6), 1, 1, '#ffffff'); R(x + 4, hy - Math.round(k * 6), 3, 1, '#ffffff');
            l.globalAlpha = 1;
        }
        return hy - lift;                                              // where a bubble goes
    }

    /** What's on their back (behind them): wings, a tail or a cape. Feet at (x, y), facing f. */
    function backPiece(k, x, y, f, t, walking) {
        // A wing on each side: rows of feathers (widths out from the body), flapping.
        const wing = (rows, top, cols, flap) => {
            const up = flap ? Math.round(Math.sin(t * flap) * 1.2) : 0;
            for (const s of [-1, 1]) rows.forEach((w, i) => {
                const yy = top + i - (i < 3 ? up : 0);
                R(s < 0 ? x - 3 - w : x + 4, yy, w, 1, cols[Math.min(cols.length - 1, i % cols.length)]);
            });
        };
        if (k === 1) wing([2, 4, 5, 5, 4, 3, 2, 1], y - 16, ['#ffffff', '#f2f2ff', '#dfe4f5'], 4);                       // angel wings
        else if (k === 2) {                                                                                               // fairy wings: see-through
            l.globalAlpha = 0.65;
            wing([3, 4, 5, 4, 2], y - 17, ['#a8f0ff', '#c8f8ff', '#ffb0f0'], 9);
            wing([2, 3, 2], y - 11, ['#ffb0f0', '#ffd0f8'], 9);
            l.globalAlpha = 1;
        } else if (k === 3) {                                                                                             // seraph wings: big and golden, glowing
            l.globalAlpha = 0.35; wing([3, 5, 7, 8, 8, 7, 6, 4, 3, 1], y - 20, ['#fff3b0'], 3); l.globalAlpha = 1;
            wing([2, 4, 6, 7, 7, 6, 5, 3, 2], y - 19, ['#fff8d8', '#ffe680', '#ffd34a'], 3);
        } else if (k === 4) {                                                                                             // devil tail, wagging
            const b = -f, w = Math.round(Math.sin(t * 5));
            R(x + b * 3, y - 6, 1, 1, '#a0141e'); R(x + b * 4, y - 5, 1, 1, '#a0141e'); R(x + b * 5, y - 5, 1, 1, '#a0141e');
            R(x + b * 6, y - 6 + w, 1, 1, '#a0141e'); R(x + b * 7, y - 7 + w, 1, 1, '#a0141e');
            R(x + b * 7 - (b < 0 ? 2 : 0), y - 9 + w, 3, 2, '#c0392b'); R(x + b * 8, y - 10 + w, 1, 1, '#c0392b');
        } else if (k === 5) {                                                                                             // bat wings: membranes and bones
            wing([1, 3, 5, 6, 6, 4, 2], y - 16, ['#3a1440', '#2a1030'], 5);
            for (const s of [-1, 1]) { R(s < 0 ? x - 9 : x + 4, y - 14, 6, 1, '#120612'); R(s < 0 ? x - 5 : x + 8, y - 11, 1, 1, '#120612'); R(s < 0 ? x - 8 : x + 7, y - 11, 1, 2, '#120612'); }
        } else if (k === 6) {                                                                                             // villain cape, flowing out behind
            const b = -f, wave = walking ? Math.floor(t * 8) % 2 : 0;
            R(x - 5, y - 11, 11, 10, '#1a0a14');
            R(x + b * 5 - (b < 0 ? 1 : 0), y - 9, 2, 8 + wave, '#1a0a14');
            R(b < 0 ? x - 5 : x + 5, y - 11, 1, 9, '#a0122a');
            R(x - 4, y - 12, 9, 1, '#a0122a');
        }
    }

    /* ---------- auras earned with nice and ebil points (app/ui/hall.js REWARDS) ---------- */
    /** Fire: real flames up from the feet, white-hot at the root, embers and a little smoke. */
    function auraFire(x, y, t, front, big) {
        const tick = Math.floor(t * 14), W2 = big ? 11 : 8, H2 = big ? 34 : 22;
        l.save(); l.globalCompositeOperation = 'lighter';
        for (let dx = -W2; dx <= W2; dx++) {
            if (front && (Math.abs(dx) > W2 - 2 || hash(dx + tick) < 0.5)) continue;           // in front: just a few low tongues
            const e = Math.cos(dx / (W2 + 1) * Math.PI / 2), hh = (front ? 6 : H2) * e * (0.6 + 0.4 * hash(dx * 3 + tick));
            for (let i = 0; i < hh; i++) {
                const k = i / Math.max(1, hh);
                l.fillStyle = k < 0.2 ? 'rgba(255,244,160,0.55)' : k < 0.5 ? 'rgba(255,170,30,0.5)' : k < 0.8 ? 'rgba(255,70,16,0.42)' : 'rgba(160,16,16,0.3)';
                l.fillRect(Math.round(x + dx + Math.sin(t * 9 + i * 0.5 + dx) * k * 1.5), Math.round(y - 1 - i), 1, 1);
            }
        }
        l.restore();
        if (front) return;
        for (let i = 0; i < (big ? 14 : 8); i++) {                                                // embers, then smoke
            const s = (t * 0.9 + hash(i + 5)) % 1;
            l.globalAlpha = 1 - s; R(x + (hash(i + 9) - 0.5) * W2 * 2.4 + Math.sin(t * 3 + i) * 2, y - 8 - s * H2 * 1.3, 1, 1, i % 2 ? '#ffd040' : '#ff6020');
        }
        l.fillStyle = '#2a2024';
        for (let i = 0; i < 3; i++) { const s = (t * 0.4 + i / 3) % 1; puff(x + Math.sin(t + i * 2) * 4, y - H2 - s * 14, 4 + s * 4, 2 + s * 2, 0.35 * (1 - s)); }
        l.globalAlpha = 1;
    }
    /** Little pixel hearts floating up round you. */
    function heart(x, y, c) { R(x, y, 1, 1, c); R(x + 2, y, 1, 1, c); R(x, y + 1, 3, 1, c); R(x + 1, y + 2, 1, 1, c); }
    function auraHearts(x, y, t, front) {
        for (let i = front ? 1 : 0; i < 10; i += 2) {
            const s = (t * 0.5 + hash(i + 20)) % 1;
            l.globalAlpha = Math.min(1, s * 4, (1 - s) * 2);
            heart(Math.round(x - 10 + hash(i + 21) * 18 + Math.sin(t * 2 + i) * 2), Math.round(y - 4 - s * 26), ['#ff3d6e', '#ff7ca8', '#ffb3c8'][i % 3]);
        }
        l.globalAlpha = 1;
    }
    /** Butterflies flitting round you, wings opening and shutting. */
    function auraButterflies(x, y, t, front) {
        const COL = [['#ffb020', '#ff7a00'], ['#5ad0ff', '#2a7cff'], ['#ff7ccc', '#d14fff']];
        for (let i = 0; i < 3; i++) {
            const a = t * (0.9 + i * 0.2) + i * 2.1, bx = x + Math.cos(a) * 11, by = y - 12 + Math.sin(a * 1.7) * 7;
            if ((Math.sin(a) > 0) !== front) continue;                                      // the near side of the circle in front
            const open = Math.floor(t * 10 + i) % 2, [c1, c2] = COL[i];
            R(bx, by, 1, 2, '#2a1a10');
            if (open) { R(bx - 2, by - 1, 2, 2, c1); R(bx + 1, by - 1, 2, 2, c1); R(bx - 1, by + 1, 1, 1, c2); R(bx + 1, by + 1, 1, 1, c2); }
            else { R(bx - 1, by - 1, 1, 2, c1); R(bx + 1, by - 1, 1, 2, c1); }
        }
    }
    /** Twinkle: stars glinting on and off all round you, and two gold ones going round. */
    function auraTwinkle(x, y, t, front) {
        l.save(); l.globalCompositeOperation = 'lighter';
        for (let i = front ? 1 : 0; i < 12; i += 2) {
            const s = (t * 0.8 + hash(i + 40)) % 1, k = Math.sin(s * Math.PI);
            const sx = x - 12 + hash(i + 41) * 24, sy = y - 26 + hash(i + 42) * 26;
            l.globalAlpha = k; R(sx, sy, 1, 1, '#ffffff');
            if (k > 0.6) { R(sx - 1, sy, 1, 1, '#fff3a0'); R(sx + 1, sy, 1, 1, '#fff3a0'); R(sx, sy - 1, 1, 1, '#fff3a0'); R(sx, sy + 1, 1, 1, '#fff3a0'); }
        }
        l.restore();
        for (let i = 0; i < 2; i++) {
            const a = t * 2 + i * Math.PI;
            if ((Math.sin(a) > 0) !== front) continue;
            const sx = x + Math.cos(a) * 10, sy = y - 10 + Math.sin(a) * 3;
            R(sx, sy - 1, 1, 3, '#ffd34a'); R(sx - 1, sy, 3, 1, '#ffd34a');
        }
        l.globalAlpha = 1;
    }
    /** Heaven: a shaft of light down on you from above, and feathers drifting down. */
    function auraHeaven(x, y, t, front) {
        if (!front) {
            const g = l.createLinearGradient(0, 0, 0, y);
            const p = 0.8 + 0.2 * Math.sin(t * 2);
            g.addColorStop(0, 'rgba(255,248,200,0)'); g.addColorStop(0.6, 'rgba(255,248,200,' + 0.16 * p + ')'); g.addColorStop(1, 'rgba(255,248,200,' + 0.34 * p + ')');
            l.save(); l.globalCompositeOperation = 'lighter'; l.fillStyle = g;
            l.beginPath(); l.moveTo(x - 6, 0); l.lineTo(x + 6, 0); l.lineTo(x + 11, y); l.lineTo(x - 11, y); l.fill(); l.restore();
            auraGlow(x, y, t, '#fff3b0', 1);
        }
        for (let i = front ? 1 : 0; i < 8; i += 2) {
            const s = (t * 0.25 + hash(i + 60)) % 1, fx = x - 12 + hash(i + 61) * 24 + Math.sin(t * 2 + i) * 3, fy = y - 34 + s * 34;
            l.globalAlpha = Math.min(1, s * 5, (1 - s) * 5);
            R(fx, fy, 2, 1, '#ffffff'); R(fx + (Math.floor(t * 2 + i) % 2 ? 2 : -1), fy + 1, 1, 1, '#e0e4f5');
        }
        l.globalAlpha = 1;
    }
    /** Brimstone: a glowing crack in the floor round you, embers and dark red smoke. */
    function auraBrimstone(x, y, t, front) {
        if (!front) {
            const p = 0.6 + 0.4 * Math.sin(t * 4);
            for (let i = 0; i < 14; i++) {
                const a = i / 14 * Math.PI * 2, r = 8 + hash(i + 80) * 4;
                l.globalAlpha = p; R(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.3, 2, 1, i % 3 ? '#ff4a10' : '#ffb020');
            }
            l.fillStyle = '#5a1010';
            for (let i = 0; i < 5; i++) { const s = (t * 0.45 + hash(i + 82)) % 1; puff(x + (hash(i + 83) - 0.5) * 16 + Math.sin(t + i) * 3, y - 2 - s * 24, 1.5 + s * 3, 1 + s * 2, 0.3 * (1 - s)); }
        }
        for (let i = front ? 1 : 0; i < 10; i += 2) {
            const s = (t * 1.1 + hash(i + 85)) % 1;
            l.globalAlpha = 1 - s; R(x + (hash(i + 86) - 0.5) * 18, y - 2 - s * 26, 1, 1, i % 4 ? '#ff6020' : '#ffd040');
        }
        l.globalAlpha = 1;
    }
    /** Hellfire: towering flames, a ring of lava in the floor. */
    function auraHellfire(x, y, t, front) {
        if (!front) {
            for (let i = 0; i < 22; i++) {
                const a = i / 22 * Math.PI * 2;
                l.globalAlpha = 0.7 + 0.3 * Math.sin(t * 6 + i);
                R(x + Math.cos(a) * 13, y + Math.sin(a) * 4, 2, 1, i % 2 ? '#ff3a00' : '#ffc030');
            }
            l.globalAlpha = 1;
        }
        auraFire(x, y, t, front, true);
    }
    /** Storm: a dark cloud over your head, rain, and red lightning striking down now and then. */
    function auraStorm(x, y, t, front) {
        const cy = y - 30;
        if (front) {
            if (Math.floor(t * 6) % 9 === 0) {                                               // the strike
                const seed = Math.floor(t * 6);
                let px = x + (hash(seed) - 0.5) * 10, py = cy + 3;
                l.globalAlpha = 0.95;
                while (py < y) { R(px, py, 1, 3, '#ff3040'); R(px + 1, py, 1, 1, '#ffd0d0'); px += Math.round(hash(seed + py) * 2 - 1) * 2; py += 3; }
                l.globalAlpha = 1;
            }
            return;
        }
        for (let i = 0; i < 9; i++) { const s = (t * 2 + hash(i + 90)) % 1; l.globalAlpha = 0.6; R(x - 9 + hash(i + 91) * 18, cy + 3 + s * (y - cy - 3), 1, 2, '#8fb0d8'); }
        l.globalAlpha = 1;
        // The cloud: dark, lit a little on top, rumbling.
        const r = Math.round(Math.sin(t * 9));
        for (const [dx, dy, w, h, c] of [[-9, 1, 18, 3, '#3a3846'], [-7, -1, 7, 3, '#4a4858'], [0, -2, 8, 4, '#4a4858'], [-4, -3, 5, 2, '#5c5a6c'], [2, -4, 4, 2, '#5c5a6c'], [-8, 3, 16, 1, '#2a2834']])
            R(x + dx + r, cy + dy, w, h, c);
    }

    /** A bomb going off at (x, y), s seconds ago: a flash, a fireball, smoke, bits flying. */
    function explosion(x, y, s) {
        if (s < 0 || s > 2.2) return;
        if (s < 0.12) { l.globalAlpha = 1 - s / 0.12; R(0, 0, W, H, '#fff6d0'); l.globalAlpha = 1; }
        const r = Math.min(1, s / 0.35) * 22 * (s < 0.6 ? 1 : Math.max(0, 1 - (s - 0.6) / 0.8));
        if (r > 0.5) {
            l.save(); l.globalCompositeOperation = 'lighter';
            for (const [k, c] of [[1, '#ff4a10'], [0.75, '#ffa020'], [0.45, '#fff2a0']]) {
                l.fillStyle = c; l.globalAlpha = 0.85;
                const rr = r * k, hy = Math.round(rr * 0.8);
                for (let yy = -hy; yy <= hy; yy++) { const w = Math.sqrt(Math.max(0, rr * rr - (yy / 0.8) ** 2)); l.fillRect(Math.round(x - w), Math.round(y - 8) + yy, Math.round(w * 2), 1); }
            }
            l.restore();
        }
        l.fillStyle = '#3a3438';
        for (let i = 0; i < 8; i++) {
            const a = hash(i + 3) * Math.PI * 2, d = 6 + s * 26, k = Math.max(0, 1 - s / 2.2);
            puff(x + Math.cos(a) * d, y - 10 + Math.sin(a) * d * 0.5 - s * 10, 5 + s * 6, 3 + s * 4, 0.9 * k);
        }
        l.globalAlpha = 1;
        for (let i = 0; i < 14; i++) {                                                       // bits flying out and falling
            const a = hash(i + 50) * Math.PI * 2, v = 40 + hash(i + 51) * 50, bx = x + Math.cos(a) * v * s, by = y - 8 - Math.abs(Math.sin(a)) * v * s + 70 * s * s;
            if (by > y + 6) continue;
            R(bx, by, 1, 1, i % 3 ? '#2a2a2a' : '#ff9020');
        }
    }
    /** Daniel's Burger Smash landing at (x, y), s seconds ago: a ring across the floor, cracks, dust. */
    function shockwave(x, y, s) {
        if (s < 0 || s > 1.4) return;
        const k = s / 0.6, a = Math.max(0, 1 - s / 1.4);
        if (k < 1) {
            l.strokeStyle = 'rgba(255,240,200,' + (0.9 * (1 - k)) + ')'; l.lineWidth = 2;
            l.beginPath(); l.ellipse(x, y, 4 + k * 34, 2 + k * 15, 0, 0, Math.PI * 2); l.stroke();
            l.strokeStyle = 'rgba(255,200,80,' + (0.7 * (1 - k)) + ')'; l.lineWidth = 1;
            l.beginPath(); l.ellipse(x, y, 2 + k * 22, 1 + k * 9, 0, 0, Math.PI * 2); l.stroke();
        }
        l.globalAlpha = a;
        for (let i = 0; i < 8; i++) {                                                        // cracks
            const ang = i / 8 * Math.PI * 2 + 0.3;
            for (let j = 2; j < 9; j++) R(x + Math.cos(ang) * j * 1.6 + (hash(i * 9 + j) - 0.5), y + Math.sin(ang) * j * 0.7, 1, 1, '#1a1018');
        }
        l.fillStyle = '#c8b8a0';
        for (let i = 0; i < 6; i++) puff(x + (i - 2.5) * (4 + s * 10), y - 2 - s * 6, 3 + s * 3, 1.5 + s * 1.5, 0.5 * a);
        l.globalAlpha = 1;
    }

    /** The stage screen's picture area, in room pixels (FunpostTV goes here). */
    const SCREEN = { x: 152, y: 8, w: 56, h: 26 };
    /** Where FunpostTV plays: the right-hand screen while live, the middle of the stage off air. */
    const screenFor = (live) => (live ? SCREEN : CENTRE_TV);
    function screenAt(live, k) {
        if (!live) return CENTRE_TV;
        const e = Math.max(0, Math.min(1, k)), m = e * e * (3 - 2 * e), lerp = (a, b) => Math.round(a + (b - a) * m);
        return { x: lerp(SCREEN.x, CENTRE_TV.x), y: lerp(SCREEN.y, CENTRE_TV.y), w: lerp(SCREEN.w, CENTRE_TV.w), h: lerp(SCREEN.h, CENTRE_TV.h) };
    }
    /* ---------- Burgertime (engine/hall-burger.js): Daniel, the burgers, the laser eyes, the mess ---------- */
    const HIPPO = { body: '#8b4fd6', dark: '#5f2da8', light: '#b88cf2', belly: '#c8a6f7', mouth: '#ff6f9a', tooth: '#fffbe8' };
    /**
     * Daniel, a giant purple hippo up on his hind legs, standing at x with his feet on y (about 34 × 50).
     * o: { face: ±1, mode: 'run' | 'dance' | 'chase' | 'lunge' | 'chomp' | 'burp' | 'zap' | 'frenzy', open: 0–1 (his mouth), f: 0–1 (how wild) }
     * Returns where his eyes are (for the lasers).
     */
    function hippo(x, y, t, o) {
        const f = o.face < 0 ? -1 : 1, m = o.mode || 'chase';
        const frenzy = m === 'frenzy', fk = frenzy ? Math.max(0.3, o.f || 0) : 0;
        const crazy = m === 'dance', run = m === 'run' || m === 'chase' || m === 'lunge' || frenzy, lunge = m === 'lunge';
        const step = Math.floor(t * (lunge ? 14 : frenzy ? 12 + fk * 8 : crazy ? 6 : 8)) % 2;
        const bob = run ? (step ? 2 : 0) : crazy ? Math.round(Math.abs(Math.sin(t * 9)) * 4) : 0;
        const sx = crazy ? Math.round(Math.sin(t * 31) * 1.5) : frenzy ? Math.round(Math.sin(t * 47) * (1 + fk * 1.5)) : 0;
        const fy = Math.round(y);
        x = Math.round(x + sx); y = Math.round(y - bob);
        const X = (dx, w) => f > 0 ? x + dx : x - dx - w;              // mirrored when he faces left
        const lean = lunge ? 3 : run ? 1 : 0;                           // leaning into the chase
        R(x - 13, fy - 2, 26, 3, 'rgba(0,0,0,0.4)');
        // Two stumpy legs: striding when he runs, hopping from foot to foot when he dances.
        for (const [dx, k] of [[-8, 0], [2, 1]]) {
            const up = (run || crazy) && step === k ? (crazy ? 3 : 2) : 0;
            const fwd = run ? (step === k ? 2 : -1) : 0;
            R(X(dx + fwd, 7), y - 10 - up, 7, 10 - Math.min(up, 2), HIPPO.dark);
            R(X(dx + fwd - (f > 0 ? 0 : 1), 8), y - 2 - up, 8, 2, '#3d1a73');           // big flat feet
            R(X(dx + fwd + 1, 1), y - 1 - up, 1, 1, HIPPO.tooth); R(X(dx + fwd + 4, 1), y - 1 - up, 1, 1, HIPPO.tooth);     // toenails
        }
        // A little tail, wagging, low at the back.
        R(X(-14, 3), y - 13 + (Math.floor(t * 6) % 2), 3, 2, HIPPO.dark);
        // The body: a big round barrel, standing up, with a pale belly.
        R(X(-11 + lean, 22), y - 32, 22, 23, HIPPO.body);
        R(X(-12 + lean, 24), y - 28, 24, 16, HIPPO.body);
        R(X(-10 + lean, 20), y - 33, 20, 1, HIPPO.light);
        R(X(-6 + lean, 14), y - 27, 14, 15, HIPPO.belly);
        R(X(-4 + lean, 10), y - 29, 10, 2, HIPPO.belly);
        R(X(0 + lean, 1), y - 18, 1, 1, HIPPO.dark);                    // belly button
        // Arms: thrown up and waving when he dances, pumping when he runs, out front when he lunges.
        const sh = y - 30, wave = Math.round(Math.sin(t * 14) * 3);
        if (crazy) {
            R(X(-15 + lean, 4), sh - 10 + wave, 4, 13, HIPPO.dark); R(X(11 + lean, 4), sh - 10 - wave, 4, 13, HIPPO.dark);
            R(X(-16 + lean, 5), sh - 12 + wave, 5, 3, HIPPO.light); R(X(11 + lean, 5), sh - 12 - wave, 5, 3, HIPPO.light);
        } else if (lunge) {
            R(X(8 + lean, 12), sh + 2, 12, 4, HIPPO.dark); R(X(18 + lean, 3), sh + 1, 3, 6, HIPPO.light);       // grabbing
        } else {
            const sw = run ? (step ? 2 : -2) : 0;
            R(X(-14 + lean, 4), sh + 1 - sw, 4, 11, HIPPO.dark); R(X(10 + lean, 4), sh + 1 + sw, 4, 11, HIPPO.dark);
            R(X(-14 + lean, 4), sh + 11 - sw, 4, 2, HIPPO.light); R(X(10 + lean, 4), sh + 11 + sw, 4, 2, HIPPO.light);
        }
        // The head on top: a round crown, little ears, and the huge snout out front.
        const hx = lean, hy = y - 50, open = Math.max(0, Math.min(1, o.open || 0)), jaw = Math.round(open * 6);
        R(X(hx - 9, 16), hy + 3, 16, 13, HIPPO.body);
        R(X(hx - 8, 14), hy + 2, 14, 1, HIPPO.light);
        R(X(hx - 7, 3), hy - 1, 3, 4, HIPPO.dark); R(X(hx - 1, 3), hy - 1, 3, 4, HIPPO.dark);       // ears
        R(X(hx - 6, 1), hy, 1, 2, HIPPO.mouth); R(X(hx, 1), hy, 1, 2, HIPPO.mouth);
        R(X(hx + 1, 15), hy + 8, 15, 9, HIPPO.light);                   // the snout
        R(X(hx + 2, 13), hy + 7, 13, 1, HIPPO.light);
        R(X(hx + 12, 2), hy + 9, 2, 2, HIPPO.dark); R(X(hx + 8, 2), hy + 9, 2, 2, HIPPO.dark);      // nostrils
        if (jaw) {
            R(X(hx + 2, 14), hy + 17, 14, jaw, HIPPO.mouth);
            R(X(hx + 3, 2), hy + 17, 2, 2, HIPPO.tooth); R(X(hx + 12, 2), hy + 17, 2, 2, HIPPO.tooth);
            R(X(hx + 1, 15), hy + 17 + jaw, 15, 3, HIPPO.light);           // the jaw, dropped
        } else R(X(hx + 3, 12), hy + 16, 12, 1, HIPPO.dark);
        // Eyes: wide and wild; red and blazing for the lasers; bloodshot and rolling in the frenzy.
        const zap = m === 'zap', ex = X(hx - 6, 4), ex2 = X(hx - 1, 4), ey = hy + 3;
        for (const [i, e] of [ex, ex2].entries()) {
            R(e, ey, 4, 4, zap ? '#ff2a2a' : frenzy ? '#ffd6d6' : '#ffffff');
            const roll = frenzy ? Math.floor(t * 9 + i * 2) % 4 : -1;
            const px = roll < 0 ? (f > 0 ? 2 : 0) : [0, 2, 2, 0][roll], py = roll < 0 ? 1 : [0, 0, 2, 2][roll];
            R(e + px, ey + py, 2, 2, zap ? '#fff3a0' : frenzy ? '#c2001a' : '#1a1028');
        }
        if (frenzy) {
            // Drool flying off his chops, and his brows down.
            R(X(hx - 7, 5), ey - 1, 5, 1, HIPPO.dark); R(X(hx - 2, 5), ey - 1, 5, 1, HIPPO.dark);
            const dk = (t * 2.2) % 1;
            R(X(hx + 4, 1), hy + 18 + dk * 14, 1, 2, '#bff3ff'); R(X(hx + 11, 1), hy + 19 + ((dk + 0.5) % 1) * 12, 1, 2, '#bff3ff');
        }
        if (crazy && Math.floor(t * 5) % 2) {                          // sweat flying off
            R(X(-16, 2), y - 50, 2, 2, '#9fe8ff'); R(X(16, 2), y - 54, 2, 2, '#9fe8ff');
        }
        return { x1: ex + 2, x2: ex2 + 2, y: ey + 2 };
    }
    /** The laser eyes: two beams from his eyes to (tx, ty), k 0–1 through the zap. */
    function hippoLasers(eyes, tx, ty, t, k) {
        const a = 1 - Math.abs(k * 2 - 1);
        l.save();
        l.globalAlpha = Math.max(0, Math.min(1, a * 1.6));
        for (const [w, c] of [[4, 'rgba(255,40,40,0.55)'], [2, '#ff3b3b'], [1, '#fff6c0']]) {
            l.strokeStyle = c; l.lineWidth = w;
            for (const ex of [eyes.x1, eyes.x2]) { l.beginPath(); l.moveTo(ex, eyes.y); l.lineTo(tx + Math.sin(t * 60) * 0.6, ty); l.stroke(); }
        }
        for (let i = 0; i < 6; i++) { const r = (i + k * 10) % 6; R(tx + Math.cos(i * 1.7 + t * 20) * r, ty + Math.sin(i * 2.3 + t * 20) * r, 1, 1, i % 2 ? '#fff6c0' : '#ff3b3b'); }
        l.restore();
    }
    /** A burger with legs where someone stood (feet on y): bun, lettuce, cheese, patty, bun, eyes; a gold star over it if it made it. */
    function burger(x, y, t, o) {
        x = Math.round(x); y = Math.round(y);
        const step = o.walking ? Math.floor(t * 8) % 2 : 0, f = o.face < 0 ? -1 : 1;
        R(x - 5, y - 1, 11, 2, 'rgba(0,0,0,0.45)');
        R(x - 3, y - 4 - step, 1, 4, '#2b1a10'); R(x + 3, y - 4 - (1 - step) * (o.walking ? 1 : 0), 1, 4, '#2b1a10');
        R(x - 4, y - 1, 3, 1, '#2b1a10'); R(x + 2, y - 1, 3, 1, '#2b1a10');
        const b = y - 4 - (o.walking ? step : 0);
        R(x - 6, b - 3, 13, 3, '#d9893a');                               // bottom bun
        R(x - 7, b - 6, 15, 3, '#6b3a1f');                                // patty
        R(x - 6, b - 7, 13, 1, '#ffcc33'); R(x - 7, b - 7, 2, 2, '#ffcc33'); R(x + 5, b - 7, 2, 2, '#ffcc33');      // cheese, dripping
        R(x - 7, b - 8, 15, 1, '#5fd14f');                                // lettuce
        R(x - 6, b - 13, 13, 5, '#e89a45'); R(x - 5, b - 14, 11, 1, '#e89a45'); R(x - 4, b - 14, 7, 1, '#f5b565');
        R(x - 3, b - 12, 1, 1, '#fff2c8'); R(x + 1, b - 13, 1, 1, '#fff2c8'); R(x + 4, b - 11, 1, 1, '#fff2c8');      // sesame
        R(x - 2 + f, b - 11, 2, 2, '#ffffff'); R(x + 2 + f, b - 11, 2, 2, '#ffffff');                               // eyes
        R(x - 1 + f + (f > 0 ? 0 : -1), b - 10, 1, 1, '#1a1028'); R(x + 3 + f + (f > 0 ? 0 : -1), b - 10, 1, 1, '#1a1028');
        if (o.star) star(x, b - 19, t);
        return { x, y: b - 15 };
    }
    /** A gold star, gently bobbing. */
    function star(x, y, t) {
        y = Math.round(y + Math.sin(t * 3));
        R(x, y - 3, 1, 1, '#ffe14d'); R(x - 1, y - 2, 3, 1, '#ffe14d'); R(x - 3, y - 1, 7, 1, '#ffd21a'); R(x - 2, y, 5, 1, '#ffd21a');
        R(x - 2, y + 1, 2, 1, '#e8b400'); R(x + 1, y + 1, 2, 1, '#e8b400'); R(x - 3, y + 2, 1, 1, '#e8b400'); R(x + 3, y + 2, 1, 1, '#e8b400');
    }
    /** Bits of ceiling coming down, s seconds after he went through it. */
    function rubble(s, seed) {
        for (let i = 0; i < 26; i++) {
            const r = Math.sin(i * 12.9898 + seed) * 43758.5453, rnd = r - Math.floor(r), r2 = (rnd * 7.31) % 1;
            const st = s - rnd * 1.2;
            if (st < 0) continue;
            const x = 20 + rnd * 200, y = -6 + 90 * st * st + 30 * st, sz = 2 + Math.floor(r2 * 4), land = FLOOR.y0 + r2 * 70;
            if (y > land) { R(x, land, sz + 1, 1, '#6b6378'); continue; }
            R(x, y, sz, sz, i % 3 ? '#8d8698' : '#cfc8d8'); R(x, y, sz, 1, '#e8e2ef');
        }
        if (s < 1.5) { l.globalAlpha = Math.max(0, 0.5 - s / 3); for (let i = 0; i < 10; i++) puff(40 + i * 18, 8 + Math.sin(i) * 4, 12, 6, 1); l.globalAlpha = 1; }
    }
    /**
     * Daniel's way in: through the right-hand wall, s seconds after he hit it. A jagged hole (it
     * fades after a while), bricks flying across the floor and staying where they land, dust.
     */
    function wallBurst(s, seed) {
        if (s < 0) return;
        const fade = Math.max(0, Math.min(1, (14 - s) / 2));
        if (!fade) return;
        // The hole: dark inside, broken brick round the edge.
        l.globalAlpha = fade;
        const HX = W - 18, HY = 52, HW = 18, HH = 56;
        R(HX, HY, HW, HH, '#07050c');
        for (let i = 0; i < 9; i++) {
            const r = Math.sin(i * 7.31 + seed) * 43758.5453, k = r - Math.floor(r);
            R(HX - 1 - Math.round(k * 3), HY + i * 6, 2 + Math.round(k * 3), 4, i % 2 ? '#7a4a3a' : '#9a5c48');          // the broken edge
            R(HX + Math.round(k * 10), HY - 2 - Math.round(k * 2), 4, 2 + Math.round(k * 2), '#8a5444');                     // the top of the hole
        }
        // Bricks: thrown out across the room, bouncing once, then lying there.
        for (let i = 0; i < 22; i++) {
            const r = Math.sin(i * 12.9898 + seed * 3.1) * 43758.5453, a = r - Math.floor(r), b = (a * 9.17) % 1, c = (a * 3.77) % 1;
            const vx = -(50 + a * 150), vy = -(30 + b * 90), land = FLOOR.y0 + 8 + c * (FLOOR.y1 - FLOOR.y0 - 12);
            const x0 = HX + 4 + b * 10, y0 = HY + 8 + c * 44;
            // Up and over (gravity), till it reaches its spot on the floor.
            const g = 240, tl = (-vy + Math.sqrt(vy * vy + 2 * g * Math.max(1, land - y0))) / g, st = Math.min(s, tl);
            const x = Math.max(FLOOR.x0, x0 + vx * st * (s > tl ? 1 : 1)), y = s >= tl ? land : y0 + vy * st + 0.5 * g * st * st;
            const sz = 2 + Math.floor(c * 3);
            R(x, y - sz, sz + 1, sz, i % 3 ? '#9a5c48' : '#c27a5e'); R(x, y - sz, sz + 1, 1, '#d89a80');
        }
        // Dust, first thing.
        if (s < 1.6) {
            l.globalAlpha = fade * Math.max(0, 0.7 - s / 2.3);
            for (let i = 0; i < 6; i++) puff(HX - 6 - i * 9 - s * 20, HY + 20 + Math.sin(i * 2) * 14, 9 + s * 6, 6 + s * 3, 1);
        }
        l.globalAlpha = 1;
    }
    /** The magic flash someone comes back in (k 0–1). */
    function sparkle(x, y, k) {
        l.save();
        l.globalAlpha = Math.max(0, 1 - k);
        const r = 3 + k * 16;
        for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2 + k * 2;
            R(x + Math.cos(a) * r, y - 8 + Math.sin(a) * r * 0.7, 2, 2, ['#ffffff', '#ffe14d', '#b88cf2', '#7ef0ff'][i % 4]);
        }
        l.globalAlpha = Math.max(0, 0.8 - k * 1.6);
        R(x - 6, y - 18, 12, 18, '#ffffff');
        l.restore();
    }

    const SECRET_BURGER = 11;               // extra 11: only for Burgertime survivors (app/ui/hall.js offers it)
    window.HallArt = { W, H, FLOOR, SECRET_BURGER, FREE, SCREEN, screenFor, screenAt, deskX, PARTS, randomLook, room, lights, fxBack, person, aura, AURA_COLORS, RADIOMAN_MOUTH: { x: RX + 4, y: RY + 14 },
        radioman: (ctx, t, air) => { l = ctx; radioman(t, air); },
        centre: (ctx, t, air, info) => { l = ctx; centre(t, air, info); },
        entrance: (ctx, t, left, secs, air, info) => { l = ctx; entrance(t, left, secs, air, info); },
        introOver: (ctx, t, left, secs) => { l = ctx; introOver(t, left, secs); },
        ENTRANCE,
        cameo: (ctx, t, talking, k, tag) => { l = ctx; return cameo(t, talking, k, tag); },
        speakerBox: (ctx, t, side, slot, k, talking, name, who, strip) => { l = ctx; const r = speakerBox(t, side, slot, k, talking, name, who, strip || '#d0302a'); l = ctx; return r; },
        hippo: (ctx, x, y, t, o) => { l = ctx; return hippo(x, y, t, o || {}); },
        hippoLasers: (ctx, eyes, tx, ty, t, k) => { l = ctx; hippoLasers(eyes, tx, ty, t, k); },
        burger: (ctx, x, y, t, o) => { l = ctx; return burger(x, y, t, o || {}); },
        star: (ctx, x, y, t) => { l = ctx; star(x, y, t); },
        rubble: (ctx, s, seed) => { l = ctx; rubble(s, seed || 1); },
        wallBurst: (ctx, s, seed) => { l = ctx; wallBurst(s, seed || 1); },
        sparkle: (ctx, x, y, k) => { l = ctx; sparkle(x, y, k); },
        explosion: (ctx, x, y, s) => { l = ctx; explosion(x, y, s); },
        shockwave: (ctx, x, y, s) => { l = ctx; shockwave(x, y, s); } };
})();
