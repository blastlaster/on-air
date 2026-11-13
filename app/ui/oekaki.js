/* =============================================================
   Oekaki: draw a green thread's picture, in the style of the board
   drawing tools (/i/'s Tegaki). Only what you draw here: there is
   no way to open, paste or drop a picture in.

   Oekaki.open({ width, height }) → Promise<{ png, jpg(max) }|null>
   png: the drawing (a data: URL); thumb(max): a JPEG thumbnail of
   it, at most max px. null if the listener cancels.

   Tools: pencil (hard pixels), pen (soft, follows pen pressure),
   airbrush, tone (screentone dots), eraser, bucket, pipette.
   Layers (the bottom one starts white), undo / redo, zoom.
   ============================================================= */
(function () {
    'use strict';
    const PALETTE = ['#000000', '#ffffff', '#808080', '#c0c0c0', '#800000', '#ff0000', '#ff8080', '#808000', '#ffff00', '#ffff80', '#008000', '#00ff00', '#80ff80',
        '#008080', '#00ffff', '#000080', '#0000ff', '#8080ff', '#800080', '#ff00ff', '#ff80c0', '#804000', '#ff8000', '#ffd8b0'];
    const TOOLS = [['pencil', 'Pencil', 'B'], ['pen', 'Pen', 'P'], ['airbrush', 'Airbrush', 'A'], ['tone', 'Tone', 'T'], ['eraser', 'Eraser', 'E'], ['bucket', 'Bucket', 'G'], ['pipette', 'Pipette', 'I']];
    const MAX_LAYERS = 8, MAX_UNDO = 30, MIN_SIDE = 100, MAX_SIDE = 800;
    // 4×4 ordered dither: the tone tool's dots
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const rgbHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

    function open(opts = {}) {
        return new Promise((resolve) => {
            let W = clamp(Math.round(opts.width || 400), MIN_SIDE, MAX_SIDE), H = clamp(Math.round(opts.height || 400), MIN_SIDE, MAX_SIDE);
            const st = { tool: 'pencil', color: '#000000', size: 3, alpha: 100, zoom: 1, active: 0, dirty: false };
            const sizes = {};                                            // each tool keeps its own size
            let layers = [], undo = [], redo = [];

            const root = document.createElement('div');
            root.className = 'ok-root';
            root.innerHTML =
                '<div class="ok-menu">' +
                    '<a data-k="new">New</a>' +
                    '<form class="ok-new" hidden><input name="w" type="number" min="' + MIN_SIDE + '" max="' + MAX_SIDE + '"> × <input name="h" type="number" min="' + MIN_SIDE + '" max="' + MAX_SIDE + '"> <button>OK</button></form>' +
                    '<a data-k="undo">Undo</a><a data-k="redo">Redo</a>' +
                    '<span class="ok-zoom">Zoom: <a data-k="zout">−</a><span class="ok-zv">100%</span><a data-k="zin">+</a></span>' +
                    '<span class="ok-sp"></span><a data-k="finish" class="ok-finish">Finish</a><a data-k="cancel">Cancel</a>' +
                '</div>' +
                '<div class="ok-body">' +
                    '<div class="ok-area"><div class="ok-wrap"><canvas class="ok-cv"></canvas></div></div>' +
                    '<div class="ok-side">' +
                        '<div class="ok-box"><div class="ok-h">Color</div><div class="ok-cur"><input type="color" class="ok-col" value="#000000" title="Pick any colour"><span class="ok-hex">#000000</span></div>' +
                            '<div class="ok-pal">' + PALETTE.map(c => '<a data-c="' + c + '" style="background:' + c + '" title="' + c + '"></a>').join('') + '</div></div>' +
                        '<div class="ok-box"><div class="ok-h">Size <span class="ok-sv"></span></div><input type="range" class="ok-size" min="1" max="64" step="1">' +
                            '<div class="ok-h">Alpha <span class="ok-av"></span></div><input type="range" class="ok-alpha" min="1" max="100" step="1"></div>' +
                        '<div class="ok-box"><div class="ok-h">Tools</div><div class="ok-tools">' + TOOLS.map(([k, n, key]) => '<a data-t="' + k + '" title="' + n + ' (' + key + ')">' + n + '</a>').join('') + '</div></div>' +
                        '<div class="ok-box"><div class="ok-h">Layers</div><div class="ok-lays"></div>' +
                            '<div class="ok-lbtn"><a data-k="ladd" title="New layer">+</a><a data-k="ldel" title="Delete layer">−</a><a data-k="lup" title="Move up">↑</a><a data-k="ldown" title="Move down">↓</a></div></div>' +
                        '<div class="ok-note">Only what you draw: pictures can’t be brought in.<br>Ctrl+Z undo · Ctrl+Y redo · [ ] size</div>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(root);
            const $ = (s) => root.querySelector(s);
            const cv = $('.ok-cv'), ctx = cv.getContext('2d');

            const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
            function fresh(w, h) {
                W = w; H = h;
                cv.width = W; cv.height = H;
                const bg = mk(); const g = bg.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
                layers = [{ c: bg, name: 'Background', vis: true }, { c: mk(), name: 'Layer 1', vis: true }];
                st.active = 1; undo = []; redo = []; st.dirty = false;
                setZoom(W > 600 || H > 600 ? 1 : st.zoom);
                drawLayers(); render();
            }

            /* ---------- what's on screen ---------- */
            let stroke = null, frame = 0;
            function render() {
                frame = 0;
                ctx.clearRect(0, 0, W, H);
                layers.forEach((l, i) => {
                    if (!l.vis) return;
                    if (stroke && i === st.active) {
                        const tmp = stroke.view;
                        const g = tmp.getContext('2d');
                        g.globalCompositeOperation = 'copy'; g.globalAlpha = 1; g.drawImage(l.c, 0, 0);
                        g.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
                        g.globalAlpha = stroke.alpha; g.drawImage(stroke.c, 0, 0);
                        ctx.drawImage(tmp, 0, 0);
                    } else ctx.drawImage(l.c, 0, 0);
                });
            }
            const soon = () => { if (!frame) frame = requestAnimationFrame(render); };

            /* ---------- history ---------- */
            const snap = (li) => ({ li, data: layers[li].c.getContext('2d').getImageData(0, 0, W, H) });
            const snapAll = () => ({ all: layers.map(l => ({ name: l.name, vis: l.vis, data: l.c.getContext('2d').getImageData(0, 0, W, H) })), active: st.active });
            function restore(s) {
                if (s.all) {
                    layers = s.all.map(x => { const c = mk(); c.getContext('2d').putImageData(x.data, 0, 0); return { c, name: x.name, vis: x.vis }; });
                    st.active = Math.min(s.active, layers.length - 1);
                } else layers[s.li].c.getContext('2d').putImageData(s.data, 0, 0);
            }
            function remember(before, after) { undo.push({ before, after }); if (undo.length > MAX_UNDO) undo.shift(); redo = []; st.dirty = true; }
            function step(from, to, which) {
                const e = from.pop(); if (!e) return;
                restore(e[which]); to.push(e);
                drawLayers(); render();
            }
            /** A change to the whole stack of layers (add, delete, move, show / hide). */
            function layerChange(fn) { const before = snapAll(); fn(); remember(before, snapAll()); drawLayers(); render(); }

            /* ---------- the controls ---------- */
            function drawLayers() {
                $('.ok-lays').innerHTML = layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) =>
                    '<div class="ok-lay' + (i === st.active ? ' on' : '') + '" data-l="' + i + '"><input type="checkbox" data-vis="' + i + '"' + (l.vis ? ' checked' : '') + ' title="Show / hide"> ' + esc(l.name) + '</div>').join('');
            }
            function setTool(t) {
                sizes[st.tool] = st.size;
                st.tool = t;
                st.size = sizes[t] || { pencil: 3, pen: 4, airbrush: 24, tone: 12, eraser: 12 }[t] || st.size;
                for (const a of root.querySelectorAll('[data-t]')) a.classList.toggle('on', a.dataset.t === t);
                showVals();
            }
            function setColor(c) {
                st.color = c; $('.ok-col').value = c; $('.ok-hex').textContent = c;
                for (const a of root.querySelectorAll('[data-c]')) a.classList.toggle('on', a.dataset.c === c);
            }
            function showVals() {
                $('.ok-size').value = st.size; $('.ok-sv').textContent = st.size;
                $('.ok-alpha').value = st.alpha; $('.ok-av').textContent = st.alpha + '%';
            }
            function setZoom(z) {
                st.zoom = clamp(z, 0.5, 4);
                cv.style.width = W * st.zoom + 'px'; cv.style.height = H * st.zoom + 'px';
                $('.ok-zv').textContent = Math.round(st.zoom * 100) + '%';
            }

            /* ---------- drawing ---------- */
            const at = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height, p: e.pointerType === 'pen' ? clamp(e.pressure || 0.5, 0.05, 1) : 1 }; };
            // Hard-edged tools (pencil, tone, eraser) mark a mask of whole pixels; the stroke canvas is drawn from it.
            function stamp(x, y, size) {
                const s = stroke, r = size / 2, x0 = Math.floor(x - r + 0.5), y0 = Math.floor(y - r + 0.5), n = Math.max(1, Math.round(size));
                for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
                    const px = x0 + i, py = y0 + j;
                    if (px < 0 || py < 0 || px >= W || py >= H) continue;
                    if (n > 2) { const dx = i + 0.5 - n / 2, dy = j + 0.5 - n / 2; if (dx * dx + dy * dy > (n / 2) * (n / 2)) continue; }
                    s.mask[py * W + px] = 1;
                }
                s.box = [Math.min(s.box[0], x0), Math.min(s.box[1], y0), Math.max(s.box[2], x0 + n), Math.max(s.box[3], y0 + n)];
            }
            function flushMask() {
                const s = stroke, [bx0, by0, bx1, by1] = [clamp(s.box[0], 0, W), clamp(s.box[1], 0, H), clamp(s.box[2], 0, W), clamp(s.box[3], 0, H)];
                if (bx1 <= bx0 || by1 <= by0) return;
                const w = bx1 - bx0, h = by1 - by0, img = s.g.createImageData(w, h), d = img.data, [r, g, b] = s.rgb;
                const level = Math.round(st.alpha / 100 * 16);
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                    const gx = bx0 + x, gy = by0 + y;
                    if (!s.mask[gy * W + gx]) continue;
                    if (s.tone && BAYER[(gy & 3) * 4 + (gx & 3)] >= level) continue;
                    const o = (y * w + x) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
                }
                s.g.putImageData(img, bx0, by0);
                s.box = [Infinity, Infinity, -Infinity, -Infinity];
            }
            function dab(x, y, p) {
                const s = stroke, size = Math.max(1, st.size * (st.tool === 'airbrush' ? 1 : p));
                if (s.hard) return stamp(x, y, size);
                if (st.tool === 'pen') { s.g.beginPath(); s.g.arc(x, y, size / 2, 0, Math.PI * 2); s.g.fill(); return; }
                // airbrush: soft spots that build up
                const gr = s.g.createRadialGradient(x, y, 0, x, y, size / 2), [r, g, b] = s.rgb;
                gr.addColorStop(0, `rgba(${r},${g},${b},${0.12 * p})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
                s.g.fillStyle = gr; s.g.fillRect(x - size / 2, y - size / 2, size, size);
            }
            function lineTo(q) {
                const s = stroke, a = s.last, dx = q.x - a.x, dy = q.y - a.y, dist = Math.hypot(dx, dy);
                const gap = Math.max(0.5, st.size * (st.tool === 'airbrush' ? 0.15 : 0.25) * (s.hard ? 0.5 : 1));
                for (let t = gap; t <= dist; t += gap) { const k = t / dist; dab(a.x + dx * k, a.y + dy * k, a.p + (q.p - a.p) * k); }
                s.last = q;
                if (s.hard) flushMask();
                soon();
            }
            function begin(e) {
                const q = at(e);
                if (st.tool === 'pipette') return pick(q);
                if (!layers[st.active].vis) return;
                if (st.tool === 'bucket') return fill(q);
                const c = mk(), g = c.getContext('2d'), rgb = hexRgb(st.color);
                g.fillStyle = st.color;
                const hard = st.tool === 'pencil' || st.tool === 'tone' || st.tool === 'eraser';
                stroke = { c, g, rgb, view: mk(), hard, tone: st.tool === 'tone', erase: st.tool === 'eraser', alpha: st.tool === 'tone' ? 1 : st.alpha / 100,
                    mask: hard ? new Uint8Array(W * H) : null, box: [Infinity, Infinity, -Infinity, -Infinity], last: q, before: snap(st.active) };
                dab(q.x, q.y, q.p);
                if (hard) flushMask();
                cv.setPointerCapture(e.pointerId);
                soon();
            }
            function end() {
                if (!stroke) return;
                const s = stroke; stroke = null;
                const g = layers[st.active].c.getContext('2d');
                g.save(); g.globalAlpha = s.alpha; g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; g.drawImage(s.c, 0, 0); g.restore();
                remember(s.before, snap(st.active));
                render();
            }
            function pick(q) {
                const d = ctx.getImageData(clamp(Math.floor(q.x), 0, W - 1), clamp(Math.floor(q.y), 0, H - 1), 1, 1).data;
                setColor(rgbHex(d[0], d[1], d[2]));
            }
            /** The bucket: the touching area of the same colour on this layer. */
            function fill(q) {
                const x0 = Math.floor(q.x), y0 = Math.floor(q.y);
                if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
                const g = layers[st.active].c.getContext('2d'), before = snap(st.active), img = g.getImageData(0, 0, W, H), d = img.data;
                const o0 = (y0 * W + x0) * 4, target = [d[o0], d[o0 + 1], d[o0 + 2], d[o0 + 3]];
                const [r, gg, b] = hexRgb(st.color), a = st.alpha / 100;
                const same = (o) => d[o] === target[0] && d[o + 1] === target[1] && d[o + 2] === target[2] && d[o + 3] === target[3];
                const seen = new Uint8Array(W * H), todo = [x0 + y0 * W];
                while (todo.length) {
                    const i = todo.pop();
                    if (seen[i]) continue;
                    const o = i * 4;
                    if (!same(o)) continue;
                    seen[i] = 1;
                    const x = i % W;
                    if (x > 0) todo.push(i - 1);
                    if (x < W - 1) todo.push(i + 1);
                    if (i >= W) todo.push(i - W);
                    if (i < W * (H - 1)) todo.push(i + W);
                }
                for (let i = 0; i < W * H; i++) {
                    if (!seen[i]) continue;
                    const o = i * 4, da = d[o + 3] / 255, oa = a + da * (1 - a);
                    if (oa <= 0) continue;
                    d[o] = Math.round((r * a + d[o] * da * (1 - a)) / oa); d[o + 1] = Math.round((gg * a + d[o + 1] * da * (1 - a)) / oa); d[o + 2] = Math.round((b * a + d[o + 2] * da * (1 - a)) / oa); d[o + 3] = Math.round(oa * 255);
                }
                g.putImageData(img, 0, 0);
                remember(before, snap(st.active));
                render();
            }

            cv.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') { e.preventDefault(); begin(e); } });
            cv.addEventListener('pointermove', (e) => {
                if (!stroke) return;
                const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
                for (const ev of (evs.length ? evs : [e])) lineTo(at(ev));
            });
            cv.addEventListener('pointerup', end);
            cv.addEventListener('pointercancel', end);
            cv.addEventListener('contextmenu', (e) => e.preventDefault());
            // Nothing comes in from outside: no dropping or pasting pictures.
            for (const ev of ['dragover', 'drop', 'paste']) root.addEventListener(ev, (e) => e.preventDefault());

            function close(result) {
                document.removeEventListener('keydown', onKey, true);
                root.remove();
                resolve(result);
            }
            function finish() {
                const out = mk(); const g = out.getContext('2d');
                g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
                for (const l of layers) if (l.vis) g.drawImage(l.c, 0, 0);
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
                const a = e.target.closest('a, .ok-lay');
                if (!a) return;
                const d = a.dataset;
                if (d.t) return setTool(d.t);
                if (d.c) return setColor(d.c);
                if (d.l !== undefined && !e.target.dataset.vis) { st.active = +d.l; return drawLayers(); }
                switch (d.k) {
                    case 'new': return newCanvas();
                    case 'undo': return step(undo, redo, 'before');
                    case 'redo': return step(redo, undo, 'after');
                    case 'zin': return setZoom(st.zoom >= 1 ? st.zoom + 1 : st.zoom * 2);
                    case 'zout': return setZoom(st.zoom > 1 ? st.zoom - 1 : st.zoom / 2);
                    case 'finish': return finish();
                    case 'cancel': if (!st.dirty || confirm('Throw this drawing away?')) close(null); return;
                    case 'ladd': if (layers.length < MAX_LAYERS) layerChange(() => { const n = Math.max(0, ...layers.map(l => +(/\d+$/.exec(l.name) || [0])[0])) + 1; layers.splice(st.active + 1, 0, { c: mk(), name: 'Layer ' + n, vis: true }); st.active++; }); return;
                    case 'ldel': if (layers.length > 1) layerChange(() => { layers.splice(st.active, 1); st.active = Math.max(0, st.active - 1); }); return;
                    case 'lup': if (st.active < layers.length - 1) layerChange(() => { const l = layers.splice(st.active, 1)[0]; layers.splice(++st.active, 0, l); }); return;
                    case 'ldown': if (st.active > 0) layerChange(() => { const l = layers.splice(st.active, 1)[0]; layers.splice(--st.active, 0, l); }); return;
                }
            });
            root.addEventListener('change', (e) => {
                const v = e.target.dataset.vis;
                if (v !== undefined) layerChange(() => { layers[+v].vis = e.target.checked; });
            });
            $('.ok-col').addEventListener('input', (e) => setColor(e.target.value));
            $('.ok-size').addEventListener('input', (e) => { st.size = +e.target.value; showVals(); });
            $('.ok-alpha').addEventListener('input', (e) => { st.alpha = +e.target.value; showVals(); });
            function onKey(e) {
                if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
                const k = e.key.toLowerCase();
                if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.stopPropagation(); return e.shiftKey ? step(redo, undo, 'after') : step(undo, redo, 'before'); }
                if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); e.stopPropagation(); return step(redo, undo, 'after'); }
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                const t = TOOLS.find(x => x[2].toLowerCase() === k);
                if (t) { e.stopPropagation(); return setTool(t[0]); }
                if (k === '[' || k === ']') { st.size = clamp(st.size + (k === ']' ? 1 : -1), 1, 64); showVals(); e.stopPropagation(); }
                if (e.key === 'Escape') e.stopPropagation();          // only Cancel closes it
            }
            document.addEventListener('keydown', onKey, true);

            setTool('pencil'); setColor('#000000'); showVals();
            fresh(W, H);
            // Editing again: the drawing made here before, flattened onto the background.
            if (/^data:image\/png;base64,/.test(String(opts.start || ''))) {
                const im = new Image();
                im.onload = () => { layers[0].c.getContext('2d').drawImage(im, 0, 0); render(); };
                im.src = opts.start;
            }
        });
    }
    window.Oekaki = { open };
})();
