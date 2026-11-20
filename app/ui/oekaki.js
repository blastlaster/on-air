/* =============================================================
   Oekaki: draw a green thread's picture, in the style of the board
   drawing tools (/i/'s Tegaki) with MS Paint's tools. Only what you
   draw here: there is no way to open, paste or drop a picture in
   (copy and paste work inside it).

   Oekaki.open({ width, height }) → Promise<{ png, jpg(max) }|null>
   png: the drawing (a data: URL); thumb(max): a JPEG thumbnail of
   it, at most max px. null if the listener cancels.

   Draw: pencil (hard pixels, MS Paint brush tips), pen (smooth ink,
   thins when fast, pen pressure), airbrush (soft, or MS Paint's
   scattered dots), tone (screentone patterns), eraser, smudge, blur,
   bucket, gradient, pipette, text. Shapes: line, curve, rectangle,
   ellipse. Select: rectangle, free-form, magic wand, move (Ctrl+drag
   copies, handles stretch, flip / rotate). Mirror drawing. Two
   colours (right click draws with the second). Layers: add, copy,
   merge down, delete, reorder (drag), rename, opacity. Undo, zoom.
   ============================================================= */
(function () {
    'use strict';
    const PALETTE = ['#000000', '#ffffff', '#808080', '#c0c0c0', '#800000', '#ff0000', '#ff8080', '#808000', '#ffff00', '#ffff80', '#008000', '#00ff00', '#80ff80',
        '#008080', '#00ffff', '#000080', '#0000ff', '#8080ff', '#800080', '#ff00ff', '#ff80c0', '#804000', '#ff8000', '#ffd8b0'];
    const TOOLS = [['pencil', 'Pencil', 'B'], ['pen', 'Pen', 'P'], ['airbrush', 'Airbrush', 'A'], ['tone', 'Tone', 'N'], ['eraser', 'Eraser', 'E'], ['smudge', 'Smudge', 'U'],
        ['blur', 'Blur', 'J'], ['bucket', 'Bucket', 'G'], ['gradient', 'Gradient', 'D'], ['pipette', 'Pipette', 'I'], ['text', 'Text', 'T'],
        ['line', 'Line', 'L'], ['curve', 'Curve', 'C'], ['rect', 'Rectangle', 'R'], ['ellipse', 'Ellipse', 'O'],
        ['select', 'Select', 'S'], ['lasso', 'Free-form', 'F'], ['wand', 'Wand', 'W'], ['move', 'Move', 'V']];
    const GROUPS = [['Draw', 0, 11], ['Shapes', 11, 15], ['Select', 15, 19]];
    const HARD_TOOLS = { pencil: 1, tone: 1, eraser: 1 }, SELECTS = { select: 1, lasso: 1, wand: 1, move: 1 }, SHAPES = { line: 1, curve: 1, rect: 1, ellipse: 1 };
    const SIZES = { pencil: 3, pen: 4, airbrush: 24, tone: 12, eraser: 12, smudge: 16, blur: 16, line: 2, curve: 2, rect: 2, ellipse: 2 };
    const NO_SIZE = { bucket: 1, gradient: 1, pipette: 1, text: 1, select: 1, lasso: 1, wand: 1, move: 1 }, NO_ALPHA = { pipette: 1, select: 1, lasso: 1, wand: 1, move: 1 };
    const GAP = { airbrush: 0.15, smudge: 0.12, blur: 0.3 };            // a dab every so much of the size
    const FONTS = [['sans', 'Arial, Helvetica, sans-serif', 'Sans'], ['serif', '"Times New Roman", Times, serif', 'Serif'], ['mono', '"Courier New", Courier, monospace', 'Mono'],
        ['comic', '"Comic Sans MS", "Comic Neue", cursive', 'Comic'], ['impact', 'Impact, "Arial Black", sans-serif', 'Impact']];
    const MAX_LAYERS = 8, MAX_UNDO = 30, MIN_SIDE = 100, MAX_SIDE = 800;
    // 4×4 ordered dither: the tone tool's Dither pattern
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const rgbHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    /** Shift on a line: straight across, up or down, or at 45°. */
    const snap45 = (a, b) => { const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * Math.PI / 4, l = dist(a, b); return { x: a.x + Math.cos(ang) * l, y: a.y + Math.sin(ang) * l, p: b.p }; };

    // The tools' options, kept from one oekaki to the next.
    const opt = { tip: 'round', nib: 'round', spray: 'soft', pat: 'dots', den: 30, tol: 0, mode: 'outline', edge: 'hard', grad: 'linear', gto: 'clear',
        font: 'sans', bold: false, italic: false, tsize: 24, tsmooth: true, mirror: false };
    const fontCss = (px) => (opt.italic ? 'italic ' : '') + (opt.bold ? 'bold ' : '') + px + 'px ' + (FONTS.find(f => f[0] === opt.font) || FONTS[0])[1];

    /* ---------- each tool's options ---------- */
    const seg = (k, list) => '<span class="ok-seg">' + list.map(([v, n, t]) => '<a data-o="' + k + '" data-v="' + v + '"' + (t ? ' title="' + t + '"' : '') + '>' + n + '</a>').join('') + '</span>';
    const tog = (k, n, t) => '<a class="ok-tog" data-ob="' + k + '" title="' + t + '">' + n + '</a>';
    const row = (label, html) => '<div class="ok-orow"><span class="ok-ol">' + label + '</span>' + html + '</div>';
    const rng = (k, label, min, max, unit) => '<div class="ok-h">' + label + ' <span data-ov="' + k + '" data-u="' + unit + '"></span></div><input type="range" data-o="' + k + '" min="' + min + '" max="' + max + '" step="1">';
    const hint = (s) => '<div class="ok-hint">' + s + '</div>';
    const TIP4 = row('Tip', seg('tip', [['round', '●', 'Round'], ['square', '■', 'Square'], ['slash', '╱', 'Slash (/)'], ['back', '╲', 'Backslash (\\)']]));
    const EDGE = row('Edge', seg('edge', [['hard', 'Hard', 'Crisp pixels, like MS Paint'], ['smooth', 'Smooth', 'Soft (anti-aliased) edges']]));
    const MODE = row('Fill', seg('mode', [['outline', '▭', 'Outline'], ['fill', '■', 'Filled'], ['both', '▣', 'Outline, filled with the 2nd colour']]));
    const OPTS = {
        pencil: TIP4, eraser: TIP4,
        tone: TIP4 + row('Pattern', seg('pat', [['dots', 'Dots', 'Screentone dots'], ['dither', 'Dither', 'Checker-like dither'], ['lines', 'Lines'], ['cross', 'Cross', 'Cross-hatch']])) +
            rng('den', 'Density', 5, 95, '%'),
        pen: row('Tip', seg('nib', [['round', '●', 'Round'], ['flat', '✒', 'Flat nib (calligraphy)']])) + hint('Smooth ink: thins when you move fast, follows pen pressure.'),
        airbrush: row('Spray', seg('spray', [['soft', 'Soft', 'A smooth airbrush'], ['paint', 'Paint', 'Scattered dots, like MS Paint: hold still to fill in']])),
        smudge: hint('Smears what’s on this layer. Strength is how far.'),
        blur: hint('Softens what’s on this layer. Strength is how much.'),
        bucket: rng('tol', 'Tolerance', 0, 100, '') + hint('Right click fills with the 2nd colour.'),
        gradient: row('Shape', seg('grad', [['linear', 'Linear'], ['radial', 'Radial']])) + row('To', seg('gto', [['clear', 'Clear', 'Fades out'], ['second', '2nd', 'Fades to the 2nd colour']])) +
            hint('Drag across the layer. Shift: straight or at 45°.'),
        pipette: hint('Right click picks the 2nd colour.'),
        text: '<select data-o="font">' + FONTS.map(f => '<option value="' + f[0] + '">' + f[2] + '</option>').join('') + '</select>' +
            row('Style', tog('bold', '<b>B</b>', 'Bold') + tog('italic', '<i>I</i>', 'Italic') + tog('tsmooth', 'Smooth', 'Soft edges (off: crisp pixels, like MS Paint)')) +
            rng('tsize', 'Text size', 8, 120, 'px') + hint('Click, type, then click elsewhere (or Ctrl+Enter). Esc throws it away.'),
        line: EDGE + hint('Shift: straight across, up or at 45°.'),
        curve: EDGE + hint('Drag a line, then click or drag twice to bend it. Enter finishes early.'),
        rect: MODE + EDGE + hint('Shift: a square.'),
        ellipse: MODE + EDGE + hint('Shift: a circle.'),
        select: hint('Drag to select. Drag inside to move it · Ctrl+drag copies · the handles stretch · Del clears · arrows nudge.'),
        lasso: hint('Draw around what you want, then move it like Select.'),
        wand: rng('tol', 'Tolerance', 0, 100, '') + hint('Click a colour: the area of it that touches is selected.'),
        move: hint('Drag to move the whole layer (or the selection). Ctrl+drag moves a copy.')
    };

    // One at a time: the 🎨 that opened it keeps the keyboard's focus behind it, and Space or Enter would
    // "press" it again — another oekaki on top (from the drawing so far), and another.
    let showing = null;
    function open(opts = {}) {
        if (showing) return showing;
        showing = new Promise((resolve) => {
            if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            let W = clamp(Math.round(opts.width || 400), MIN_SIDE, MAX_SIDE), H = clamp(Math.round(opts.height || 400), MIN_SIDE, MAX_SIDE);
            const st = { tool: 'pencil', color: '#000000', color2: '#ffffff', size: 3, alpha: 100, zoom: 1, active: 0, dirty: false };
            const sizes = {};                                            // each tool keeps its own size
            let layers = [], undo = [], redo = [], view = null;
            let stroke = null, frame = 0, down = false, drag = null, sel = null, clip = null, text = null;

            const root = document.createElement('div');
            root.className = 'ok-root';
            if (opts.top) root.style.top = Math.round(opts.top) + 'px';         // below a window's title bar (it drags, so it takes clicks)
            root.innerHTML =
                '<div class="ok-menu">' +
                    '<a data-k="new">New</a>' +
                    '<form class="ok-new" hidden><input name="w" type="number" min="' + MIN_SIDE + '" max="' + MAX_SIDE + '"> × <input name="h" type="number" min="' + MIN_SIDE + '" max="' + MAX_SIDE + '"> <button>OK</button></form>' +
                    '<a data-k="undo" title="Ctrl+Z">Undo</a><a data-k="redo" title="Ctrl+Y">Redo</a>' +
                    '<a data-k="fliph" title="Flip the selection (or the layer) left to right">Flip ↔</a><a data-k="flipv" title="Flip the selection (or the layer) upside down">Flip ↕</a>' +
                    '<a data-k="rot" title="Turn the selection (or the layer) a quarter to the right">Rotate ↻</a>' +
                    '<a data-k="mirror" class="ok-mir" title="Mirror drawing: what you draw is drawn again, flipped across the middle (M)">Mirror</a>' +
                    '<span class="ok-zoom">Zoom: <a data-k="zout">−</a><span class="ok-zv">100%</span><a data-k="zin">+</a></span>' +
                    '<span class="ok-sp"></span><a data-k="finish" class="ok-finish">Finish</a><a data-k="cancel">Cancel</a>' +
                '</div>' +
                '<div class="ok-body">' +
                    '<div class="ok-area"><div class="ok-wrap"><div class="ok-stage"><canvas class="ok-cv"></canvas><canvas class="ok-ov"></canvas></div></div></div>' +
                    '<div class="ok-side">' +
                        '<div class="ok-box"><div class="ok-h">Color</div><div class="ok-cur"><span class="ok-pair">' +
                            '<input type="color" class="ok-col" title="Colour: left click draws with it"><input type="color" class="ok-col2" title="2nd colour: right click draws with it"></span>' +
                            '<a data-k="swap" class="ok-swap" title="Swap the colours (X)">⇄</a><span class="ok-hex"></span></div>' +
                            '<div class="ok-pal">' + PALETTE.map(c => '<a data-c="' + c + '" style="background:' + c + '" title="' + c + ' (right click: 2nd colour)"></a>').join('') + '</div></div>' +
                        '<div class="ok-box ok-sabox"><div class="ok-srow"><div class="ok-h">Size <span class="ok-sv"></span></div><input type="range" class="ok-size" min="1" max="64" step="1"></div>' +
                            '<div class="ok-arow"><div class="ok-h"><b class="ok-al">Alpha</b> <span class="ok-av"></span></div><input type="range" class="ok-alpha" min="1" max="100" step="1"></div></div>' +
                        '<div class="ok-box"><div class="ok-h">Tools</div>' + GROUPS.map(([g, a, b]) => '<div class="ok-tg">' + g + '</div><div class="ok-tools">' +
                            TOOLS.slice(a, b).map(([k, n, key]) => '<a data-t="' + k + '" title="' + n + ' (' + key + ')">' + n + '</a>').join('') + '</div>').join('') + '</div>' +
                        '<div class="ok-box ok-obox"><div class="ok-h">Options</div><div class="ok-opts"></div></div>' +
                        '<div class="ok-box"><div class="ok-h">Layers</div><div class="ok-lays"></div>' +
                            '<div class="ok-lbtn"><a data-k="ladd" title="New layer">+</a><a data-k="ldup" title="Duplicate layer">⧉</a><a data-k="lmerge" title="Merge down (into the layer below)">⤓</a>' +
                            '<a data-k="ldel" title="Delete layer">−</a><a data-k="lup" title="Move up">↑</a><a data-k="ldown" title="Move down">↓</a></div>' +
                            '<div class="ok-h">Opacity <span class="ok-lov"></span></div><input type="range" class="ok-lop" min="0" max="100" step="1"></div>' +
                        '<div class="ok-note">Right click draws with the 2nd colour · X swaps · M mirror<br>Ctrl+Z undo · Ctrl+Y redo · [ ] size · Ctrl+wheel zoom<br>' +
                            'Ctrl+A / C / X / V · Del · arrows nudge<br>Layers: double-click renames, drag reorders.<br>Only what you draw: pictures can’t be brought in.</div>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(root);
            const $ = (s) => root.querySelector(s);
            const cv = $('.ok-cv'), ctx = cv.getContext('2d'), ov = $('.ok-ov'), og = ov.getContext('2d');

            const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
            const layerCtx = () => layers[st.active].c.getContext('2d');
            function fresh(w, h) {
                W = w; H = h;
                cv.width = W; cv.height = H; view = mk();
                const bg = mk(); const g = bg.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
                layers = [{ c: bg, name: 'Background', vis: true, op: 100 }, { c: mk(), name: 'Layer 1', vis: true, op: 100 }];
                if (text) { text.el.remove(); text = null; }
                st.active = 1; undo = []; redo = []; st.dirty = false; stroke = null; sel = null; drag = null;
                setZoom(W > 600 || H > 600 ? 1 : st.zoom);
                drawLayers(); render();
            }

            /* ---------- what's on screen ---------- */
            function render() {
                frame = 0;
                ctx.clearRect(0, 0, W, H);
                layers.forEach((l, i) => {
                    if (!l.vis) return;
                    let src = l.c;
                    if (i === st.active && ((stroke && !stroke.direct) || (sel && sel.float))) {
                        const g = view.getContext('2d');
                        g.globalCompositeOperation = 'copy'; g.globalAlpha = 1; g.drawImage(l.c, 0, 0);
                        if (stroke && !stroke.direct) { g.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'; g.globalAlpha = stroke.alpha; g.drawImage(stroke.c, 0, 0); }
                        if (sel && sel.float) { g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.imageSmoothingEnabled = false; g.drawImage(sel.float, sel.fx, sel.fy, sel.fw, sel.fh); }
                        src = view;
                    }
                    ctx.globalAlpha = l.op / 100; ctx.drawImage(src, 0, 0); ctx.globalAlpha = 1;
                });
                drawOverlay();
            }
            const soon = () => { if (!frame) frame = requestAnimationFrame(render); };
            /** On top, at screen sharpness: the selection, its handles, the mirror line, a curve's bends. */
            function drawOverlay() {
                const dpr = window.devicePixelRatio || 1, w = Math.max(1, Math.round(W * st.zoom * dpr)), h = Math.max(1, Math.round(H * st.zoom * dpr));
                if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
                const k = w / W;
                og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, w, h); og.setLineDash([]); og.lineWidth = 1;
                if (opt.mirror) { og.strokeStyle = 'rgba(0, 120, 255, 0.55)'; og.setLineDash([6, 4]); og.beginPath(); og.moveTo(Math.round(w / 2) + 0.5, 0); og.lineTo(Math.round(w / 2) + 0.5, h); og.stroke(); og.setLineDash([]); }
                const ants = (path) => { og.strokeStyle = '#fff'; og.setLineDash([]); path(); og.stroke(); og.strokeStyle = '#000'; og.setLineDash([4, 4]); path(); og.stroke(); og.setLineDash([]); };
                const box = (x, y, bw, bh) => ants(() => { og.beginPath(); og.rect(Math.round(x * k) + 0.5, Math.round(y * k) + 0.5, Math.max(1, Math.round(bw * k) - 1), Math.max(1, Math.round(bh * k) - 1)); });
                if (drag && drag.kind === 'rect' && drag.q) { const a = drag.q0, b = drag.q; box(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); }
                if (drag && drag.kind === 'lasso') ants(() => { og.beginPath(); drag.pts.forEach((p, i) => i ? og.lineTo(p.x * k, p.y * k) : og.moveTo(p.x * k, p.y * k)); });
                if (sel && !(drag && drag.whole)) {
                    if (!sel.float && sel.edges) {
                        og.save(); og.setTransform(k, 0, 0, k, sel.x * k, sel.y * k); og.lineWidth = 1 / k;
                        og.strokeStyle = '#fff'; og.stroke(sel.edges); og.setLineDash([4 / k, 4 / k]); og.strokeStyle = '#000'; og.stroke(sel.edges); og.restore();
                    } else { const r = selRect(); box(r.x, r.y, r.w, r.h); }
                    if (st.tool !== 'move') {
                        og.fillStyle = '#fff'; og.strokeStyle = '#000'; og.setLineDash([]);
                        for (const [hx, hy] of handleSpots()) { og.fillRect(Math.round(hx * k) - 3, Math.round(hy * k) - 3, 6, 6); og.strokeRect(Math.round(hx * k) - 2.5, Math.round(hy * k) - 2.5, 5, 5); }
                    }
                }
                if (stroke && stroke.curve && stroke.curve.c1) {
                    og.fillStyle = 'rgba(0, 120, 255, 0.8)';
                    for (const p of [stroke.curve.c1, stroke.curve.c2]) { og.beginPath(); og.arc(p.x * k, p.y * k, 3, 0, Math.PI * 2); og.fill(); }
                }
            }

            /* ---------- history ---------- */
            const snap = (li) => ({ li, data: layers[li].c.getContext('2d').getImageData(0, 0, W, H) });
            const snapAll = () => ({ all: layers.map(l => ({ name: l.name, vis: l.vis, op: l.op, data: l.c.getContext('2d').getImageData(0, 0, W, H) })), active: st.active });
            function restore(s) {
                if (s.all) {
                    layers = s.all.map(x => { const c = mk(); c.getContext('2d').putImageData(x.data, 0, 0); return { c, name: x.name, vis: x.vis, op: x.op }; });
                    st.active = Math.min(s.active, layers.length - 1);
                } else layers[s.li].c.getContext('2d').putImageData(s.data, 0, 0);
            }
            function remember(before, after) { undo.push({ before, after }); if (undo.length > MAX_UNDO) undo.shift(); redo = []; st.dirty = true; }
            function step(from, to, which) {
                const e = from.pop(); if (!e) return;
                restore(e[which]); to.push(e);
                drawLayers(); render();
            }
            function undoIt() {
                if (down) return;
                if (text) return cancelText();
                if (stroke && stroke.curve) { stroke = null; return render(); }   // a curve not finished yet: gone
                drop();
                step(undo, redo, 'before');
            }
            function redoIt() { if (down) return; settle(); drop(); step(redo, undo, 'after'); }
            /** A change to the whole stack of layers (add, delete, move, show / hide, rename, opacity). */
            function layerChange(fn) { settle(); drop(); const before = snapAll(); fn(); remember(before, snapAll()); drawLayers(); render(); }
            /** Puts down what's half done: typed text, a curve waiting for its bends. */
            function settle() {
                if (text) commitText();
                if (stroke && stroke.curve && !down) end();
            }

            /* ---------- the controls ---------- */
            function drawLayers() {
                $('.ok-lays').innerHTML = layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) =>
                    '<div class="ok-lay' + (i === st.active ? ' on' : '') + '" data-l="' + i + '" draggable="true"><input type="checkbox" data-vis="' + i + '"' + (l.vis ? ' checked' : '') + ' title="Show / hide"> ' +
                    '<span class="ok-ln" title="Double-click to rename">' + esc(l.name) + '</span>' + (l.op < 100 ? '<small>' + l.op + '%</small>' : '') + '</div>').join('');
                showOpacity();
            }
            function markActive() {
                for (const r of root.querySelectorAll('.ok-lay')) r.classList.toggle('on', +r.dataset.l === st.active);
                showOpacity();
            }
            function showOpacity() { const l = layers[st.active]; if (!l) return; $('.ok-lop').value = l.op; $('.ok-lov').textContent = l.op + '%'; }
            function setTool(t) {
                settle();
                if (!SELECTS[t]) drop();
                sizes[st.tool] = st.size;
                st.tool = t;
                st.size = sizes[t] || SIZES[t] || st.size;
                for (const a of root.querySelectorAll('[data-t]')) a.classList.toggle('on', a.dataset.t === t);
                $('.ok-opts').innerHTML = OPTS[t] || '';
                $('.ok-obox').hidden = !OPTS[t];
                root.classList.toggle('ok-nosize', !!NO_SIZE[t]);
                root.classList.toggle('ok-noalpha', !!NO_ALPHA[t]);
                $('.ok-al').textContent = t === 'smudge' || t === 'blur' ? 'Strength' : 'Alpha';
                cv.style.cursor = t === 'text' ? 'text' : t === 'move' ? 'move' : 'crosshair';
                syncOpts(); showVals(); render();
            }
            function syncOpts() {
                for (const a of root.querySelectorAll('[data-o][data-v]')) a.classList.toggle('on', String(opt[a.dataset.o]) === a.dataset.v);
                for (const a of root.querySelectorAll('[data-ob]')) a.classList.toggle('on', !!opt[a.dataset.ob]);
                for (const r of root.querySelectorAll('input[data-o], select[data-o]')) r.value = opt[r.dataset.o];
                for (const s of root.querySelectorAll('[data-ov]')) s.textContent = opt[s.dataset.ov] + s.dataset.u;
                $('.ok-mir').classList.toggle('on', opt.mirror);
                if (text) styleText();
            }
            function setColor(c) {
                st.color = c; $('.ok-col').value = c; $('.ok-hex').textContent = c;
                for (const a of root.querySelectorAll('[data-c]')) a.classList.toggle('on', a.dataset.c === c);
                if (text) { text.col = c; styleText(); }
            }
            function setColor2(c) { st.color2 = c; $('.ok-col2').value = c; }
            function swap() { const a = st.color; setColor(st.color2); setColor2(a); }
            function toggleMirror() { opt.mirror = !opt.mirror; syncOpts(); render(); }
            function showVals() {
                $('.ok-size').value = st.size; $('.ok-sv').textContent = st.size;
                $('.ok-alpha').value = st.alpha; $('.ok-av').textContent = st.alpha + '%';
                if (text) styleText();
            }
            function setZoom(z) {
                st.zoom = clamp(z, 0.5, 4);
                cv.style.width = W * st.zoom + 'px'; cv.style.height = H * st.zoom + 'px';
                $('.ok-zv').textContent = Math.round(st.zoom * 100) + '%';
                if (text) styleText();
                if (layers.length) render();
            }
            const zoomIn = () => setZoom(st.zoom >= 1 ? st.zoom + 1 : st.zoom * 2);
            const zoomOut = () => setZoom(st.zoom > 1 ? st.zoom - 1 : st.zoom / 2);

            /* ---------- drawing ---------- */
            const at = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height, p: e.pointerType === 'pen' ? clamp(e.pressure || 0.5, 0.05, 1) : 1, t: e.timeStamp }; };
            /** Mirror drawing: everything again, flipped across the middle. */
            const each = (x, y, fn) => { fn(x, y, false); if (opt.mirror) fn(W - x, y, true); };
            const grow = (x0, y0, x1, y1) => { const b = stroke.box; if (x0 < b[0]) b[0] = x0; if (y0 < b[1]) b[1] = y0; if (x1 > b[2]) b[2] = x1; if (y1 > b[3]) b[3] = y1; };
            // Hard-edged tools (pencil, tone, eraser, MS Paint spray, hard shapes) mark a mask of whole pixels
            // (1: the colour, 2: the 2nd colour); the stroke canvas is drawn from it.
            function stamp(x, y, size, v, tip) {
                const s = stroke, n = Math.max(1, Math.round(size)), x0 = Math.floor(x - size / 2 + 0.5), y0 = Math.floor(y - size / 2 + 0.5);
                for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
                    const px = x0 + i, py = y0 + j;
                    if (px < 0 || py < 0 || px >= W || py >= H) continue;
                    if (tip === 'round') { if (n > 2) { const dx = i + 0.5 - n / 2, dy = j + 0.5 - n / 2; if (dx * dx + dy * dy > (n / 2) * (n / 2)) continue; } }
                    else if (tip === 'slash') { if (i + j !== n - 1) continue; }
                    else if (tip === 'back') { if (i !== j) continue; }
                    s.mask[py * W + px] = v;
                }
                grow(x0, y0, x0 + n, y0 + n);
            }
            function dot(px, py, v) {
                if (px < 0 || py < 0 || px >= W || py >= H) return;
                stroke.mask[py * W + px] = v; grow(px, py, px + 1, py + 1);
            }
            /** Tone: is this pixel in the pattern? */
            function toneOn(x, y) {
                const d = opt.den / 100;
                switch (opt.pat) {
                    case 'dither': return BAYER[(y & 3) * 4 + (x & 3)] < Math.round(d * 16);
                    case 'lines': return (y % 5) < clamp(Math.round(5 * d), 1, 4);
                    case 'cross': { const w = clamp(Math.round(5 * (1 - Math.sqrt(1 - d))), 1, 4); return (x % 5) < w || (y % 5) < w; }
                    default: {                                           // screentone: round dots on a 6px grid, joining up past half
                        const P = 6, ux = (x % P) + 0.5, uy = (y % P) + 0.5;
                        if (d <= 0.5) { const cx = ux - P / 2, cy = uy - P / 2; return cx * cx + cy * cy < P * P * d / Math.PI; }
                        const cx = Math.min(ux, P - ux), cy = Math.min(uy, P - uy);
                        return cx * cx + cy * cy >= P * P * (1 - d) / Math.PI;
                    }
                }
            }
            function flushMask() {
                const s = stroke, bx0 = clamp(s.box[0], 0, W), by0 = clamp(s.box[1], 0, H), bx1 = clamp(s.box[2], 0, W), by1 = clamp(s.box[3], 0, H);
                s.box = [Infinity, Infinity, -Infinity, -Infinity];
                if (bx1 <= bx0 || by1 <= by0) return;
                const w = bx1 - bx0, h = by1 - by0, img = s.g.createImageData(w, h), d = img.data, c1 = s.rgb, c2 = s.rgb2;
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                    const gx = bx0 + x, gy = by0 + y, v = s.mask[gy * W + gx];
                    if (!v) continue;
                    if (s.tone && !toneOn(gx, gy)) continue;
                    const o = (y * w + x) * 4, c = v === 2 ? c2 : c1; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
                }
                s.g.putImageData(img, bx0, by0);
            }
            /** A small canvas to work in (smudge, blur), kept while the stroke lasts. */
            function scratch(n) { const s = stroke; if (!s.tmp || s.tmp.width !== n) s.tmp = mk(n, n); return s.tmp; }
            /** Keep only a soft round middle of a scratch canvas. */
            function softMask(g, m, r) {
                const gr = g.createRadialGradient(m / 2, m / 2, 0, m / 2, m / 2, r);
                gr.addColorStop(0, '#000'); gr.addColorStop(0.5, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
                g.globalCompositeOperation = 'destination-in'; g.fillStyle = gr; g.fillRect(0, 0, m, m); g.globalCompositeOperation = 'source-over';
            }
            function smudgeAt(x, y, size, m) {
                const s = stroke, k = m ? 1 : 0, prev = s.prev[k];
                s.prev[k] = { x, y };
                if (!prev) return;
                const n = Math.max(2, Math.ceil(size)), t = scratch(n), tg = t.getContext('2d'), lg = layerCtx();
                const sx = Math.round(prev.x - n / 2), sy = Math.round(prev.y - n / 2), dx = Math.round(x - n / 2), dy = Math.round(y - n / 2);
                if (sx === dx && sy === dy) return;
                tg.clearRect(0, 0, n, n); tg.drawImage(layers[st.active].c, -sx, -sy);
                softMask(tg, n, n / 2);
                lg.save(); lg.globalAlpha = s.alpha * 0.9; lg.drawImage(t, dx, dy); lg.restore();
            }
            function blurAt(x, y, size) {
                const s = stroke, n = Math.max(4, Math.ceil(size)), m = n + 8, t = scratch(m), tg = t.getContext('2d'), lg = layerCtx();
                const ox = Math.round(x - m / 2), oy = Math.round(y - m / 2);
                tg.clearRect(0, 0, m, m);
                tg.filter = 'blur(' + Math.max(1, n / 10).toFixed(1) + 'px)'; tg.drawImage(layers[st.active].c, -ox, -oy); tg.filter = 'none';
                softMask(tg, m, n / 2);
                lg.save(); lg.globalAlpha = s.alpha * 0.5; lg.drawImage(t, ox, oy); lg.restore();
            }
            function dab(x, y, p) {
                const s = stroke, size = Math.max(1, st.size * (s.t === 'airbrush' ? 1 : p));
                each(x, y, (px, py, m) => {
                    if (s.hard) return stamp(px, py, size, 1, s.tip);
                    if (s.t === 'pen') {
                        s.g.beginPath();
                        if (opt.nib === 'flat') s.g.ellipse(px, py, size / 2, Math.max(0.6, size / 7), (m ? 1 : -1) * Math.PI / 4, 0, Math.PI * 2);
                        else s.g.arc(px, py, size / 2, 0, Math.PI * 2);
                        return s.g.fill();
                    }
                    if (s.t === 'smudge') return smudgeAt(px, py, size, m);
                    if (s.t === 'blur') return blurAt(px, py, size);
                    // airbrush: soft spots that build up
                    const gr = s.g.createRadialGradient(px, py, 0, px, py, size / 2), [r, g, b] = s.rgb;
                    gr.addColorStop(0, `rgba(${r},${g},${b},${0.12 * p})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
                    s.g.fillStyle = gr; s.g.fillRect(px - size / 2, py - size / 2, size, size);
                });
            }
            /** MS Paint's spray: single pixels scattered in a circle, more the longer you hold still. */
            function sprayAt(x, y) {
                const R = st.size / 2, n = Math.max(3, Math.round(st.size * st.size * 0.015));
                each(x, y, (px, py) => {
                    for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2, r = R * Math.sqrt(Math.random()); dot(Math.floor(px + Math.cos(a) * r), Math.floor(py + Math.sin(a) * r), 1); }
                });
            }
            function lineTo(q) {
                const s = stroke, a = s.last, dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy);
                let gap = st.size * (GAP[s.t] || 0.25) * (s.hard ? 0.5 : 1);
                if (s.tip === 'slash' || s.tip === 'back') gap = Math.min(gap, 0.7);       // a thin slant leaves holes otherwise
                gap = Math.max(0.5, gap);
                // The spacing carries over from one move to the next: a slow hand with a big brush makes many
                // moves shorter than the spacing, and they still add up to a line (not just the first dot).
                let t = s.next === undefined ? gap : Math.min(s.next, gap);
                for (; t <= d; t += gap) { const k = t / d; dab(a.x + dx * k, a.y + dy * k, a.p + (q.p - a.p) * k); }
                s.next = t - d;
                s.last = q;
                if (s.hard) flushMask();
                soon();
            }
            function begin(q, e, alt) {
                const t = st.tool;
                if (SELECTS[t]) return selDown(q, e);
                if (stroke && stroke.curve) { const c = stroke.curve; if (c.phase === 1) c.c1 = c.c2 = q; else c.c2 = q; return redrawShape(); }
                if (t === 'pipette') return pick(q, alt);
                if (!layers[st.active].vis) return;
                if (t === 'bucket') return fill(q, alt);
                if (t === 'text') return startText(q, alt);
                const col = alt ? st.color2 : st.color, col2 = alt ? st.color : st.color2;
                const paint = t === 'airbrush' && opt.spray === 'paint', shape = !!SHAPES[t] || t === 'gradient';
                const hard = !!HARD_TOOLS[t] || paint || (!!SHAPES[t] && opt.edge === 'hard');
                const c = mk(), g = c.getContext('2d');
                g.fillStyle = col; g.strokeStyle = col;
                stroke = { t, c, g, col, col2, rgb: hexRgb(col), rgb2: hexRgb(col2), hard, shape, tone: t === 'tone', erase: t === 'eraser', direct: t === 'smudge' || t === 'blur',
                    alpha: st.alpha / 100, tip: HARD_TOOLS[t] ? opt.tip : 'round', mask: hard ? new Uint8Array(W * H) : null, box: [Infinity, Infinity, -Infinity, -Infinity],
                    a: q, b: q, last: q, prev: [null, null], before: snap(st.active) };
                const s = stroke;
                if (t === 'curve') s.curve = { p0: q, p3: q, c1: null, c2: null, phase: 0 };
                if (shape) return redrawShape();
                if (t === 'pen') { s.raw = q; s.v = 0; s.last = { x: q.x, y: q.y, p: q.p * 0.6 }; dab(q.x, q.y, s.last.p); return soon(); }
                if (paint) {
                    const tick = () => { sprayAt(s.last.x, s.last.y); flushMask(); soon(); };
                    tick(); s.timer = setInterval(tick, 16); return;
                }
                dab(q.x, q.y, q.p);
                if (hard) flushMask();
                soon();
            }
            function moveTo(q, ev) {
                const s = stroke;
                if (s.shape) {
                    if (s.curve) { const c = s.curve; if (c.phase === 0) c.p3 = ev.shiftKey ? snap45(c.p0, q) : q; else if (c.phase === 1) c.c1 = c.c2 = q; else c.c2 = q; }
                    else s.b = q;
                    s.shift = ev.shiftKey;
                    return redrawShape();
                }
                if (s.timer) { s.last = q; return; }                    // MS Paint spray: the timer sprays where the pointer is
                if (s.t === 'pen') {
                    // Ink: a little steadied, and thinner the faster the hand.
                    const v = dist(s.raw, q) / Math.max(1, q.t - s.raw.t);
                    s.raw = q; s.v = s.v * 0.85 + v * 0.15;
                    const f = clamp(1.1 - s.v * 0.35, 0.35, 1);
                    return lineTo({ x: s.last.x + (q.x - s.last.x) * 0.5, y: s.last.y + (q.y - s.last.y) * 0.5, p: q.p * f });
                }
                lineTo(q);
            }
            function end() {
                const s = stroke;
                if (!s) return;
                if (s.timer) clearInterval(s.timer);
                if (s.t === 'pen' && s.raw) lineTo({ x: s.raw.x, y: s.raw.y, p: s.last.p * 0.4 });    // catch up, tapering off
                stroke = null;
                if (!s.direct) {
                    const g = layerCtx();
                    g.save(); g.globalAlpha = s.alpha; g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; g.drawImage(s.c, 0, 0); g.restore();
                }
                remember(s.before, snap(st.active));
                render();
            }

            /* ---------- shapes and the gradient: drawn again from scratch on each move ---------- */
            function shapePts(s) {
                if (s.curve) {
                    const c = s.curve;
                    if (!c.c1) return { pts: [c.p0, c.p3], closed: false };
                    const n = Math.max(8, Math.ceil((dist(c.p0, c.c1) + dist(c.c1, c.c2) + dist(c.c2, c.p3)) / 2)), pts = [];
                    for (let i = 0; i <= n; i++) {
                        const t = i / n, u = 1 - t, A = u * u * u, B = 3 * u * u * t, C = 3 * u * t * t, D = t * t * t;
                        pts.push({ x: A * c.p0.x + B * c.c1.x + C * c.c2.x + D * c.p3.x, y: A * c.p0.y + B * c.c1.y + C * c.c2.y + D * c.p3.y });
                    }
                    return { pts, closed: false };
                }
                const a = s.a;
                if (s.t === 'line') return { pts: [a, s.shift ? snap45(a, s.b) : s.b], closed: false };
                let dx = s.b.x - a.x, dy = s.b.y - a.y;
                if (s.shift) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx < 0 ? -1 : 1) * m; dy = (dy < 0 ? -1 : 1) * m; }
                if (s.t === 'rect') {
                    let x0 = Math.min(a.x, a.x + dx), y0 = Math.min(a.y, a.y + dy), x1 = Math.max(a.x, a.x + dx), y1 = Math.max(a.y, a.y + dy);
                    if (s.hard) { x0 = Math.floor(x0) + 0.5; y0 = Math.floor(y0) + 0.5; x1 = Math.floor(x1) + 0.5; y1 = Math.floor(y1) + 0.5; }
                    return { pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true };
                }
                const cx = a.x + dx / 2, cy = a.y + dy / 2, rx = Math.abs(dx) / 2, ry = Math.abs(dy) / 2, n = Math.max(16, Math.ceil(Math.PI * (rx + ry) / 1.5)), pts = [];
                for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry }); }
                return { pts, closed: true };
            }
            function hardSeg(a, b, size, v) {
                const n = Math.max(1, Math.ceil(dist(a, b) / Math.max(0.5, size * 0.125)));
                for (let i = 0; i <= n; i++) { const k = i / n; stamp(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, size, v, 'round'); }
            }
            function outline(ps, closed) {
                const s = stroke, n = closed ? ps.length : ps.length - 1;
                if (s.hard) { if (ps.length === 1 || (n === 1 && dist(ps[0], ps[1]) < 0.01)) stamp(ps[0].x, ps[0].y, st.size, 1, 'round'); for (let i = 0; i < n; i++) hardSeg(ps[i], ps[(i + 1) % ps.length], st.size, 1); return; }
                const g = s.g;
                g.lineWidth = st.size; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = s.col;
                g.beginPath(); ps.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
                if (closed) g.closePath();
                g.stroke();
            }
            function fillPoly(ps, v) {
                const s = stroke;
                if (!s.hard) { s.g.fillStyle = v === 2 ? s.col2 : s.col; s.g.beginPath(); ps.forEach((p, i) => i ? s.g.lineTo(p.x, p.y) : s.g.moveTo(p.x, p.y)); s.g.closePath(); return s.g.fill(); }
                let y0 = Infinity, y1 = -Infinity;
                for (const p of ps) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
                for (let py = Math.max(0, Math.floor(y0)); py <= Math.min(H - 1, Math.ceil(y1)); py++) {
                    const sy = py + 0.5, xs = [];
                    for (let i = 0; i < ps.length; i++) { const a = ps[i], b = ps[(i + 1) % ps.length]; if ((a.y <= sy && b.y > sy) || (b.y <= sy && a.y > sy)) xs.push(a.x + (sy - a.y) / (b.y - a.y) * (b.x - a.x)); }
                    xs.sort((m, n) => m - n);
                    for (let k = 0; k + 1 < xs.length; k += 2) {
                        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
                        for (let px = xa; px <= xb; px++) s.mask[py * W + px] = v;
                        if (xb >= xa) grow(xa, py, xb + 1, py + 1);
                    }
                }
                for (let i = 0; i < ps.length; i++) hardSeg(ps[i], ps[(i + 1) % ps.length], 1, v);     // the edge pixels too
            }
            function redrawShape() {
                const s = stroke, g = s.g;
                g.clearRect(0, 0, W, H);
                if (s.hard) { s.mask.fill(0); s.box = [Infinity, Infinity, -Infinity, -Infinity]; }
                if (s.t === 'gradient') {
                    const a = s.a, b = s.shift ? snap45(a, s.b) : s.b, [r, gg, bb] = s.rgb;
                    const gr = opt.grad === 'radial' ? g.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(1, dist(a, b))) : g.createLinearGradient(a.x, a.y, b.x, b.y);
                    gr.addColorStop(0, s.col); gr.addColorStop(1, opt.gto === 'second' ? s.col2 : `rgba(${r},${gg},${bb},0)`);
                    g.fillStyle = gr; g.fillRect(0, 0, W, H);
                    return soon();
                }
                const { pts, closed } = shapePts(s), mode = closed ? opt.mode : 'outline';
                const sets = [pts];
                if (opt.mirror) sets.push(pts.map(p => ({ x: W - p.x, y: p.y })));
                for (const ps of sets) {
                    if (mode !== 'outline') fillPoly(ps, mode === 'both' ? 2 : 1);
                    if (mode !== 'fill') outline(ps, closed);
                }
                if (s.hard) flushMask();
                soon();
            }

            function pick(q, alt) {
                const d = ctx.getImageData(clamp(Math.floor(q.x), 0, W - 1), clamp(Math.floor(q.y), 0, H - 1), 1, 1).data, c = rgbHex(d[0], d[1], d[2]);
                if (alt) setColor2(c); else setColor(c);
            }
            /** The touching area of the same colour (within the tolerance) on this layer, as a mask. */
            function flood(q) {
                const x0 = Math.floor(q.x), y0 = Math.floor(q.y);
                if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return null;
                const img = layerCtx().getImageData(0, 0, W, H), d = img.data, o0 = (y0 * W + x0) * 4, tol = opt.tol * 2.55;
                const t0 = d[o0], t1 = d[o0 + 1], t2 = d[o0 + 2], t3 = d[o0 + 3];
                const same = (o) => Math.abs(d[o] - t0) <= tol && Math.abs(d[o + 1] - t1) <= tol && Math.abs(d[o + 2] - t2) <= tol && Math.abs(d[o + 3] - t3) <= tol;
                const seen = new Uint8Array(W * H), todo = [x0 + y0 * W];
                while (todo.length) {
                    const i = todo.pop();
                    if (seen[i] || !same(i * 4)) continue;
                    seen[i] = 1;
                    const x = i % W;
                    if (x > 0) todo.push(i - 1);
                    if (x < W - 1) todo.push(i + 1);
                    if (i >= W) todo.push(i - W);
                    if (i < W * (H - 1)) todo.push(i + W);
                }
                return { seen, img };
            }
            /** The bucket. */
            function fill(q, alt) {
                const f = flood(q);
                if (!f) return;
                const before = snap(st.active), d = f.img.data, [r, gg, b] = hexRgb(alt ? st.color2 : st.color), a = st.alpha / 100;
                for (let i = 0; i < W * H; i++) {
                    if (!f.seen[i]) continue;
                    const o = i * 4, da = d[o + 3] / 255, oa = a + da * (1 - a);
                    if (oa <= 0) continue;
                    d[o] = Math.round((r * a + d[o] * da * (1 - a)) / oa); d[o + 1] = Math.round((gg * a + d[o + 1] * da * (1 - a)) / oa); d[o + 2] = Math.round((b * a + d[o + 2] * da * (1 - a)) / oa); d[o + 3] = Math.round(oa * 255);
                }
                layerCtx().putImageData(f.img, 0, 0);
                remember(before, snap(st.active));
                render();
            }

            /* ---------- text: typed in a box over the canvas, put down when you click elsewhere ---------- */
            function startText(q, alt) {
                const el = document.createElement('textarea');
                el.className = 'ok-text'; el.spellcheck = false; el.wrap = 'off';
                text = { el, x: Math.round(q.x), y: Math.round(q.y), col: alt ? st.color2 : st.color };
                $('.ok-stage').appendChild(el);
                el.addEventListener('input', styleText);
                styleText();
                setTimeout(() => el.focus(), 0);
            }
            function styleText() {
                const el = text.el, z = st.zoom, fs = opt.tsize * z, lines = el.value.split('\n');
                el.style.left = text.x * z + 'px'; el.style.top = text.y * z + 'px';
                el.style.font = fontCss(fs); el.style.lineHeight = '1.2'; el.style.color = text.col; el.style.opacity = st.alpha / 100;
                ctx.save(); ctx.font = fontCss(fs); const w = Math.max(...lines.map(l => ctx.measureText(l).width)); ctx.restore();
                el.style.width = Math.ceil(w + fs * 0.6) + 'px'; el.style.height = Math.ceil(lines.length * fs * 1.2) + 2 + 'px';
            }
            function cancelText() { if (text) { text.el.remove(); text = null; } render(); }
            function commitText() {
                const t = text;
                if (!t) return;
                text = null; t.el.remove();
                if (!t.el.value.trim() || !layers[st.active].vis) return render();
                const before = snap(st.active), c = mk(), g = c.getContext('2d');
                g.font = fontCss(opt.tsize); g.fillStyle = t.col; g.textBaseline = 'top';
                t.el.value.split('\n').forEach((l, i) => g.fillText(l, t.x, t.y + opt.tsize * (0.1 + i * 1.2)));
                if (!opt.tsmooth) {                                       // crisp: every pixel all or nothing
                    const img = g.getImageData(0, 0, W, H), d = img.data, [r, gg, b] = hexRgb(t.col);
                    for (let o = 3; o < d.length; o += 4) { if (d[o] >= 110) { d[o - 3] = r; d[o - 2] = gg; d[o - 1] = b; d[o] = 255; } else d[o] = 0; }
                    g.putImageData(img, 0, 0);
                }
                const lg = layerCtx(); lg.save(); lg.globalAlpha = st.alpha / 100; lg.drawImage(c, 0, 0); lg.restore();
                remember(before, snap(st.active));
                render();
            }

            /* ---------- selections: a rectangle, free-form or magic-wand area; lifted off the layer to move ---------- */
            const selRect = () => sel.float ? { x: sel.fx, y: sel.fy, w: sel.fw, h: sel.fh } : { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
            const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
            function handleSpots() {
                const r = selRect();
                return HANDLES.map(h => [h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2, h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2, h]);
            }
            function hitHandle(q) {
                if (!sel || st.tool === 'move') return null;
                const tol = 6 * W / cv.getBoundingClientRect().width;
                for (const [hx, hy, h] of handleSpots()) if (Math.abs(q.x - hx) <= tol && Math.abs(q.y - hy) <= tol) return h;
                return null;
            }
            function inSel(q) {
                if (!sel) return false;
                if (sel.float) return q.x >= sel.fx && q.x < sel.fx + sel.fw && q.y >= sel.fy && q.y < sel.fy + sel.fh;
                const x = Math.floor(q.x - sel.x), y = Math.floor(q.y - sel.y);
                if (x < 0 || y < 0 || x >= sel.w || y >= sel.h) return false;
                return !sel.md || !!sel.md[y * sel.w + x];
            }
            /** A selection of any shape, from a mask (1 = in) of w × h at x, y. */
            function maskSel(x, y, w, h, md) {
                const mask = mk(w, h), g = mask.getContext('2d'), img = g.createImageData(w, h), edges = new Path2D();
                let any = false;
                for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                    const k = j * w + i;
                    if (!md[k]) continue;
                    any = true; img.data[k * 4 + 3] = 255;
                    if (i === 0 || !md[k - 1]) { edges.moveTo(i, j); edges.lineTo(i, j + 1); }
                    if (i === w - 1 || !md[k + 1]) { edges.moveTo(i + 1, j); edges.lineTo(i + 1, j + 1); }
                    if (j === 0 || !md[k - w]) { edges.moveTo(i, j); edges.lineTo(i + 1, j); }
                    if (j === h - 1 || !md[k + w]) { edges.moveTo(i, j + 1); edges.lineTo(i + 1, j + 1); }
                }
                if (!any) return null;
                g.putImageData(img, 0, 0);
                return { x, y, w, h, mask, md, edges };
            }
            function lassoSel(pts) {
                if (pts.length < 3) return null;
                let x0 = W, y0 = H, x1 = 0, y1 = 0;
                for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
                x0 = clamp(Math.floor(x0), 0, W); y0 = clamp(Math.floor(y0), 0, H); x1 = clamp(Math.ceil(x1), 0, W); y1 = clamp(Math.ceil(y1), 0, H);
                const w = x1 - x0, h = y1 - y0;
                if (w < 1 || h < 1) return null;
                const c = mk(w, h), g = c.getContext('2d');
                g.translate(-x0, -y0); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.fill();
                const d = g.getImageData(0, 0, w, h).data, md = new Uint8Array(w * h);
                for (let i = 0; i < w * h; i++) md[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
                return maskSel(x0, y0, w, h, md);
            }
            function wandSel(q) {
                const f = flood(q);
                if (!f) return null;
                let x0 = W, y0 = H, x1 = -1, y1 = -1;
                for (let i = 0; i < W * H; i++) if (f.seen[i]) { const x = i % W, y = (i - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
                if (x1 < 0) return null;
                const w = x1 - x0 + 1, h = y1 - y0 + 1, md = new Uint8Array(w * h);
                for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) md[j * w + i] = f.seen[(y0 + j) * W + x0 + i];
                return maskSel(x0, y0, w, h, md);
            }
            /** Takes what's selected off the layer (or a copy of it) so it can move. */
            function lift(copy) {
                if (!sel || sel.float) return;
                const g = layerCtx(), f = mk(sel.w, sel.h), fg = f.getContext('2d');
                sel.before = snap(st.active);
                fg.drawImage(layers[st.active].c, -sel.x, -sel.y);
                if (sel.mask) { fg.globalCompositeOperation = 'destination-in'; fg.drawImage(sel.mask, 0, 0); }
                if (!copy) {
                    g.save();
                    if (sel.mask) { g.globalCompositeOperation = 'destination-out'; g.drawImage(sel.mask, sel.x, sel.y); } else g.clearRect(sel.x, sel.y, sel.w, sel.h);
                    g.restore();
                }
                Object.assign(sel, { float: f, fx: sel.x, fy: sel.y, fw: sel.w, fh: sel.h });
            }
            function placeFloat(g) { g.save(); g.imageSmoothingEnabled = false; g.drawImage(sel.float, sel.fx, sel.fy, sel.fw, sel.fh); g.restore(); }
            /** Puts what's moving down where it is, and lets the selection go. */
            function drop() {
                if (!sel) return;
                if (sel.float) { placeFloat(layerCtx()); remember(sel.before, snap(st.active)); }
                sel = null; render();
            }
            function deleteSel() {
                if (!sel) return;
                lift(false);
                const before = sel.before;
                sel = null;
                remember(before, snap(st.active));
                render();
            }
            function copySel() {
                if (!sel) return;
                const c = mk(sel.float ? sel.fw : sel.w, sel.float ? sel.fh : sel.h), g = c.getContext('2d');
                if (sel.float) { g.imageSmoothingEnabled = false; g.drawImage(sel.float, 0, 0, sel.fw, sel.fh); clip = { c, x: sel.fx, y: sel.fy }; return; }
                g.drawImage(layers[st.active].c, -sel.x, -sel.y);
                if (sel.mask) { g.globalCompositeOperation = 'destination-in'; g.drawImage(sel.mask, 0, 0); }
                clip = { c, x: sel.x, y: sel.y };
            }
            function paste() {
                if (!clip) return;
                setTool('select'); drop();
                const f = mk(clip.c.width, clip.c.height); f.getContext('2d').drawImage(clip.c, 0, 0);
                sel = { x: clip.x, y: clip.y, w: f.width, h: f.height, mask: null, float: f, fx: clip.x, fy: clip.y, fw: f.width, fh: f.height, before: snap(st.active) };
                render();
            }
            function selectAll() { setTool('select'); drop(); sel = { x: 0, y: 0, w: W, h: H, mask: null }; render(); }
            function xform(c, kind) {
                const w = c.width, h = c.height, o = mk(kind === 'rot' ? h : w, kind === 'rot' ? w : h), g = o.getContext('2d');
                if (kind === 'fliph') g.setTransform(-1, 0, 0, 1, w, 0); else if (kind === 'flipv') g.setTransform(1, 0, 0, -1, 0, h); else g.setTransform(0, 1, -1, 0, h, 0);
                g.drawImage(c, 0, 0);
                return o;
            }
            /** Flip ↔, Flip ↕, Rotate ↻: the selection if there is one, else the whole layer. */
            function turn(kind) {
                settle();
                if (sel) {
                    lift(false);
                    sel.float = xform(sel.float, kind);
                    if (kind === 'fliph' || kind === 'flipv') return render();
                    const cx = sel.fx + sel.fw / 2, cy = sel.fy + sel.fh / 2;
                    [sel.fw, sel.fh] = [sel.fh, sel.fw];
                    sel.fx = Math.round(cx - sel.fw / 2); sel.fy = Math.round(cy - sel.fh / 2);
                    return render();
                }
                const l = layers[st.active], before = snap(st.active), g = l.c.getContext('2d'), tmp = mk();
                tmp.getContext('2d').drawImage(l.c, 0, 0);
                g.save(); g.clearRect(0, 0, W, H);
                if (kind === 'fliph') g.setTransform(-1, 0, 0, 1, W, 0); else if (kind === 'flipv') g.setTransform(1, 0, 0, -1, 0, H);
                else g.setTransform(0, 1, -1, 0, Math.round((W + H) / 2), Math.round((H - W) / 2));
                g.drawImage(tmp, 0, 0); g.restore();
                remember(before, snap(st.active));
                render();
            }
            function selDown(q, e) {
                const t = st.tool, h = hitHandle(q);
                if (h) { lift(e.ctrlKey); drag = { kind: 'scale', h, q0: q, r0: selRect() }; return render(); }
                if (sel && inSel(q)) {
                    if (sel.float && e.ctrlKey) placeFloat(layerCtx());           // Ctrl+drag again: leaves a copy here
                    else lift(e.ctrlKey);
                    drag = { kind: 'move', q0: q, fx: sel.fx, fy: sel.fy };
                    return render();
                }
                drop();
                if (t === 'move') { sel = { x: 0, y: 0, w: W, h: H, mask: null }; lift(e.ctrlKey); drag = { kind: 'move', q0: q, fx: 0, fy: 0, whole: true }; return render(); }
                if (t === 'wand') { sel = wandSel(q); return render(); }
                drag = { kind: t === 'lasso' ? 'lasso' : 'rect', q0: q, pts: [q] };
            }
            function selMove(q) {
                const d = drag;
                if (d.kind === 'move') { sel.fx = d.fx + Math.round(q.x - d.q0.x); sel.fy = d.fy + Math.round(q.y - d.q0.y); }
                else if (d.kind === 'scale') {
                    const r = d.r0, dx = q.x - d.q0.x, dy = q.y - d.q0.y;
                    let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
                    if (d.h.includes('w')) x0 = Math.min(x1 - 1, x0 + dx);
                    if (d.h.includes('e')) x1 = Math.max(x0 + 1, x1 + dx);
                    if (d.h.includes('n')) y0 = Math.min(y1 - 1, y0 + dy);
                    if (d.h.includes('s')) y1 = Math.max(y0 + 1, y1 + dy);
                    sel.fx = Math.round(x0); sel.fy = Math.round(y0); sel.fw = Math.max(1, Math.round(x1) - sel.fx); sel.fh = Math.max(1, Math.round(y1) - sel.fy);
                }
                else if (d.kind === 'rect') d.q = q;
                else d.pts.push(q);
                soon();
            }
            function selUp() {
                const d = drag;
                drag = null;
                if (d.kind === 'rect') {
                    const a = d.q0, b = d.q || a;
                    const x0 = clamp(Math.floor(Math.min(a.x, b.x)), 0, W), y0 = clamp(Math.floor(Math.min(a.y, b.y)), 0, H);
                    const x1 = clamp(Math.ceil(Math.max(a.x, b.x)), 0, W), y1 = clamp(Math.ceil(Math.max(a.y, b.y)), 0, H);
                    sel = x1 - x0 >= 1 && y1 - y0 >= 1 && dist(a, b) > 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0, mask: null } : null;
                } else if (d.kind === 'lasso') sel = lassoSel(d.pts);
                else if (d.whole) drop();
                render();
            }
            function hover(q) {
                let c = st.tool === 'text' ? 'text' : 'crosshair';
                if (SELECTS[st.tool]) {
                    const h = hitHandle(q);
                    if (h) c = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', ne: 'nesw', sw: 'nesw', nw: 'nwse', se: 'nwse' }[h] + '-resize';
                    else if (st.tool === 'move' || inSel(q)) c = 'move';
                }
                if (cv.style.cursor !== c) cv.style.cursor = c;
            }

            /* ---------- the pointer ---------- */
            cv.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
                e.preventDefault();
                if (down) return;
                if (text) { commitText(); if (st.tool === 'text') return; }       // a click off the text puts it down
                down = true;
                try { cv.setPointerCapture(e.pointerId); } catch { /* gone already */ }
                begin(at(e), e, e.button === 2);
            });
            cv.addEventListener('pointermove', (e) => {
                if (!down) return hover(at(e));
                if (drag) return selMove(at(e));
                if (!stroke) return;
                const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
                for (const ev of (evs.length ? evs : [e])) { if (!stroke) break; moveTo(at(ev), ev); }
            });
            const up = () => {
                if (!down) return;
                down = false;
                if (drag) return selUp();
                if (!stroke) return;
                if (stroke.curve && stroke.curve.phase < 2) { stroke.curve.phase++; return; }      // a curve waits for its bends
                end();
            };
            cv.addEventListener('pointerup', up);
            cv.addEventListener('pointercancel', up);
            root.addEventListener('contextmenu', (e) => {
                if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'color') return;
                e.preventDefault(); e.stopPropagation();
                const a = e.target.closest('[data-c]');
                if (a) setColor2(a.dataset.c);                            // right click on the palette: the 2nd colour
            });
            // Nothing comes in from outside: no dropping or pasting pictures.
            for (const ev of ['dragover', 'drop', 'paste']) root.addEventListener(ev, (e) => e.preventDefault());
            // Ctrl + the wheel zooms the canvas (not the page), keeping the spot under the pointer where it is.
            // A step a notch; a trackpad's many small turns add up to one.
            let wheel = 0;
            root.addEventListener('wheel', (e) => {
                if (!e.ctrlKey) return;
                e.preventDefault();
                wheel += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
                if (Math.abs(wheel) < 50) return;
                const out = wheel > 0;
                wheel = 0;
                const area = $('.ok-area'), r = cv.getBoundingClientRect();
                const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height, was = st.zoom;
                if (out) zoomOut(); else zoomIn();
                if (st.zoom === was) return;
                const r2 = cv.getBoundingClientRect();
                area.scrollLeft += r2.left + fx * r2.width - e.clientX;
                area.scrollTop += r2.top + fy * r2.height - e.clientY;
            }, { passive: false });

            function close(result) {
                document.removeEventListener('keydown', onKey, true);
                document.removeEventListener('keyup', noPress, true);
                if (stroke && stroke.timer) clearInterval(stroke.timer);
                root.remove();
                showing = null;
                resolve(result);
            }
            function finish() {
                if (stroke && !stroke.curve) return;
                settle(); drop();
                const out = mk(); const g = out.getContext('2d');
                g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
                for (const l of layers) if (l.vis) { g.globalAlpha = l.op / 100; g.drawImage(l.c, 0, 0); }
                g.globalAlpha = 1;
                close({
                    png: out.toDataURL('image/png'), width: W, height: H,
                    thumb: (max) => { const k = Math.min(1, max / Math.max(W, H)), t = mk(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k))); const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(out, 0, 0, t.width, t.height); return { data: t.toDataURL('image/jpeg', 0.85), w: t.width, h: t.height }; }
                });
            }
            /** New: a blank canvas, its size asked for in the menu bar. */
            function newCanvas() {
                const box = $('.ok-new');
                if (!box.hidden) { box.hidden = true; return; }
                box.querySelector('[name=w]').value = W; box.querySelector('[name=h]').value = H;
                box.hidden = false;
            }
            $('.ok-new').addEventListener('submit', (e) => {
                e.preventDefault();
                const f = e.target;
                if (st.dirty && !confirm('Start again? This drawing will be lost.')) return;
                f.hidden = true;
                fresh(clamp(Math.round(+f.w.value) || W, MIN_SIDE, MAX_SIDE), clamp(Math.round(+f.h.value) || H, MIN_SIDE, MAX_SIDE));
            });

            root.addEventListener('click', (e) => {
                if (e.target.classList.contains('ok-rn')) return;
                const a = e.target.closest('a, .ok-lay');
                if (!a) return;
                const d = a.dataset;
                if (d.t) return setTool(d.t);
                if (d.c) return setColor(d.c);
                if (d.o && d.v !== undefined) { opt[d.o] = d.v; return syncOpts(); }
                if (d.ob) { opt[d.ob] = !opt[d.ob]; return syncOpts(); }
                if (d.l !== undefined && !e.target.dataset.vis) { if (+d.l !== st.active) { settle(); drop(); st.active = +d.l; markActive(); } return; }
                switch (d.k) {
                    case 'new': return newCanvas();
                    case 'undo': return undoIt();
                    case 'redo': return redoIt();
                    case 'fliph': case 'flipv': case 'rot': return turn(d.k);
                    case 'mirror': return toggleMirror();
                    case 'swap': return swap();
                    case 'zin': return zoomIn();
                    case 'zout': return zoomOut();
                    case 'finish': return finish();
                    case 'cancel': if (!st.dirty || confirm('Throw this drawing away?')) close(null); return;
                    case 'ladd': if (layers.length < MAX_LAYERS) layerChange(() => { const n = Math.max(0, ...layers.map(l => +(/\d+$/.exec(l.name) || [0])[0])) + 1; layers.splice(st.active + 1, 0, { c: mk(), name: 'Layer ' + n, vis: true, op: 100 }); st.active++; }); return;
                    case 'ldup': if (layers.length < MAX_LAYERS) layerChange(() => { const l = layers[st.active], c = mk(); c.getContext('2d').drawImage(l.c, 0, 0); layers.splice(st.active + 1, 0, { c, name: (l.name + ' copy').slice(0, 32), vis: l.vis, op: l.op }); st.active++; }); return;
                    case 'lmerge': if (st.active > 0) layerChange(() => { const t = layers[st.active], g = layers[st.active - 1].c.getContext('2d'); g.save(); g.globalAlpha = t.op / 100; g.drawImage(t.c, 0, 0); g.restore(); layers.splice(st.active, 1); st.active--; }); return;
                    case 'ldel': if (layers.length > 1) layerChange(() => { layers.splice(st.active, 1); st.active = Math.max(0, st.active - 1); }); return;
                    case 'lup': if (st.active < layers.length - 1) layerChange(() => { const l = layers.splice(st.active, 1)[0]; layers.splice(++st.active, 0, l); }); return;
                    case 'ldown': if (st.active > 0) layerChange(() => { const l = layers.splice(st.active, 1)[0]; layers.splice(--st.active, 0, l); }); return;
                }
            });
            root.addEventListener('change', (e) => {
                const v = e.target.dataset.vis;
                if (v !== undefined) layerChange(() => { layers[+v].vis = e.target.checked; });
            });
            root.addEventListener('input', (e) => {
                const k = e.target.dataset.o;
                if (k) { opt[k] = e.target.tagName === 'SELECT' ? e.target.value : +e.target.value; syncOpts(); }
            });
            // Rename a layer: double-click its name.
            root.addEventListener('dblclick', (e) => {
                const n = e.target.closest('.ok-ln');
                if (!n) return;
                const i = +n.closest('.ok-lay').dataset.l, inp = document.createElement('input');
                inp.className = 'ok-rn'; inp.value = layers[i].name; inp.maxLength = 32;
                n.replaceWith(inp); inp.focus(); inp.select();
                let done = false;
                const fin = (ok) => { if (done) return; done = true; const v = inp.value.trim(); if (ok && v && v !== layers[i].name) layerChange(() => { layers[i].name = v; }); else drawLayers(); };
                inp.okCancel = () => fin(false);                            // Esc (seen by onKey: it keeps Esc from reaching the page)
                inp.addEventListener('keydown', (k) => { if (k.key === 'Enter') { k.preventDefault(); fin(true); } });
                inp.addEventListener('blur', () => fin(true));
            });
            // Reorder layers: drag one onto another's place.
            const lays = $('.ok-lays'), unmark = () => { for (const r of lays.querySelectorAll('.drop')) r.classList.remove('drop'); };
            lays.addEventListener('dragstart', (e) => { const r = e.target.closest && e.target.closest('.ok-lay'); if (!r) return; e.dataTransfer.setData('text/x-ok-layer', r.dataset.l); e.dataTransfer.effectAllowed = 'move'; });
            lays.addEventListener('dragover', (e) => {
                if (!e.dataTransfer.types.includes('text/x-ok-layer')) return;
                e.preventDefault(); e.stopPropagation();
                const r = e.target.closest('.ok-lay'); unmark(); if (r) r.classList.add('drop');
            });
            lays.addEventListener('drop', (e) => {
                const from = e.dataTransfer.getData('text/x-ok-layer'), r = e.target.closest('.ok-lay');
                unmark();
                if (from === '' || !r) return;
                e.preventDefault(); e.stopPropagation();
                const i = +from, j = +r.dataset.l;
                if (i !== j) layerChange(() => { const l = layers.splice(i, 1)[0]; layers.splice(j, 0, l); st.active = j; });
            });
            lays.addEventListener('dragend', unmark);
            // Layer opacity: one undo step a slide.
            let opBefore = null;
            $('.ok-lop').addEventListener('input', (e) => {
                if (!opBefore) { settle(); drop(); opBefore = snapAll(); }
                layers[st.active].op = +e.target.value; $('.ok-lov').textContent = e.target.value + '%';
                render();
            });
            $('.ok-lop').addEventListener('change', () => { if (opBefore) { remember(opBefore, snapAll()); opBefore = null; drawLayers(); } });
            $('.ok-col').addEventListener('input', (e) => setColor(e.target.value));
            $('.ok-col2').addEventListener('input', (e) => setColor2(e.target.value));
            $('.ok-size').addEventListener('input', (e) => { st.size = +e.target.value; showVals(); });
            $('.ok-alpha').addEventListener('input', (e) => { st.alpha = +e.target.value; showVals(); });
            // Space and Enter press nothing outside the oekaki (a button presses on Space's keyup).
            function noPress(e) {
                if ((e.key === ' ' || e.key === 'Enter') && !root.contains(e.target)) { e.preventDefault(); e.stopPropagation(); return true; }
                return false;
            }
            document.addEventListener('keyup', noPress, true);
            function onKey(e) {
                noPress(e);
                if (e.key === 'Escape') { e.stopPropagation(); if (e.target.okCancel) return e.target.okCancel(); }     // only Cancel closes it
                if (text && e.target === text.el) {
                    if (e.key === 'Escape') { e.preventDefault(); cancelText(); }
                    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitText(); }
                    return;
                }
                if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
                const k = e.key.toLowerCase(), eat = () => { e.preventDefault(); e.stopPropagation(); };
                if (e.ctrlKey || e.metaKey) {
                    if (k === 'z') { eat(); return e.shiftKey ? redoIt() : undoIt(); }
                    if (k === 'y') { eat(); return redoIt(); }
                    if (k === 'a') { eat(); return selectAll(); }
                    if (k === 'd') { eat(); return drop(); }
                    if (k === 'c' && sel) { eat(); return copySel(); }
                    if (k === 'x' && sel) { eat(); copySel(); return deleteSel(); }
                    if (k === 'v') { eat(); return paste(); }
                    return;
                }
                if (e.altKey || down) return;
                if (k === 'escape') { if (stroke && stroke.curve) { stroke = null; return render(); } return drop(); }
                if (k === 'enter') { e.preventDefault(); if (stroke && stroke.curve) return end(); return drop(); }
                if ((k === 'delete' || k === 'backspace') && sel) { eat(); return deleteSel(); }
                if (k.startsWith('arrow') && sel) {
                    eat(); lift(false);
                    const n = e.shiftKey ? 10 : 1;
                    sel.fx += k === 'arrowleft' ? -n : k === 'arrowright' ? n : 0; sel.fy += k === 'arrowup' ? -n : k === 'arrowdown' ? n : 0;
                    return render();
                }
                const t = TOOLS.find(x => x[2].toLowerCase() === k);
                if (t) { e.stopPropagation(); return setTool(t[0]); }
                if (k === 'x') { e.stopPropagation(); return swap(); }
                if (k === 'm') { e.stopPropagation(); return toggleMirror(); }
                if (k === '[' || k === ']') { st.size = clamp(st.size + (k === ']' ? 1 : -1), 1, 64); showVals(); e.stopPropagation(); }
            }
            document.addEventListener('keydown', onKey, true);

            setColor('#000000'); setColor2('#ffffff');
            fresh(W, H);
            setTool('pencil');
            // Editing again: the drawing made here before, flattened onto the background.
            if (/^data:image\/png;base64,/.test(String(opts.start || ''))) {
                const im = new Image();
                im.onload = () => { layers[0].c.getContext('2d').drawImage(im, 0, 0); render(); };
                im.src = opts.start;
            }
        });
        return showing;
    }
    window.Oekaki = { open };
})();
