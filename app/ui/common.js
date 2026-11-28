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

    /* A chat line's words as HTML: links, :emoji: and the station's picture emotes; /me in italics;
       /roll and /fortune (the station's own) in bold, in their colour. Here, so every window has it:
       the chat window, blug.dj/jej and the one window's panels each have their own LT. */
    if (window.LT) window.LT.lineHtml = (m) => {
        const LT = window.LT;
        const h = LT.chatHtml ? LT.chatHtml(m.text) : esc(m.text);
        if (m.me) return '<i>' + h + '</i>';
        if (m.dice) return '<strong' + (/^#[0-9a-f]{6}$/i.test(m.tint || '') ? ' style="color:' + m.tint + '"' : '') + '>' + h + '</strong>';
        return h;
    };

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

    /** A part of the one window's middle: ⤢ fills the middle with it (and back), ✕ hides it. */
    function midButtons(id) {
        const one = window.parent !== window && window.parent.onairOne;
        if (!one || !one.inMiddle || !one.inMiddle(id)) return '';
        return '<button type="button" data-cmd="zoom" title="Fill the middle with this (again: back as it was)">⤢</button>' +
            '<button type="button" class="x" data-cmd="hide" title="Hide this">✕</button>';
    }

    /** Build the window: a frame with a title bar, a body, and a grip.
        A panel of the one window (opts.panel) gets just its heading: the one window moves and closes it. */
    async function init(opts) {
        me = { id: opts.id };
        const panel = !!opts.panel;
        if (panel) document.body.classList.add('panel');
        document.body.insertAdjacentHTML('afterbegin',
            '<div class="frame"><div class="bar"><span class="ic"></span><span class="t"></span>' +
            (opts.barExtra || '') + (panel ? midButtons(opts.id) + '</div><div class="body"></div></div>' :
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
            if (c === 'zoom') window.parent.onairOne.zoom(opts.id);
            else if (c === 'hide') window.parent.onairOne.close(opts.id);
            else if (c === 'roll') app.setWin({ rolled: !me.rolled });
            else app.winCmd(c);
        });
        // Right-click: the window menu, except in a field, on a link, or over selected text (that gets Copy).
        $('.body').addEventListener('contextmenu', (e) => {
            const sel = getSelection();
            if (e.target.closest('input, textarea, a') || (sel && !sel.isCollapsed && String(sel).trim())) return;
            e.preventDefault(); app.winCmd('menu');
        });
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

    /* ---------- the new-message sound ----------
       The look's own where it has one, made here (no sound files; sound-alikes, not the originals):
       AIM's IM "ba-ding" and ICQ's "uh-oh". Any other look: the station's chime. At most one a
       second and a half, like the chime. Each takes an audio context and a start time. */
    const tone = (c, type, f, at, len, vol) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(g); g.connect(c.destination);
        o.start(at); o.stop(at + len + 0.02);
    };
    /** A voiced syllable: a buzz gliding from f0 to f1, shaped by vowel formants ([frequency, weight]). */
    const syllable = (c, at, f0, f1, len, formants) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + len);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.5, at + 0.025);
        g.gain.setValueAtTime(0.5, at + len * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, at + len);
        o.connect(g);
        for (const [f, w] of formants) {
            const bp = c.createBiquadFilter(), v = c.createGain();
            bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; v.gain.value = w;
            g.connect(bp); bp.connect(v); v.connect(c.destination);
        }
        o.start(at); o.stop(at + len + 0.02);
    };
    const SOUNDS = {
        // AIM: a quick, bright two-note "ba-ding", the second a sixth up, bell-like.
        aim: (c, t) => {
            for (const [f, at, len] of [[659.25, 0, 0.22], [1108.73, 0.08, 0.5]]) { tone(c, 'triangle', f, t + at, len, 0.16); tone(c, 'sine', f * 2, t + at, len * 0.5, 0.04); }
        },
        // ICQ: "uh-oh", two voiced syllables falling about a fourth, with a catch between them.
        icq: (c, t) => {
            syllable(c, t, 310, 290, 0.16, [[700, 1], [1150, 0.55], [2500, 0.15]]);
            syllable(c, t + 0.23, 240, 200, 0.3, [[480, 1], [850, 0.6], [2400, 0.12]]);
        }
    };
    let sndCtx = null, sndAt = 0;
    function chime() {
        const s = SOUNDS[lookNow];
        if (!s) { if (window.LT && LT.chime) LT.chime(); return; }
        const now = Date.now();
        if (now - sndAt < 1500) return;
        sndAt = now;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            sndCtx = sndCtx || new AC();
            if (sndCtx.state === 'suspended') sndCtx.resume();
            s(sndCtx, sndCtx.currentTime + 0.01);
        } catch { /* no sound here */ }
    }

    /* 💖 Donate, as on the site: the station's support links (PayPal, Patreon, Ko-fi…, from its Links)
       behind a pink pill just right of the Links button, and a speech bubble under it. */
    const GIVE = [[/(^|\.)paypal\.(com|me)$/i, 'paypal', '💙 PayPal'], [/(^|\.)patreon\.com$/i, 'patreon', '♥ Patreon'],
        [/(^|\.)ko-fi\.com$/i, 'kofi', '☕ Ko-fi'], [/(^|\.)buymeacoffee\.com$/i, 'kofi', '☕ Buy me a coffee'], [/(^|\.)liberapay\.com$/i, 'kofi', '💛 Liberapay']];
    const giveOf = (u) => { try { const h = new URL(u).hostname; return GIVE.find(g => g[0].test(h)) || null; } catch { return null; } };
    const donate = {
        isGive: (u) => !!giveOf(u),
        /** The station's support links, PayPal first. */
        list(extras) {
            const out = [];
            for (const g of (extras && extras.links) || []) for (const l of g.items || []) { const w = giveOf(l.url); if (w) out.push({ url: l.url, kind: w[1], label: w[2] }); }
            const rank = (k) => (k === 'paypal' ? 0 : k === 'patreon' ? 1 : 2);
            return out.sort((x, y) => rank(x.kind) - rank(y.kind));
        },
        button: () => '<button type="button" class="dn-tab" data-dn title="Support the station" aria-expanded="false"><span class="dn-heart">💖</span><span class="l">Donate</span></button>',
        toggle(btn, list) {
            let m = document.querySelector('body > .dn-menu');
            if (m && m.__for === btn) return donate.close();
            donate.close();
            m = document.createElement('div');
            m.className = 'dn-menu'; m.__for = btn;
            m.innerHTML = '<p>thank u fren (｡♥‿♥｡)</p>' + list.map(g => '<button type="button" class="dn-go dn-' + g.kind + '" data-give="' + esc(g.url) + '" title="' + esc(g.url) + '">' + esc(g.label) + '</button>').join('') + '<p class="dn-foot">keeps the radio on air ✨</p>';
            document.body.appendChild(m);
            btn.setAttribute('aria-expanded', 'true');
            // Under the button with its tail pointing up at it; above it when there's room only there;
            // beside it (the small radio window) when there's room for neither.
            const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
            const below = r.bottom + 10 + h <= innerHeight - 4, above = r.top - 10 - h >= 4;
            if (below || above) {
                const left = Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2));
                m.classList.add(below ? 'down' : 'up');
                m.style.left = left + 'px';
                m.style.top = (below ? r.bottom + 10 : r.top - 10 - h) + 'px';
                m.style.setProperty('--tail', Math.max(14, Math.min(w - 14, r.left + r.width / 2 - left)) + 'px');
            } else {
                const side = r.left - 10 - w >= 4 ? 'left' : 'right';
                const top = Math.max(4, Math.min(innerHeight - h - 4, r.top + r.height / 2 - h / 2));
                m.classList.add('side-' + side);
                m.style.left = (side === 'left' ? r.left - 10 - w : r.right + 10) + 'px';
                m.style.top = top + 'px';
                m.style.setProperty('--tail', Math.max(14, Math.min(h - 14, r.top + r.height / 2 - top)) + 'px');
            }
            m.onclick = (e) => { const b = e.target.closest('[data-give]'); if (b) { app.openExternal(b.dataset.give); donate.close(); } };
        },
        close() {
            const m = document.querySelector('body > .dn-menu');
            if (!m) return;
            if (m.__for) m.__for.setAttribute('aria-expanded', 'false');
            m.remove();
        }
    };
    document.addEventListener('mousedown', (e) => { if (!e.target.closest || !e.target.closest('.dn-menu, [data-dn]')) donate.close(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') donate.close(); });
    window.addEventListener('resize', () => donate.close());

    window.UI = {
        donate,
        $, esc, clock, mmss, init, setTitle, toast, sheet, closeSheet, askName, flash, chime, SOUNDS,
        get info() { return info; }, get me() { return me; }, get skin() { return lookNow || ''; }, holidayOn, holiday,
        onUi: (f) => onUiFns.push(f),
        onLook: (f) => lookFns.push(f)
    };
})();
