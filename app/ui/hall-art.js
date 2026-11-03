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
        { key: 'face', label: 'Face', names: ['Plain', 'Beard', 'Moustache', 'Blush', 'Freckles'] },
        { key: 'top', label: 'Top', names: ['Tee', 'Hoodie', 'Jacket', 'Tank', 'Suit', 'Dress'] },
        { key: 'shirt', label: 'Colour', colors: SHIRT.map(s => s[1]) },
        { key: 'pants', label: 'Pants', colors: PANTS },
        { key: 'extra', label: 'Extra', names: ['None', 'Cap', 'Headphones', 'Shades', 'Crown', 'Beanie', 'Bow', 'Halo', 'Horns', 'Party hat', 'Flower'] }
    ];
    const randomLook = () => Object.fromEntries(PARTS.map(p => [p.key, Math.floor(Math.random() * (p.colors || p.names).length)]));

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
       RADIOMAN — the host, behind his desk, at his mic
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
        // Talk lines off the side of his mouth (the mic is on the other side).
        if (talking) {
            const f = Math.floor(t * 6) % 2, x = RX + 12, y = hy + 15;
            R(x, y - 4 - f, 2 + f, 1, '#ffffff');
            R(x + 1, y, 3 + f, 1, '#ffffff');
            R(x, y + 4 + f, 2 + f, 1, '#ffffff');
        }
        // The desk and his hands on it.
        R(RX - 28, RY + 30, 56, 3, '#8a5a3a'); R(RX - 28, RY + 30, 56, 1, '#a8774f');
        R(RX - 26, RY + 33, 52, 11, '#5a3a22');
        R(RX - 13, RY + 28, 5, 3, '#b0b0b0'); R(RX + 9, RY + 28, 5, 3, '#b0b0b0');
        // The ON AIR lamp on the desk's front.
        R(RX - 13, RY + 36, 26, 7, '#1a1020');
        text(l, 'ON AIR', RX - 11, RY + 37, air.live ? (Math.floor(t * 2) % 2 ? '#ff4a4a' : '#ff2a2a') : '#4a2a2a');
        // The mic: base on the desk, a stand, its head by his mouth.
        R(RX - 15, RY + 29, 6, 1, '#2a2a2a');
        R(RX - 12, RY + 19, 1, 10, '#3c3c3c');
        R(RX - 12, RY + 18, 4, 1, '#3c3c3c');
        R(RX - 10, RY + 13 + nod, 3, 5, '#2a2a2a'); R(RX - 9, RY + 14 + nod, 1, 3, '#6a6a6a');
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
        const tvHere = info.tv && air.live;
        R(150, 6, 60, 30, '#05050a'); R(152, 8, 56, 26, tvHere ? '#000000' : '#0b1424');
        if (tvHere) {
            ticker(150, 36, 60, t, info);
            return floor(t, air, beat);
        }
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
        if (air.live) return radioman(t, air);
        if (info.tv) {
            const S = CENTRE_TV;
            screenStand(S);
            R(S.x - 3, S.y - 2, S.w + 6, S.h + 4, '#05050a'); R(S.x, S.y, S.w, S.h, '#000000');
            ticker(S.x - 3, S.y + S.h + 2, S.w + 6, t, info);
            return;
        }
        boombox(t, air);
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
        // Fire jets either side of the stage: on every other bar at a rave, and whenever someone sets them off.
        const burning = burstOf(fx, 'fire', 2.4, t).length > 0;
        const onBeat = on.fire && lv >= 3 && beat % 4 === 0 && (t * 2) % 1 < 0.7;
        if (burning || onBeat) { flame(37, t, burning ? 22 : 14); flame(203, t, burning ? 22 : 14); }
    }

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
        for (const b of burstOf(fx, 'confetti', 4.5, t)) confetti(t - b.at, b.at);
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

    /** Confetti falling over the room for a few seconds. */
    function confetti(s, seed) {
        for (let i = 0; i < 90; i++) {
            const h1 = hash(i + seed), h2 = hash(i * 3 + seed);
            const y = -6 + (s - h2 * 0.8) * (30 + h1 * 30);
            if (y < -4 || y > 150) continue;
            const x = (h1 * 260 - 10) + Math.sin(s * 4 + i) * 4;
            l.globalAlpha = Math.min(1, (4.5 - s) / 1.2);
            R(x, y, 1 + (i % 2), 2 - (i % 2), PARTY[i % PARTY.length]);
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
    /** An aura, behind the person (front false) or the bits over them (front true). */
    function aura(ctx, kind, color, x, y, t, front, look, o, trail) {
        l = ctx;
        const c = color === 'rainbow' ? hslHex((t * 120) % 360) : AURA_COLORS[color] || AURA_COLORS.yellow;
        if (front) {
            if (kind === 'shadow') auraShadow(x, y, t, true);
            if (kind === 'charge') auraLightning(x, y, t);
            return;
        }
        if (kind === 'glow') auraGlow(x, y, t, c, 1);
        else if (kind === 'super') { auraGlow(x, y, t, c, 0.9); auraFlames(x, y, t, c, 1); }
        else if (kind === 'charge') { auraGlow(x, y, t, c, 1); auraFlames(x, y, t, c, 1.3); }
        else if (kind === 'rings') auraRings(x, y, t, c);
        else if (kind === 'rainbow') auraRainbow(x, y, t);
        else if (kind === 'shadow') auraShadow(x, y, t, false);
        else if (kind === 'ultra') auraUltra(x, y, t, look, o, trail);
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

    /** The stage screen's picture area, in room pixels (FunpostTV goes here). */
    const SCREEN = { x: 152, y: 8, w: 56, h: 26 };
    /** Where FunpostTV plays: the right-hand screen while live, the middle of the stage off air. */
    const screenFor = (live) => (live ? SCREEN : CENTRE_TV);
    window.HallArt = { W, H, FLOOR, SCREEN, screenFor, PARTS, randomLook, room, lights, fxBack, person, aura, AURA_COLORS, RADIOMAN_MOUTH: { x: RX + 4, y: RY + 14 },
        radioman: (ctx, t, air) => { l = ctx; radioman(t, air); },
        centre: (ctx, t, air, info) => { l = ctx; centre(t, air, info); },
        cameo: (ctx, t, talking, k, tag) => { l = ctx; return cameo(t, talking, k, tag); },
        speakerBox: (ctx, t, side, slot, k, talking, name, who, strip) => { l = ctx; const r = speakerBox(t, side, slot, k, talking, name, who, strip || '#d0302a'); l = ctx; return r; } };
})();
