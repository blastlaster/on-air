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
    const SKIN = ['#f6d2b8', '#f1c19b', '#ddb08c', '#c98c5e', '#8d5a3b', '#5c3a24'];
    const HAIR_COLOR = ['#1b1b1b', '#3a2416', '#7a3b1e', '#c2402e', '#f2d24b', '#e8e4d8', '#5b5b66', '#3fae5a', '#d65ca8'];
    const SHIRT = [['#c8432f', '#ff6b4f'], ['#2f8f48', '#4fd36e'], ['#b84a8e', '#ff7ccc'], ['#2f66b8', '#5aa0ff'], ['#c9861f', '#ffc046'],
        ['#6448b0', '#9f80ff'], ['#24242c', '#44444f'], ['#c8c4d0', '#ffffff'], ['#1f9a9a', '#4fe0e0'], ['#b8a222', '#f5e04b']];
    const PANTS = ['#2b2b3a', '#3b5a9a', '#5a4632', '#6b6b75', '#1f4a2e', '#7a2a3a'];
    const PARTS = [
        { key: 'skin', label: 'Skin', colors: SKIN },
        { key: 'hair', label: 'Hair', names: ['None', 'Short', 'Spiky', 'Long', 'Bowl', 'Mohawk', 'Bun'] },
        { key: 'hairColor', label: 'Hair colour', colors: HAIR_COLOR },
        { key: 'shirt', label: 'Shirt', colors: SHIRT.map(s => s[1]) },
        { key: 'pants', label: 'Pants', colors: PANTS },
        { key: 'extra', label: 'Extra', names: ['None', 'Cap', 'Headphones', 'Shades', 'Crown', 'Beanie'] }
    ];
    const randomLook = () => Object.fromEntries(PARTS.map(p => [p.key, Math.floor(Math.random() * (p.colors || p.names).length)]));

    /* ---------- a tiny 3×5 pixel font (rows of 3 bits: 4 left, 2 middle, 1 right) ---------- */
    const FONT = {
        A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11153',
        K: '55655', L: '44447', M: '57755', N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222',
        U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
        0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34656', 7: '71222', 8: '75757', 9: '75711',
        ' ': '00000', '-': '00700', '.': '00002', '!': '22202', "'": '22000', ':': '02020', '?': '61202', '&': '25253',
        '/': '11244', '(': '12221', ')': '42224', ',': '00024', '#': '57575', '+': '02720', '[': '64446', ']': '31113'
    };
    function text(l, str, x, y, color) {
        l.fillStyle = color;
        for (const ch of String(str).toUpperCase()) {
            const g = FONT[ch] || FONT['?'];
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

    /* =========================================================
       THE ROOM
       ========================================================= */
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
        // The screen on the right: what's on (or FunpostTV, laid over it by the window).
        R(150, 6, 60, 30, '#05050a'); R(152, 8, 56, 26, info.tv ? '#000000' : '#0b1424');
        if (info.tv) return floor(t, air, beat);
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

    /** Light beams over everything, sweeping while music plays. */
    function lights(ctx, t, air) {
        l = ctx;
        if (!air.music) return;
        const sweep = Math.sin(t * 0.8) * 50, flash = Math.floor(t * 2) % 2 === 0 && (t * 2) % 1 < 0.25;
        for (const [ox, col, dir] of [[61, '#ff7ccc', 1], [179, '#5aa0ff', -1]]) {
            const tx = ox + sweep * dir;
            l.globalAlpha = flash ? 0.22 : 0.13;
            l.fillStyle = col;
            l.beginPath(); l.moveTo(ox - 1, 3); l.lineTo(ox + 1, 3); l.lineTo(tx + 16, 140); l.lineTo(tx - 16, 140); l.closePath(); l.fill();
            l.globalAlpha = 1;
        }
    }

    /* =========================================================
       PEOPLE — feet at (x, y); about 9 wide and 17 tall
       ========================================================= */
    /**
     * o = { x, y, face (1 right, -1 left), step (0/1 while walking), emote,
     *       et (seconds into the emote), t, talk }
     */
    function person(ctx, look, o) {
        l = ctx;
        const L = look || {};
        const skin = SKIN[L.skin] || SKIN[0], hc = HAIR_COLOR[L.hairColor] || HAIR_COLOR[0];
        const sh = SHIRT[L.shirt] || SHIRT[0], pa = PANTS[L.pants] || PANTS[0];
        const t = o.t, e = o.emote || '', f = o.face < 0 ? -1 : 1;
        let x = Math.round(o.x), y = Math.round(o.y), lift = 0;
        if (e === 'jump') lift = Math.round(Math.abs(Math.sin(o.et * Math.PI / 0.6)) * 6);
        else if (e === 'dance') lift = Math.floor(t * 4) % 2;
        else if (e === 'cheer') lift = Math.floor(t * 5) % 2;
        R(x - 4, y - 1, 9, 2, 'rgba(0,0,0,0.45)');                   // shadow stays on the floor
        y -= lift;
        const sit = e === 'sit';
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
        R(x - 3, by, 7, 5, sh[0]); R(x - 3, by, 7, 1, sh[1]);
        // Arms.
        const armUp = (side, wobble) => R(side < 0 ? x - 4 : x + 4, by - 3 - wobble, 1, 4, skin);
        const armDown = (side) => { R(side < 0 ? x - 4 : x + 4, by + 1, 1, 3, sh[0]); R(side < 0 ? x - 4 : x + 4, by + 4, 1, 1, skin); };
        if (e === 'wave') { armDown(-f); armUp(f, Math.floor(t * 6) % 2); }
        else if (e === 'cheer') { armUp(-1, 0); armUp(1, 0); }
        else if (e === 'dance') { const a = Math.floor(t * 2) % 2; if (a) { armUp(-1, 0); armDown(1); } else { armDown(-1); armUp(1, 0); } }
        else { armDown(-1); armDown(1); }
        // Head, face.
        const hy = by - 6;
        R(x - 3, hy, 7, 6, skin);
        const ex = f > 0 ? [x, x + 2] : [x - 2, x];
        R(ex[0], hy + 2, 1, 2, '#111'); R(ex[1], hy + 2, 1, 2, '#111');
        if (o.talk && Math.floor(t * 8) % 2) R(f > 0 ? x : x - 1, hy + 4, 2, 1, '#6b2a2a');
        else R(f > 0 ? x : x - 1, hy + 4, 2, 1, 'rgba(90,40,40,0.55)');
        // Hair.
        switch (L.hair) {
            case 1: R(x - 3, hy - 1, 7, 2, hc); R(f > 0 ? x - 3 : x + 3, hy + 1, 1, 2, hc); break;
            case 2: R(x - 3, hy - 1, 7, 1, hc); R(x - 3, hy - 2, 1, 1, hc); R(x - 1, hy - 3, 1, 2, hc); R(x + 1, hy - 2, 1, 1, hc); R(x + 3, hy - 3, 1, 2, hc); break;
            case 3: R(x - 3, hy - 1, 7, 2, hc); R(x - 4, hy, 1, 7, hc); R(x + 4, hy, 1, 7, hc); break;
            case 4: R(x - 4, hy - 1, 9, 3, hc); break;
            case 5: R(x - 1, hy - 3, 2, 3, hc); break;
            case 6: R(x - 3, hy - 1, 7, 2, hc); R(x - 1, hy - 4, 3, 3, hc); break;
        }
        // Extras.
        switch (L.extra) {
            case 1: R(x - 3, hy - 2, 7, 2, sh[1]); R(f > 0 ? x + 1 : x - 5, hy, 5, 1, sh[1]); break;
            case 2: R(x - 3, hy - 2, 7, 1, '#222'); R(x - 4, hy + 1, 1, 3, '#444'); R(x + 4, hy + 1, 1, 3, '#444'); break;
            case 3: R(x - 3, hy + 2, 7, 1, '#111'); R(ex[0] - 1, hy + 2, 3, 2, '#111'); R(ex[1], hy + 2, 2, 2, '#111'); break;
            case 4: R(x - 2, hy - 3, 5, 2, '#f5c542'); R(x - 2, hy - 4, 1, 1, '#f5c542'); R(x, hy - 4, 1, 1, '#f5c542'); R(x + 2, hy - 4, 1, 1, '#f5c542'); break;
            case 5: R(x - 3, hy - 2, 7, 3, '#3b7dd8'); R(x - 3, hy, 7, 1, '#2a5aa0'); R(x, hy - 3, 1, 1, '#ffffff'); break;
        }
        return hy - lift;                                              // where a bubble goes
    }

    /** The stage screen's picture area, in room pixels (FunpostTV goes here). */
    const SCREEN = { x: 152, y: 8, w: 56, h: 26 };
    window.HallArt = { W, H, FLOOR, SCREEN, PARTS, randomLook, room, radioman: (ctx, t, air) => { l = ctx; radioman(t, air); }, lights, person, RADIOMAN_MOUTH: { x: RX + 4, y: RY + 14 } };
})();
