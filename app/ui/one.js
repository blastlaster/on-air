/* =============================================================
   THE ONE WINDOW — the radio grown into one big window, laid out
   like the station's site: a top bar with the tabs and the LED
   sign, Now Playing on the left, the middle, the video and the
   chat on the right. Request, Albums, Call in, Links and Settings
   open over the page.

   The middle holds the board ([s4s]), the Interface and
   blug.dj/jej: one of them, or two or three side by side in one
   of the arrangements below (▦ in the top bar picks; ⤢ on a part
   fills the middle with it, and back). One of them can sit under
   Now Playing instead of the playlist.

   Each part is the same page its own window would be
   (win.html?w=chat), in a frame here: window.parent.core is the
   station, and the app knows each frame by its part.
   Settings → Layout switches between this and the separate windows.
   ============================================================= */
(function () {
    'use strict';
    const PANELS = ['np', 'mid', 'tv', 'chat'];
    const FLY = { request: 560, albums: 640, studio: 480, links: 520, settings: 600 };
    /* The middle's parts, and the ways they share it: a grid each (columns, rows, areas). */
    const PARTS = ['board', 'interface', 'hall'];
    const SIDE = 'minmax(320px, 36%)';
    const ARR = {
        board: { cols: '1fr', rows: '1fr', areas: '"board"' },
        interface: { cols: '1fr', rows: '1fr', areas: '"interface"' },
        hall: { cols: '1fr', rows: '1fr', areas: '"hall"' },
        'board+hall': { cols: SIDE + ' minmax(0, 1fr)', rows: '1fr', areas: '"board hall"' },
        'interface+hall': { cols: SIDE + ' minmax(0, 1fr)', rows: '1fr', areas: '"interface hall"' },
        'board+interface': { cols: '1fr 1fr', rows: '1fr', areas: '"board interface"' },
        'board/interface+hall': { cols: SIDE + ' minmax(0, 1fr)', rows: '1fr 1fr', areas: '"board hall" "interface hall"' },
        'hall+board/interface': { cols: 'minmax(0, 1fr) ' + SIDE, rows: '1fr 1fr', areas: '"hall board" "hall interface"' },
        'hall/board+interface': { cols: '1fr 1fr', rows: 'minmax(0, 1.4fr) minmax(0, 1fr)', areas: '"hall hall" "board interface"' },
        'board+hall+interface': { cols: 'minmax(300px, 28%) minmax(0, 1fr) minmax(300px, 28%)', rows: '1fr', areas: '"board hall interface"' }
    };
    const partsOf = (a) => (ARR[a] ? PARTS.filter(p => ARR[a].areas.includes(p)) : []);
    const setKey = (parts) => PARTS.filter(p => parts.includes(p)).join(',');

    window.OneWindow = function ({ app, core, $, esc }) {
        const saved = (UI.info.ui && UI.info.ui.full) || {};
        // Which panels show (the video never comes back by itself: it stops the radio).
        const show = { np: saved.np !== false, chat: saved.chat !== false, tv: false, mid: ARR[saved.mid] ? saved.mid : '', under: PARTS.includes(saved.under) ? saved.under : '' };
        // For each mix of parts, the arrangement last picked for it.
        const pref = saved.arr && typeof saved.arr === 'object' ? { ...saved.arr } : {};
        const frames = {};             // id → its <iframe>
        let fly = '', s = core.state, list = [], picking = false, zoomedFrom = null;      // zoomedFrom: { mid, under } before ⤢

        const markup =
            '<div class="one">' +
            '<header class="one-head">' +
              '<div class="one-brand"><span class="one-name"></span>' +
                '<span class="one-pill" title="Red when someone is live, blue for AutoDJ"><span class="light"></span><span class="state">Tuning in…</span><span class="count dim"></span></span></div>' +
              '<nav class="one-tabs"></nav>' +
              '<div class="one-win">' +
                '<button type="button" data-w="pick" title="Arrange the middle: [s4s], the Interface and blug.dj/jej">▦</button>' +
                '<button type="button" data-w="layout" title="Separate windows: the little radio, each part in its own window">⧉</button>' +
                '<button type="button" data-w="menu" title="Window options">≡</button>' +
                '<button type="button" data-w="tuck" title="Minimise">–</button>' +
                '<button type="button" data-w="max" title="Maximise">▢</button>' +
                '<button type="button" class="x" data-w="close" title="Close to the tray">✕</button></div>' +
              '<div class="led" data-bg="transparent" data-off="rgba(255,255,255,0.10)" hidden></div>' +
            '</header>' +
            '<main class="one-grid">' +
              '<section class="one-panel one-np" data-p="np">' +
                '<div class="one-h">🎶 Now Playing</div>' +
                '<div class="one-np-in">' +
                  '<div class="np"><img class="art" alt="" hidden><div class="np-text">' +
                    '<div class="np-main ell">&nbsp;</div><div class="np-sub ell dim"></div>' +
                    '<div class="prog" hidden><b><i></i></b><span></span></div></div></div>' +
                  '<div class="controls">' +
                    '<button class="play" type="button" title="Play"><svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg></button>' +
                    '<input class="vol" type="range" min="0" max="1" step="0.02" title="Volume" aria-label="Volume">' +
                    '<span class="vote" hidden><button type="button" data-v="like" title="I like this one">👍</button><button type="button" data-v="dislike" title="Not for me">👎</button></span>' +
                    '<button type="button" class="skipb" title="Vote to skip this song (more than half of the listeners skips it)" hidden>⏭</button>' +
                  '</div>' +
                  '<div class="skipbar" hidden><span class="sk-t"></span><b><i></i></b></div>' +
                  '<div class="extra"></div>' +
                  '<nav class="one-acts"></nav>' +
                '</div>' +
                '<div class="one-slot" data-slot="playlist"></div>' +
                '<div class="one-slot one-under" data-slot="under" hidden></div>' +
              '</section>' +
              '<section class="one-panel one-mid" data-p="mid">' + PARTS.map(p => '<div class="one-slot" data-slot="' + p + '" style="grid-area: ' + p + '"></div>').join('') + '</section>' +
              '<section class="one-panel one-tv" data-p="tv"><div class="one-slot" data-slot="tv"></div></section>' +
              '<section class="one-panel" data-p="chat"><div class="one-slot" data-slot="chat"></div></section>' +
              '<div class="one-empty" hidden>👀 Everything is hidden. Pick a tab above to bring something back.</div>' +
            '</main>' +
            '<div class="one-pick" hidden></div>' +
            '<div class="one-fly" hidden><div class="one-fly-card"><button type="button" class="one-fly-x" title="Close (Esc)">✕ Close</button><div class="one-slot" data-slot="fly"></div></div></div>' +
            '</div>';

        /** A part, in its frame (made the first time it is wanted). */
        function frame(id, slot) {
            if (frames[id]) {
                // A part moving between the middle and under Now Playing starts again in its new place.
                if (!slot || slot === 'fly' || frames[id].parentNode === $('[data-slot="' + slot + '"]')) return frames[id];
                drop(id);
            }
            const f = document.createElement('iframe');
            f.className = 'one-frame';
            f.dataset.id = id;
            f.src = 'win.html?w=' + id + '&panel=1';
            f.setAttribute('allow', 'autoplay; fullscreen; microphone');
            f.addEventListener('load', () => {
                f.dataset.ready = '1';
                // Esc closes what's open over the page, from inside it too (once its own dialog is closed).
                if (slot === 'fly') f.contentWindow.addEventListener('keydown', (e) => {
                    const sh = f.contentDocument.querySelector('.sheet');
                    if (e.key === 'Escape' && fly === id && (!sh || sh.hidden)) closeFly();
                });
            });
            $('[data-slot="' + (slot || id) + '"]').appendChild(f);
            return (frames[id] = f);
        }
        /** The video and blug.dj/jej leave when they are hidden (the video gives the radio back; you leave the room). */
        function drop(id) { const f = frames[id]; if (f) { f.remove(); delete frames[id]; } }

        /* ---------- the panels, laid out like the site ---------- */
        function layout() {
            const g = $('.one-grid');
            const np = show.np, mid = !!show.mid, tv = show.tv, chat = show.chat, side = tv || chat;
            for (const p of PANELS) $('[data-p="' + p + '"]', g).hidden = !(p === 'mid' ? mid : show[p]);
            $('.one-empty').hidden = np || mid || side;
            // Under Now Playing: the playlist, or one of the middle's parts.
            const under = np && show.under;
            if (np && !under) frame('playlist');
            if (frames.playlist) frames.playlist.hidden = !!under;
            $('[data-slot="playlist"]').hidden = !!under;
            $('[data-slot="under"]').hidden = !under;
            document.body.classList.toggle('one-under-on', !!under);
            if (chat) frame('chat');
            if (tv) frame('tv'); else drop('tv');
            // The middle: its parts in their arrangement. The board and the Interface keep their place
            // (and drafts) while they're away; blug.dj/jej is left.
            const inMid = partsOf(show.mid), m = $('[data-p="mid"]', g), a = ARR[show.mid];
            for (const p of PARTS) {
                const on = inMid.includes(p), below = under === p;
                if (on) frame(p, p); else if (below) frame(p, 'under'); else if (p === 'hall') drop('hall');
                if (frames[p]) frames[p].hidden = !(on || below);
                $('[data-slot="' + p + '"]').hidden = !on;
            }
            if (a) { m.style.gridTemplateColumns = a.cols; m.style.gridTemplateRows = a.rows; m.style.gridTemplateAreas = a.areas; }
            // Columns: Now Playing, the middle, and the video over the chat. Whatever is missing, the rest share.
            const cols = [], r1 = [], r2 = [];
            const add = (w, a, b) => { cols.push(w); r1.push(a); r2.push(b); };
            if (np) add('var(--np-w)', 'np', 'np');
            if (mid) add('minmax(0, 1fr)', 'mid', 'mid');
            if (side) add(mid ? 'var(--side-w)' : 'minmax(0, 1fr)', tv ? 'tv' : 'chat', chat ? 'chat' : 'tv');
            if (!mid && !side && np) cols[0] = 'minmax(0, var(--np-max))';
            const two = tv && chat;
            g.style.gridTemplateColumns = cols.join(' ') || '1fr';
            g.style.gridTemplateAreas = !cols.length ? 'none' : two ? '"' + r1.join(' ') + '" "' + r2.join(' ') + '"' : '"' + r1.join(' ') + '"';
            g.style.gridTemplateRows = two ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)';
            g.classList.toggle('np-only', np && !mid && !side);
            sizeTv();
            tabs();
            moved();
        }
        // The video keeps to 16:9 (plus its heading) when it sits over the chat.
        const tvBox = () => $('[data-p="tv"]');
        function sizeTv() {
            const p = tvBox();
            p.style.height = show.tv && show.chat ? Math.round(p.clientWidth * 9 / 16 + 31) + 'px' : '';
        }
        /** Tell the board where its panel went (its view is laid over the window, not drawn in the page). */
        function moved() {
            // Only once its page is in: touching a frame's window before that keeps the app's bridge out of it.
            requestAnimationFrame(() => { const f = frames.board; if (f && f.dataset.ready) f.contentWindow.dispatchEvent(new Event('panel-moved')); });
        }
        window.addEventListener('resize', moved);
        function save() { app.setUi({ full: { np: show.np, chat: show.chat, mid: show.mid, under: show.under, arr: pref } }); }

        /** The middle with these parts: in the arrangement last picked for them, or the first that fits. */
        function setMid(parts) {
            const k = setKey(parts.filter(p => p !== show.under));
            zoomedFrom = null;
            show.mid = !k ? '' : ARR[pref[k]] && setKey(partsOf(pref[k])) === k ? pref[k] : Object.keys(ARR).find(a => setKey(partsOf(a)) === k);
            layout(); save();
        }
        /** ⤢ on a part: it fills the middle; again, and the middle is as it was. */
        function zoom(id) {
            if (zoomedFrom && show.mid === id) { show.mid = zoomedFrom.mid; show.under = zoomedFrom.under; zoomedFrom = null; }
            else {
                const was = { mid: show.mid, under: show.under };
                show.mid = id;
                if (show.under === id) show.under = '';
                zoomedFrom = was.mid !== id || was.under !== show.under ? was : null;
            }
            layout(); save();
        }
        /** Under Now Playing: a part ('' = the playlist). The one that was there goes back to the middle. */
        function setUnder(p) {
            const back = show.under, parts = partsOf(show.mid).filter(x => x !== p);
            if (back && back !== p && !parts.includes(back)) parts.push(back);
            show.under = p;
            if (p) show.np = true;
            setMid(parts);
        }

        /* ---------- ▦ the middle's arrangements, drawn small ---------- */
        const SHORT = { board: '[s4s]', interface: 'Interface', hall: 'blug.dj' };
        function offered() { const have = tabIds(); return Object.keys(ARR).filter(a => partsOf(a).every(p => have.has(p) && p !== show.under)); }
        function drawPick() {
            const box = $('.one-pick');
            const name = (p) => p === 'board' ? (s.extras && s.extras.board && s.extras.board.title) || SHORT.board : SHORT[p];
            const have = tabIds();
            box.innerHTML = '<div class="one-pick-h">Under Now Playing</div><div class="seg one-under-pick">' +
                ['', ...PARTS].filter(p => !p || have.has(p)).map(p => '<button type="button" class="btn' + (show.under === p ? ' on' : '') + '" data-under="' + p + '">' + esc(p ? name(p) : 'Playlist') + '</button>').join('') + '</div>' +
                '<div class="one-pick-h">Arrange the middle</div><div class="one-pick-list">' + offered().map(a =>
                '<button type="button" class="one-arr' + (a === show.mid ? ' on' : '') + '" data-arr="' + esc(a) + '" title="' + esc(partsOf(a).map(name).join(' + ')) + '">' +
                '<span class="one-mini" style="grid-template-columns: ' + ARR[a].cols.replace(/minmax\((\d+)px, (\d+%)\)/g, '$2') + '; grid-template-rows: ' + ARR[a].rows + '; grid-template-areas: ' + esc(ARR[a].areas) + '">' +
                partsOf(a).map(p => '<i class="mini-' + p + '" style="grid-area: ' + p + '">' + esc(name(p)) + '</i>').join('') + '</span></button>').join('') +
                '</div><div class="one-pick-foot dim">⤢ on a part fills the middle with it · its tab hides or shows it</div>';
        }
        function pick(on) {
            picking = on;
            if (on) drawPick();
            $('.one-pick').hidden = !on;
            $('.one-win [data-w="pick"]').classList.toggle('on', on);
            moved();                                       // the board's view steps aside while this is over it
        }

        /* ---------- over the page: Request, Albums, Call in, Links, Settings ---------- */
        function openFly(id) {
            if (fly && fly !== id && frames[fly]) frames[fly].hidden = true;
            fly = id;
            const f = frame(id, 'fly');
            f.hidden = false;
            $('.one-fly-card').style.width = 'min(94vw, ' + (FLY[id] || 560) + 'px)';
            $('.one-fly').hidden = false;
            document.body.classList.add('fly-open');
            f.focus();
            tabs(); moved();
        }
        function closeFly() {
            if (!fly) return;
            if (frames[fly]) frames[fly].hidden = true;
            fly = '';
            $('.one-fly').hidden = true;
            document.body.classList.remove('fly-open');
            tabs(); moved();
        }

        /* ---------- what a tab, a button or the tray asks for ---------- */
        function open(id) {
            if (id === 'np' || id === 'playlist' || id === 'banner') { if (!show.np) { show.np = true; layout(); save(); } return; }
            if (id === 'chat') { if (!show.chat) { show.chat = true; layout(); save(); } return; }
            if (PARTS.includes(id)) {
                if (id === 'board') closeFly();                 // the board can't show under anything over the page
                const now = partsOf(show.mid);
                if (show.under === id) { if (!show.np) { show.np = true; layout(); save(); } return; }
                if (!now.includes(id)) setMid(now.concat(id));
                return;
            }
            if (id === 'tv') {
                // Off the air the TV button is the station's channel, in the browser.
                if (!(s.tv && s.tv.live)) { const c = s.extras && s.extras.tv && s.extras.tv.channel; if (c) app.openExternal(c); return; }
                if (!show.tv) { show.tv = true; layout(); }
                return;
            }
            if (FLY[id]) openFly(id);
        }
        function hide(id) {
            if (PARTS.includes(id) && show.under === id) { show.under = ''; layout(); save(); return; }
            if (PARTS.includes(id)) return setMid(partsOf(show.mid).filter(p => p !== id));
            if (id in show) show[id] = false;
            else if (id === fly) return closeFly();
            layout(); save();
        }
        function toggle(id) {
            if (FLY[id]) return fly === id ? closeFly() : openFly(id);
            const on = PARTS.includes(id) ? (partsOf(show.mid).includes(id) || (show.under === id && show.np)) : show[id];
            if (on) hide(id); else open(id);
        }
        // For the parts in their frames: "take me back" hides the panel; ⤢ fills the middle; the board asks if anything covers it.
        window.onairOne = {
            close: (id) => (FLY[id] ? closeFly() : hide(id)),
            zoom, inMiddle: (id) => PARTS.includes(id), zoomed: (id) => !!zoomedFrom && show.mid === id,
            covered: () => !!fly || picking || document.body.classList.contains('tv-full')
        };

        /* ---------- the tabs (the site's top bar) and Now Playing's buttons ---------- */
        const TABS = ['tv', 'np', 'albums', 'board', 'hall', 'chat', 'interface', 'links', 'settings'];
        const ICON = { np: '🎶', hall: '🕺' }, NAME = { np: 'Radio', hall: 'blug.dj/jej' };
        let lastTabs = '';
        function tabIds() {
            const have = new Set(list.map(el => el.id));
            if (have.has('chat')) have.add('hall');
            have.add('np');
            return have;
        }
        function tabs() {
            const have = tabIds();
            const els = TABS.filter(id => have.has(id)).map(id => ELEMENTS.find(e => e.id === id) || { id });
            const label = (el) => NAME[el.id] || (el.id === 'board' && s.extras && s.extras.board && s.extras.board.title) || el.label;
            const key = els.map(el => el.id + ':' + label(el)).join(',');
            const nav = $('.one-tabs');
            if (key !== lastTabs) {
                lastTabs = key;
                nav.innerHTML = els.map(el => '<button type="button" data-el="' + el.id + '" title="' + esc(el.about || label(el)) + '"><span class="e">' + (ICON[el.id] || el.icon) + '</span><span class="l">' + esc(label(el)) + '</span>' +
                    (el.nsfw ? '<span class="nsfw-tag">NSFW</span>' : '') + '</button>').join('');
            }
            for (const b of nav.children) {
                const id = b.dataset.el;
                b.classList.toggle('open', PARTS.includes(id) ? (partsOf(show.mid).includes(id) || (show.under === id && show.np)) : id in show ? !!show[id] : fly === id);
                if (id === 'tv') b.classList.toggle('pulse', !!(s.tv && s.tv.live) && !show.tv);
                if (id === 'chat' && show.chat) b.classList.remove('new');
            }
            // Now Playing's own buttons, as on the site.
            const acts = [['studio', '📞 Call in'], ['request', '🎵 Request'], ['hall', '🕺 blug.dj/jej']].filter(([id]) => have.has(id));
            const ak = acts.map(a => a[0]).join(',');
            const box = $('.one-acts');
            if (box.dataset.k !== ak) { box.dataset.k = ak; box.innerHTML = acts.map(([id, t]) => '<button type="button" class="btn" data-el="' + id + '">' + t + '</button>').join(''); }
        }
        function onClick(e) {
            const b = e.target.closest('button[data-el]');
            if (b) toggle(b.dataset.el);
        }

        function mount() {
            $('.one-tabs').onclick = onClick;
            $('.one-acts').onclick = (e) => { const b = e.target.closest('button[data-el]'); if (b) open(b.dataset.el); };
            $('.one-win').onclick = (e) => {
                const b = e.target.closest('button[data-w]');
                if (!b) return;
                if (b.dataset.w === 'pick') pick(!picking);
                else if (b.dataset.w === 'layout') app.setUi({ layout: 'windows' });
                else app.winCmd(b.dataset.w);
            };
            $('.one-pick').onclick = (e) => {
                const u = e.target.closest('[data-under]');
                if (u) { setUnder(u.dataset.under); drawPick(); return; }
                const b = e.target.closest('[data-arr]');
                if (!b) return;
                const a = b.dataset.arr;
                pref[setKey(partsOf(a))] = a;
                zoomedFrom = null; show.mid = a;
                layout(); save(); pick(false);
            };
            document.addEventListener('mousedown', (e) => { if (picking && !e.target.closest('.one-pick, [data-w="pick"]')) pick(false); });
            window.addEventListener('blur', () => { if (picking) pick(false); });          // a click in a part's frame
            $('.one-fly').onclick = (e) => { if (e.target === $('.one-fly') || e.target.closest('.one-fly-x')) closeFly(); };
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (picking) pick(false); else if (fly) closeFly(); } });
            // The video, full screen: it fills the window (and the window the screen).
            if (app.onPanelFull) app.onPanelFull((id) => { document.body.classList.toggle('tv-full', id === 'tv'); moved(); });
            const paintMax = (w) => { const m = $('.one-win [data-w="max"]'); m.textContent = w && w.max ? '🗗' : '▢'; m.title = w && w.max ? 'Restore' : 'Maximise'; document.body.classList.toggle('maxed', !!(w && w.max)); };
            paintMax(UI.me); app.onWin(paintMax);
            new ResizeObserver(sizeTv).observe(tvBox());
            layout();
        }

        return {
            markup, mount, open, toggle,
            /** The station changed: its name, and which tabs it offers. */
            update(st, available) { s = st; list = available; $('.one-name').textContent = st.name || (UI.info.station && UI.info.station.name) || 'On Air'; tabs(); },
            /** A new chat line while the chat is hidden: a dot on its tab. */
            chatNew() { if (!show.chat) { const b = $('.one-tabs [data-el="chat"]'); if (b) b.classList.add('new'); } }
        };
    };
})();
