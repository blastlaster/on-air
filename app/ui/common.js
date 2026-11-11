/* =============================================================
   COMMON — what every window has: its title bar (drag it; ≡ for
   its menu, ▴ to roll it up, – to tuck it into the radio, ✕ to
   close), the grip that resizes it, its look and text size, a
   toast, and one dialog.
   ============================================================= */
(function () {
    'use strict';
    const app = window.onairApp;
    const $ = (s, r) => (r || document).querySelector(s);
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const clock = (ts) => { const d = new Date(ts), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' am' : ' pm'); };
    const mmss = (sec) => { sec = Math.max(0, Math.floor(sec || 0)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };

    let info = null, me = { id: '' }, onUiFns = [];

    /* Holiday looks: like the board, the app dresses up on the day — unless
       holidays are switched off (Settings), or you picked a look that day. */
    const HOLIDAYS = { '01-01': 'newyear', '02-14': 'valentine', '03-17': 'paddy', '04-01': 's4sday', '10-01': 'bday', '10-31': 'spooky', '12-24': 'crimbus', '12-25': 'crimbus' };
    function holiday() {
        const d = new Date(), md = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const skin = HOLIDAYS[md];
        if (!skin || !(window.LOOKS && window.LOOKS.skins || []).some(s => s.id === skin)) return null;
        return { skin, day: d.getFullYear() + '-' + md, name: (window.LOOKS.skins.find(s => s.id === skin) || {}).name || skin };
    }
    /** Today's holiday look, if the app is wearing it. */
    function holidayOn() {
        const h = holiday(), ui = info && info.ui;
        return h && ui && ui.holidays !== false && ui.holidaySkip !== h.day ? h : null;
    }

    function applyLook() {
        if (!info) return;
        const ui = info.ui, b = document.body, h = holidayOn();
        const skin = me.skin !== undefined && me.skin !== null ? me.skin : h ? h.skin : ui.skin;
        b.className = b.className.split(/\s+/).filter(c => c && !/^(skin-|skinned$|font-|fx-|rolled$)/.test(c)).join(' ');
        if (skin) b.classList.add('skinned', 'skin-' + skin);
        const font = me.font || ui.font || 'normal';
        if (font !== 'normal') b.classList.add('font-' + font);
        if (ui.fx === 'mid') b.classList.add('fx-mid');
        if (ui.fx === 'advanced') b.classList.add('fx-mid', 'fx-adv');
        if (me.rolled) b.classList.add('rolled');
        const roll = $('.bar [data-cmd="roll"]');
        if (roll) { roll.textContent = me.rolled ? '▾' : '▴'; roll.title = me.rolled ? 'Unroll' : 'Roll up to the title bar'; }
        if (skin !== lookNow) { lookNow = skin; lookFns.forEach(f => f(skin)); }
    }
    let lookNow, lookFns = [];

    /** Build the window: a frame with a title bar, a body, and a grip.
        A panel of the one window (opts.panel) gets just its heading: the one window moves and closes it. */
    async function init(opts) {
        me = { id: opts.id };
        const panel = !!opts.panel;
        if (panel) document.body.classList.add('panel');
        document.body.insertAdjacentHTML('afterbegin',
            '<div class="frame"><div class="bar"><span class="ic"></span><span class="t"></span>' +
            (opts.barExtra || '') + (panel ? '</div><div class="body"></div></div>' :
            '<button type="button" data-cmd="menu" title="Window options (or right-click the title)">≡</button>' +
            (opts.id === 'radio' ? '' : '<button type="button" data-cmd="roll" title="Roll up to the title bar">▴</button>') +
            '<button type="button" data-cmd="tuck" title="' + (opts.id === 'radio' ? 'Minimise' : 'Tuck into the radio') + '">–</button>' +
            '<button type="button" class="x" data-cmd="close" title="' + (opts.id === 'radio' ? 'Close to the tray' : 'Close') + '">✕</button>' +
            '</div><div class="body"></div><div class="grip" title="Drag to resize"></div></div>') +
            '<div class="sheet" hidden><div class="sheet-card"></div></div><div class="toast" role="status"></div>');
        setTitle(opts.title, opts.icon);
        $('.bar').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-cmd]');
            if (!b) return;
            const c = b.dataset.cmd;
            if (c === 'roll') app.setWin({ rolled: !me.rolled });
            else app.winCmd(c);
        });
        $('.body').addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea, a')) { e.preventDefault(); app.winCmd('menu'); } });
        if (!panel) grip($('.grip'));
        $('.sheet').addEventListener('click', (e) => { if (e.target === $('.sheet') || e.target.hasAttribute('data-close')) closeSheet(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('.sheet').hidden) closeSheet(); });

        info = await app.ui();
        me = info.win || me;
        applyLook();
        app.onUi((u) => { info = { ...info, ...u }; applyLook(); onUiFns.forEach(f => f(info)); });
        app.onWin((w) => { me = w; applyLook(); });
        setInterval(applyLook, 60e3);       // midnight brings the holiday (and takes it away)
        const h = holidayOn();
        if (opts.id === 'radio' && h && info.ui.holidayTold !== h.day) {
            setTimeout(() => toast('Dressed up for the day: ' + h.name + '. Settings → Look to change it.'), 2500);
            app.setUi({ holidayTold: h.day });
        }
        return info;
    }
    function setTitle(text, icon) {
        $('.bar .t').textContent = text || '';
        if (icon !== undefined) $('.bar .ic').textContent = icon || '';
        document.title = text || 'On Air';
    }

    /** Transparent windows have no edges to drag: this corner resizes them. */
    function grip(el) {
        let start = null, raf = 0, want = null;
        el.addEventListener('pointerdown', (e) => {
            el.setPointerCapture(e.pointerId);
            start = { x: e.screenX, y: e.screenY, w: window.outerWidth, h: window.outerHeight };
            e.preventDefault();
        });
        el.addEventListener('pointermove', (e) => {
            if (!start) return;
            want = { w: start.w + e.screenX - start.x, h: start.h + e.screenY - start.y };
            if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (want) app.winCmd('resize', want); });
        });
        const end = () => { start = null; };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
    }

    let toastT = 0;
    function toast(msg) {
        const t = $('.toast');
        if (!t || !msg) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastT);
        toastT = setTimeout(() => t.classList.remove('show'), 3800);
    }

    let onSheetClose = null;
    function sheet(html, onSubmit, onClose) {
        const card = $('.sheet-card');
        card.innerHTML = html;
        $('.sheet').hidden = false;
        onSheetClose = onClose || null;
        const f = card.querySelector('form'), first = card.querySelector('input:not([type=checkbox]),textarea');
        if (first) first.focus();
        if (f) f.onsubmit = (e) => { e.preventDefault(); onSubmit && onSubmit(f); };
        return card;
    }
    function closeSheet() {
        if (onSheetClose) { const f = onSheetClose; onSheetClose = null; f(); }
        $('.sheet').hidden = true; $('.sheet-card').innerHTML = '';
    }

    /** Ask for a name once (the station shows it in chat and on calls). */
    function askName(core, then) {
        sheet('<form><h2>What should we call you?</h2><input name="n" maxlength="32" value="' + esc(core.name) + '" required>' +
            '<div class="row"><button class="btn go">OK</button><button type="button" class="btn" data-close>Cancel</button></div></form>',
            (f) => { if (core.setName(f.n.value)) { closeSheet(); if (then) then(); } });
    }

    /** Flash the title bar, once in a while, when something happens out of sight. */
    function flash() {
        const b = $('.bar');
        if (!b || (document.hasFocus() && !me.rolled)) return;
        b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
    }

    window.UI = {
        $, esc, clock, mmss, init, setTitle, toast, sheet, closeSheet, askName, flash,
        get info() { return info; }, get me() { return me; }, get skin() { return lookNow || ''; }, holidayOn, holiday,
        onUi: (f) => onUiFns.push(f),
        onLook: (f) => lookFns.push(f)
    };
})();
