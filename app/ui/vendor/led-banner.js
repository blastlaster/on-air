/* =============================================================
   LED BANNER — a dot-matrix sign that scrolls the station's
   messages: news, jokes, what is coming up.

   Text is drawn once into a small hidden canvas, read back as a
   grid of lit and unlit dots, and scrolled across the visible
   canvas one dot at a time, like a real sign. The unlit grid is
   drawn once and reused, and only lit dots are drawn per frame,
   so it stays light enough for old machines. It sleeps while the
   tab is hidden and holds still for people who ask browsers for
   reduced motion.

   Plain ES5: it runs on the listener pages, which have to work
   on old phones.

     var sign = LT.LedBanner(element);
     sign.set({ on: true, items: ['Hello', 'World'], color: 'amber', speed: 'normal', font: 'block', effect: 'none', caps: true });

   The messages go round and round: after the last one, the usual gap,
   then the first again. Effects: laser, sparkle, fire, and warp (stars
   streaking in from the left behind the letters).

   The page picks the look of the dark parts: data-bg on the element
   ("transparent" lets the page's own background through) and
   data-off for the unlit dots.

   Shortcuts in a message are filled in by LT.bannerFill: %current,
   %artist, %title, %dj, %show, %listeners, %station, %time, %pin1-5.
   A line is filled part by part (parts are split at " - ", " — ",
   " | ", " · " and the like): a part whose shortcut has nothing to
   show right now ("Now playing %current" with nothing playing) is
   left out, the rest of the line still shows. A part that is only
   shortcuts ("%listeners %time") keeps whichever have something.
   ============================================================= */
(function () {
    'use strict';

    var LT = window.LT = window.LT || {};

    var ROWS = 13;                                   // dots from top to bottom
    var COLORS = { red: '#ff3030', amber: '#ffb21c', green: '#33ff6e', cyan: '#2be6ff', pink: '#ff4fd8', white: '#f2f2ff' };
    var SPEEDS = { slow: 28, normal: 50, fast: 85 }; // dots per second
    var GAP = 24;                                    // dark dots between two messages
    LT.LED_COLORS = ['amber', 'red', 'green', 'cyan', 'pink', 'white', 'rainbow'];
    LT.LED_SPEEDS = ['slow', 'normal', 'fast'];
    // Typefaces every computer and phone already has (each falls back to a
    // look-alike where the first choice is missing): weight and family.
    var FONTS = {
        block: ['900', '"Arial Black", "Segoe UI Black", Arial, sans-serif'],
        thin: ['400', 'Arial, Helvetica, Roboto, sans-serif'],
        round: ['bold', 'Verdana, "Trebuchet MS", Tahoma, sans-serif'],
        serif: ['bold', 'Georgia, "Times New Roman", serif'],
        typewriter: ['bold', '"Courier New", Courier, monospace'],
        fun: ['bold', '"Comic Sans MS", "Comic Sans", "Chalkboard SE", cursive']
    };
    LT.LED_FONTS = ['block', 'thin', 'round', 'serif', 'typewriter', 'fun'];
    // Extras on top of the scrolling text. They animate between dot steps, so
    // a sign with one redraws ~30 times a second instead of only when it moves.
    LT.LED_EFFECTS = ['none', 'laser', 'sparkle', 'fire', 'warp'];
    var FX_FRAME = 33;                               // ms between effect frames
    var LASER_EVERY = 2800, LASER_SWEEP = 1300;      // a sweep every 2.8 s, 1.3 s to cross
    var LASER_TRAIL = 12;                            // columns of afterglow behind the beam
    var SPARK_LIFE = 500, SPARKS_PER_SEC = 70;
    var EMBER_LIFE = 900, EMBERS_PER_SEC = 14, EMBER_RISE = 9;   // rise in dots per second
    var STARS_PER_SEC = 9, STAR_MIN = 45, STAR_MAX = 140;       // warp: stars streak in from the left, dots per second
    // Fire from the cool top of a letter to its white-hot bottom.
    var HEAT = ['#7a0a00', '#a81500', '#d42400', '#f23d00', '#ff5a00', '#ff7b00', '#ff9d0a', '#ffbf2a', '#ffdc5a', '#fff2a8'];

    var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var TOKENS = /%(current|artist|title|dj|show|listeners|station|time|pin[1-5])\b/gi;
    LT.BANNER_TOKENS = ['%current', '%artist', '%title', '%dj', '%show', '%listeners', '%station', '%time', '%pin1', '%pin2', '%pin3', '%pin4', '%pin5'];

    /** Pin text as plain words: no **bold** marks, links as their text. */
    LT.bannerPlain = function (s) {
        return String(s || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/(\*\*|__|~~|\*)/g, '').replace(/\s+/g, ' ').trim();
    };

    var SEPARATOR = /(\s+(?:-{1,3}|—|–|\||·|•|\/|~+|::?)\s+)/;

    /** One part of a line, filled in; null when it has to go. */
    function fillPart(part, v) {
        var empty = false, words = part.replace(TOKENS, '').replace(/[\s\W_]+/g, '') !== '';
        var t = part.replace(TOKENS, function (m, k) {
            var x = v[k.toLowerCase()];
            if (x == null || x === '') { empty = true; return ''; }
            return String(x);
        });
        // Words around an empty shortcut ("Now playing %current") would read wrong alone.
        if (empty && words) return null;
        t = t.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
        return t || null;
    }

    /** Each line with its shortcuts filled in; parts with nothing to show are left out. */
    LT.bannerFill = function (items, v) {
        var out = [];
        v = v || {};
        for (var i = 0; i < (items || []).length; i++) {
            var bits = String(items[i] || '').split(SEPARATOR), line = '', sep = '';
            for (var j = 0; j < bits.length; j += 2) {
                var t = fillPart(bits[j], v);
                if (t !== null) { line += (line ? sep : '') + t; }
                sep = bits[j + 1] ? ' ' + bits[j + 1].replace(/^\s+|\s+$/g, '') + ' ' : '';
                if (t === null && !line) sep = '';
            }
            if (line) out.push(line);
        }
        return out;
    };

    var STRETCH = 1.3;                               // letters drawn this much wider than the font
    var LETTER_GAP = 2;                              // dark columns between two letters
    var WORD_GAP = 5;                                // dark columns for a space

    /** One letter as columns of dots, stretched wide, with no dark columns at either side. */
    var glyphs = {};
    function glyphColumns(ch, face) {
        var f = FONTS[face] || FONTS.block, id = face + ' ' + ch;
        if (glyphs[id]) return glyphs[id];
        var c = document.createElement('canvas');
        var g = c.getContext('2d');
        var font = f[0] + ' ' + (ROWS - 2) + 'px ' + f[1];
        g.font = font;
        var w = Math.max(1, Math.ceil(g.measureText(ch).width * STRETCH) + 2);
        c.width = w; c.height = ROWS;
        g.font = font;                               // resizing resets the context
        g.fillStyle = '#fff';
        g.textBaseline = 'middle';
        g.scale(STRETCH, 1);
        g.fillText(ch, 1 / STRETCH, ROWS / 2 + 0.5);
        var px = g.getImageData(0, 0, w, ROWS).data;
        var cols = [];
        for (var x = 0; x < w; x++) {
            var col = new Uint8Array(ROWS);
            for (var y = 0; y < ROWS; y++) col[y] = px[(y * w + x) * 4 + 3] > 100 ? 1 : 0;
            cols.push(col);
        }
        while (cols.length && !anyLit(cols[0])) cols.shift();
        while (cols.length && !anyLit(cols[cols.length - 1])) cols.pop();
        return (glyphs[id] = cols);
    }

    /**
     * One message as columns of dots: an array of Uint8Arrays, ROWS tall.
     * Letter by letter, so every pair of letters has the same clear gap
     * between them instead of running together.
     */
    function textColumns(text, face) {
        var cols = [], gap = 0;
        var chars = Array.from ? Array.from(text) : text.split('');   // keeps emoji whole where it can
        for (var i = 0; i < chars.length; i++) {
            var gl = /\s/.test(chars[i]) ? [] : glyphColumns(chars[i], face);
            if (!gl.length) { if (cols.length) gap = WORD_GAP; continue; }
            if (cols.length) for (var k = 0; k < Math.max(gap, LETTER_GAP); k++) cols.push(null);
            cols = cols.concat(gl);
            gap = 0;
        }
        return cols;
    }
    function anyLit(col) { for (var i = 0; i < col.length; i++) if (col[i]) return true; return false; }

    /** A lit dot with its glow, drawn once per colour and size and stamped from then on. */
    function dotSprite(color, pitch, lit) {
        var s = document.createElement('canvas');
        s.width = s.height = Math.ceil(pitch);
        var g = s.getContext('2d'), r = pitch * 0.36, m = pitch / 2;
        if (lit) {
            var glow = g.createRadialGradient(m, m, 0, m, m, pitch / 2);
            glow.addColorStop(0, color); glow.addColorStop(0.55, color); glow.addColorStop(1, 'rgba(0,0,0,0)');
            g.globalAlpha = 0.35; g.fillStyle = glow; g.fillRect(0, 0, pitch, pitch);
            g.globalAlpha = 1;
            g.fillStyle = color; g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(m - r * 0.3, m - r * 0.3, r * 0.35, 0, Math.PI * 2); g.fill();
            // A slight drop shadow, baked in so it costs nothing per frame. It falls
            // down and right, onto dots drawn after this one, so it never covers a lit dot.
            var sh = document.createElement('canvas');
            sh.width = sh.height = Math.ceil(pitch * 1.6);
            var sg = sh.getContext('2d');
            sg.shadowColor = 'rgba(0,0,0,0.9)';
            sg.shadowOffsetX = sg.shadowOffsetY = Math.max(1, pitch * 0.26);
            sg.shadowBlur = Math.max(1, pitch * 0.3);
            sg.drawImage(s, 0, 0);
            return sh;
        } else {
            g.fillStyle = color; g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
        }
        return s;
    }

    function hueColor(h) { return 'hsl(' + Math.round(h) + ',100%,58%)'; }

    LT.LedBanner = function (el) {
        var canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%';
        var said = document.createElement('span');   // what a screen reader reads instead
        said.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
        el.appendChild(canvas); el.appendChild(said);
        var g = canvas.getContext('2d');

        var data = { on: false, items: [] }, key = '';
        var strip = [], starts = [];                 // all messages as one long run of columns
        var cols = 0, pitch = 4, dpr = 1, grid = null, sprites = {}, rainbow = [];
        var offset = 0, last = 0, raf = 0, still = 0, stillAt = 0, shown = -1;
        var white = null, beamDot = null, heat = [], ember = null, starDot = null;
        var sparks = [], embers = [], drawnAt = 0;   // each at a strip column, so it rides along with the text
        var stars = [];                              // warp: at a sign column, they fly on their own
        var loop = 1;                                // strip columns before it repeats (the messages and one gap)

        function build() {
            strip = []; starts = [];
            var items = data.items || [];
            for (var i = 0; i < items.length; i++) {
                var t = String(items[i] || '');
                if (data.caps !== false) t = t.toUpperCase();
                if (i) for (var k = 0; k < GAP; k++) strip.push(null);
                starts.push(strip.length);
                strip = strip.concat(textColumns(t, data.font));
            }
            loop = Math.max(1, strip.length + GAP);
            said.textContent = items.join(' — ');
        }

        function layout() {
            var w = el.clientWidth, h = el.clientHeight;
            if (!w || !h) return false;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
            pitch = canvas.height / ROWS;
            cols = Math.ceil(canvas.width / pitch);
            // The dark grid, drawn once.
            grid = document.createElement('canvas');
            grid.width = canvas.width; grid.height = canvas.height;
            var bg = el.getAttribute('data-bg') || '#0b0507', offColor = el.getAttribute('data-off') || '#2a0f12';
            var gg = grid.getContext('2d'), off = dotSprite(offColor, pitch, false);
            if (bg !== 'transparent') { gg.fillStyle = bg; gg.fillRect(0, 0, grid.width, grid.height); }
            for (var x = 0; x < cols; x++) for (var y = 0; y < ROWS; y++) gg.drawImage(off, x * pitch, y * pitch);
            sprites = {}; rainbow = [];
            for (var name in COLORS) if (COLORS.hasOwnProperty(name)) sprites[name] = dotSprite(COLORS[name], pitch, true);
            for (var hI = 0; hI < 24; hI++) rainbow.push(dotSprite(hueColor(hI * 15), pitch, true));
            white = dotSprite('#ffffff', pitch, true);
            beamDot = dotSprite('#ff2a3a', pitch, true);
            ember = dotSprite('#ff8a1c', pitch, true);
            starDot = dotSprite('#8fd8ff', pitch, true);
            heat = [];
            for (var hh = 0; hh < HEAT.length; hh++) heat.push(dotSprite(HEAT[hh], pitch, true));
            shown = -1;                              // the next frame redraws
            if (stillAt) { stillAt = 0; still = Math.max(0, still - 1); }   // reduced motion: same message, redrawn now
            return true;
        }

        /** The strip's column at sx: before it starts the sign is dark, after that it repeats. */
        function colAt(sx) { return sx < 0 ? null : strip[sx % loop] || null; }
        /** Is the dot at strip column sx, row y lit? */
        function litAt(sx, y) { var c = colAt(sx); return !!(c && c[y]); }
        function births(perSec, dt) { var n = perSec * dt / 1000; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); }

        /** Sparkles and embers: new ones born, old ones gone. */
        function particles(pos, now, dt) {
            var i, k, sx, y, tries;
            sparks = sparks.filter(function (p) { return now - p.t < SPARK_LIFE; });
            embers = embers.filter(function (p) { return now - p.t < EMBER_LIFE; });
            if (data.effect === 'sparkle') {
                for (i = births(SPARKS_PER_SEC, dt); i > 0; i--) {
                    // Mostly on the letters; now and then a star in the dark.
                    for (tries = 0; tries < 6; tries++) {
                        sx = pos - cols + Math.floor(Math.random() * cols); y = Math.floor(Math.random() * ROWS);
                        if (litAt(sx, y)) break;
                    }
                    if (litAt(sx, y) || Math.random() < 0.25) sparks.push({ sx: sx, y: y, t: now });
                }
            } else if (data.effect === 'fire') {
                for (i = births(EMBERS_PER_SEC, dt); i > 0; i--) {
                    // From the top edge of a letter.
                    for (tries = 0; tries < 8; tries++) {
                        sx = pos - cols + Math.floor(Math.random() * cols);
                        var c = colAt(sx);
                        if (!c) continue;
                        for (k = 0; k < ROWS && !c[k]; k++) {}
                        if (k < ROWS) { embers.push({ sx: sx, y: k, t: now, drift: Math.random() < 0.5 ? -1 : 1 }); break; }
                    }
                }
            } else if (data.effect === 'warp') {
                stars = stars.filter(function (p) { return (now - p.t) / 1000 * p.v - p.len < cols; });
                for (i = births(STARS_PER_SEC * Math.max(1, cols / 120), dt); i > 0; i--) {
                    var v = STAR_MIN + Math.random() * (STAR_MAX - STAR_MIN);
                    stars.push({ y: Math.floor(Math.random() * ROWS), t: now, v: v, len: Math.round(2 + v / 18) });
                }
            }
        }

        function draw(pos, now) {
            g.clearRect(0, 0, canvas.width, canvas.height);
            g.drawImage(grid, 0, 0);
            // Reduced motion: no moving extras; fire still colours the letters.
            var fx = reduceMotion && data.effect !== 'fire' ? 'none' : data.effect;
            var sprite = sprites[data.color] || sprites.amber, rb = data.color === 'rainbow';
            // The laser: where the beam is now (off the sign between sweeps).
            var beam = -1e9;
            if (fx === 'laser') { var lt = now % LASER_EVERY; if (lt < LASER_SWEEP) beam = lt / LASER_SWEEP * (cols + LASER_TRAIL) - 1; }
            var t = now / 1000;
            if (fx === 'warp') for (var w = 0; w < stars.length; w++) {
                // A star and its fading streak, on the dark dots behind the letters.
                var st = stars[w], head = Math.floor((now - st.t) / 1000 * st.v);
                for (var k = 0; k <= st.len; k++) {
                    var wx = head - k;
                    if (wx < 0 || wx >= cols || litAt(pos + wx - cols, st.y)) continue;
                    g.globalAlpha = k ? 0.75 * (1 - k / (st.len + 1)) : 1;
                    g.drawImage(k ? starDot : white, wx * pitch, st.y * pitch);
                }
                g.globalAlpha = 1;
            }
            for (var x = 0; x < cols; x++) {
                var sx = pos + x - cols;              // the strip enters from the right edge
                var col = colAt(sx);
                var behind = beam - x;                // > 0: the beam has just passed this column
                if (behind > -1.5 && behind < 1.5) {
                    // The beam itself: a red line down the dark dots.
                    g.globalAlpha = Math.abs(behind) < 0.5 ? 1 : 0.55;
                    for (var by = 0; by < ROWS; by++) if (!col || !col[by]) g.drawImage(beamDot, x * pitch, by * pitch);
                    g.globalAlpha = 1;
                }
                if (!col) continue;
                var s = rb ? rainbow[(((sx % loop) >> 1) % 24 + 24) % 24] : sprite;
                for (var y = 0; y < ROWS; y++) {
                    if (!col[y]) continue;
                    if (fx === 'fire') {
                        // Hotter low down, flickering column by column.
                        var f = Math.sin(sx * 1.7 + t * 9) * Math.sin(sx * 0.55 - t * 13 + y * 0.8);
                        var h = 0.3 + 0.7 * (y / (ROWS - 1)) + 0.3 * f;
                        s = heat[Math.max(0, Math.min(heat.length - 1, Math.round(h * (heat.length - 1))))];
                    }
                    g.drawImage(s, x * pitch, y * pitch);
                    if (behind > -1.5 && behind < LASER_TRAIL) {
                        // Letters flash white as the beam crosses them, then fade back.
                        g.globalAlpha = behind < 1.5 ? 1 : 0.9 * (1 - behind / LASER_TRAIL);
                        g.drawImage(white, x * pitch, y * pitch);
                        g.globalAlpha = 1;
                    }
                }
            }
            if (fx === 'sparkle') for (var i = 0; i < sparks.length; i++) {
                var p = sparks[i], px = p.sx - pos + cols;
                if (px < 0 || px >= cols) continue;
                g.globalAlpha = Math.sin(Math.PI * (now - p.t) / SPARK_LIFE);
                g.drawImage(white, px * pitch, p.y * pitch);
            }
            if (fx === 'fire' && !reduceMotion) for (var j = 0; j < embers.length; j++) {
                var e = embers[j], age = (now - e.t) / 1000;
                var ex = e.sx - pos + cols + Math.round(Math.sin(age * 6) * 0.6 * e.drift), ey = Math.round(e.y - 1 - age * EMBER_RISE);
                if (ex < 0 || ex >= cols || ey < 0 || litAt(e.sx, ey)) continue;
                g.globalAlpha = 1 - (now - e.t) / EMBER_LIFE;
                g.drawImage(ember, ex * pitch, ey * pitch);
            }
            g.globalAlpha = 1;
        }

        function frame(now) {
            raf = requestAnimationFrame(frame);
            if (document.hidden || !el.offsetWidth) { last = now; return; }   // tab hidden, or the page hides the sign
            if (!last) last = now;
            if (reduceMotion) {
                // No scrolling: each message in turn, from the left, for a few seconds.
                if (now - stillAt > 5000 || !stillAt) {
                    stillAt = now;
                    var at = starts[still % Math.max(1, starts.length)] || 0;
                    still++;
                    draw(at + cols, now);
                }
                return;
            }
            offset += (now - last) / 1000 * (SPEEDS[data.speed] || SPEEDS.normal);
            last = now;
            // Seamless: the first message follows the last one gap behind it, for ever.
            // Once the strip has come all the way on, step back a whole loop
            // (the sign looks the same) so the numbers never grow.
            if (offset >= cols + 2 * loop) {
                offset -= loop;
                for (var q = 0; q < sparks.length; q++) sparks[q].sx -= loop;
                for (var r = 0; r < embers.length; r++) embers[r].sx -= loop;
                shown = -1;
            }
            // The sign moves a whole dot at a time: draw only when it has,
            // or when an effect is due its next frame.
            var pos = Math.floor(offset), animated = data.effect !== 'none';
            if (pos === shown && !(animated && now - drawnAt >= FX_FRAME)) return;
            if (animated) particles(pos, now, Math.min(200, now - (drawnAt || now)));
            shown = pos; drawnAt = now;
            draw(pos, now);
        }

        function start() {
            if (raf) return;
            last = 0;
            raf = requestAnimationFrame(frame);
        }
        function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

        var sign = {
            set: function (b) {
                b = b || {};
                var items = (b.items || []).filter(function (s) { return String(s || '').replace(/\s/g, ''); });
                var on = !!b.on && items.length > 0;
                var font = FONTS[b.font] ? b.font : 'block';
                var k = JSON.stringify([on, items, b.color, b.caps, font]);
                data = { on: on, items: items, color: b.color || 'amber', speed: b.speed || 'normal', font: font, caps: b.caps !== false,
                    effect: LT.LED_EFFECTS.indexOf(b.effect) > 0 ? b.effect : 'none' };
                shown = -1; sparks = []; embers = []; stars = [];
                if (stillAt) { stillAt = 0; still = Math.max(0, still - 1); }   // reduced motion: show the change now
                el.hidden = !on;
                if (!on) { stop(); key = ''; return; }
                if (k !== key) { key = k; build(); offset = 0; still = 0; stillAt = 0; shown = -1; }
                if (!grid && !layout()) { setTimeout(function () { if (data.on && layout()) start(); }, 100); return; }
                start();
            },
            destroy: function () { stop(); el.removeChild(canvas); el.removeChild(said); }
        };

        if (window.ResizeObserver) new ResizeObserver(function () { if (data.on) layout(); }).observe(el);
        else window.addEventListener('resize', function () { if (data.on) layout(); });
        return sign;
    };
})();
