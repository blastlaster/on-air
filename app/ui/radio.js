/* =============================================================
   THE RADIO — the main window. Now playing, play and volume,
   votes, and a button for each of the station's windows:
   press once to open it, again to tuck it away, again to bring
   it back where it was.
   ============================================================= */
(async function () {
    'use strict';
    const app = window.onairApp, core = window.core, { $, esc, mmss } = UI;
    const info = await UI.init({ id: 'radio', title: 'On Air', icon: '' });

    $('.body').innerHTML =
        '<div class="radio"><div class="main">' +
          '<div class="np"><img class="art" alt="" hidden><div class="np-text">' +
            '<div class="live-line"><span class="light"></span><span class="state">Tuning in…</span><span class="count dim"></span></div>' +
            '<div class="np-main ell">&nbsp;</div><div class="np-sub ell dim"></div>' +
            '<div class="prog" hidden><b><i></i></b><span></span></div>' +
          '</div></div>' +
          '<div class="controls">' +
            '<button class="play" type="button" title="Play"><svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg></button>' +
            '<input class="vol" type="range" min="0" max="1" step="0.02" title="Volume" aria-label="Volume">' +
            '<span class="vote" hidden><button type="button" data-v="like" title="I like this one">👍</button><button type="button" data-v="dislike" title="Not for me">👎</button></span>' +
            '<button type="button" class="skipb" title="Vote to skip this song (more than half of the listeners skips it)" hidden>⏭</button>' +
          '</div>' +
          '<div class="skipbar" hidden><span class="sk-t"></span><b><i></i></b></div>' +
          '<div class="extra"></div>' +
        '</div><nav class="side"></nav></div>' +
        '<div class="led" data-bg="transparent" data-off="rgba(255,255,255,0.10)" hidden></div>';

    /* ---------- now playing ---------- */
    const art = $('.art'), vol = $('.vol');
    art.addEventListener('error', () => { art.hidden = true; });
    vol.value = core.state.volume == null ? 0.8 : core.state.volume;
    vol.oninput = () => core.setVolume(vol.value);
    $('.play').onclick = () => core.toggle();
    $('.skipb').onclick = () => core.skipVote();
    $('.vote').onclick = async (e) => {
        const b = e.target.closest('button');
        if (!b || $('.vote').classList.contains('done')) return;
        const r = await core.vote(b.dataset.v);
        if (r.done) $('.vote').classList.add('done');
    };

    /** A song title too long for the radio scrolls by, marquee-style; one that fits sits still. */
    function marquee(el, text) {
        if (el.dataset.text === text && el.dataset.w === String(el.clientWidth)) return;
        el.dataset.text = text; el.dataset.w = String(el.clientWidth);
        el.classList.remove('mq-on');
        el.textContent = text;
        if (el.scrollWidth <= el.clientWidth + 1) return;
        const one = '<span>' + esc(text) + '</span><span class="mq-gap">•</span>';
        el.innerHTML = '<span class="mq">' + one + one + '</span>';
        el.firstChild.style.animationDuration = Math.max(6, el.firstChild.scrollWidth / 2 / 40) + 's';     // about 40 pixels a second
        el.classList.add('mq-on');
    }
    new ResizeObserver(() => marquee($('.np-main'), $('.np-main').dataset.text || ' ')).observe($('.np-main'));

    let sign = null, s = core.state;
    function paint(st) {
        s = st;
        UI.setTitle(st.name || (info.station && info.station.name) || 'On Air');
        const light = $('.light');
        light.className = 'light' + (st.onAir ? ' live' : '');
        light.style.background = st.onAir ? st.accent : st.autoAccent;
        light.style.color = light.style.background;
        $('.state').textContent = st.onAir ? 'Live' + (st.who ? ' with ' + st.who : '') : (st.ready ? 'AutoDJ' : 'Tuning in…');
        $('.count').textContent = st.listeners == null ? '' : st.listeners + ' listening';
        marquee($('.np-main'), st.main || ' ');
        const t = st.track;
        $('.np-sub').textContent = (st.sub || '') + (t && t.requestedBy ? ' · requested by ' + t.requestedBy + (t.note ? ' (“' + t.note + '”)' : '') : '');
        $('.np-main').title = st.main || ''; $('.np-sub').title = $('.np-sub').textContent;
        if (st.img) { if (art.getAttribute('src') !== st.img) art.src = st.img; art.hidden = false; } else art.hidden = true;
        const playing = st.playing || (st.album && st.album.playing);
        $('.play').innerHTML = playing ? '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>';
        $('.play').title = playing ? 'Pause' : 'Play';
        // Votes, for AutoDJ songs from the station's library
        const vote = $('.vote'), id = st.canVote ? String(t.id) : '';
        vote.hidden = !id;
        if (id && vote.dataset.id !== id) { vote.dataset.id = id; vote.classList.toggle('done', core.hasVoted(id)); }
        // A vote to skip: the ⏭ button, and under the volume how close it is (for everyone listening)
        const sk = st.skip;
        $('.skipb').hidden = !sk || sk.skipped;
        $('.skipb').classList.toggle('done', !!(sk && sk.mine));
        $('.skipbar').hidden = !sk || (!sk.votes && !sk.skipped);
        if (sk && (sk.votes || sk.skipped)) {
            $('.sk-t').textContent = sk.skipped ? '⏭ Skipped by vote' : '⏭ Skip vote: ' + sk.votes + ' of ' + sk.needed;
            $('.skipbar').title = sk.skipped ? 'Listeners voted this song off.' : sk.votes + ' of the ' + sk.needed + ' votes needed to skip this song (more than half of the ' + sk.listeners + ' listening).' + (sk.mine ? ' You voted.' : ' Press ⏭ to join.');
            $('.skipbar i').style.width = Math.min(100, Math.round((sk.skipped ? 1 : sk.votes / Math.max(1, sk.needed)) * 100)) + '%';
        }
        // An album playing, a call in progress
        const ex = [];
        if (st.album) ex.push('<div class="line album">📀 <span class="grow ell" title="' + esc(st.album.title) + '">' + esc(st.album.track || st.album.title) + '</span>' +
            '<button type="button" data-a="prev" title="Previous">⏮</button><button type="button" data-a="toggle" title="Play / pause">' + (st.album.playing ? '⏸' : '▶') + '</button>' +
            '<button type="button" data-a="next" title="Next">⏭</button><button type="button" data-a="close" title="Stop the album">✕</button></div>');
        if (st.call) ex.push('<div class="line call">📞 <span class="grow ell">' + esc(st.call.text || 'On the line') + '</span>' +
            '<button type="button" data-c="mute">' + (st.call.muted ? 'Unmute' : 'Mute') + '</button><button type="button" data-c="hang">Hang up</button></div>');
        $('.extra').innerHTML = ex.join('');
        // The LED sign
        const want = !!(info.ui.bannerInRadio && st.banner && st.banner.on && !(elState.banner === 'open'));
        if (want && !sign && LT.LedBanner) sign = LT.LedBanner($('.led'));
        if (sign) sign.set(want ? st.banner : { on: false, items: [] });
        tick();
        buttons();
    }
    $('.extra').onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const a = b.dataset.a, c = b.dataset.c;
        if (a === 'prev') core.album.go(core.album.info().i - 1);
        else if (a === 'next') core.album.go(core.album.info().i + 1);
        else if (a === 'toggle') core.album.toggle();
        else if (a === 'close') core.album.close();
        else if (c === 'mute') core.mute();
        else if (c === 'hang') core.endCall('You hung up.');
    };

    // How far into the song (AutoDJ's songs carry a start time and a length).
    function tick() {
        const t = s.track, box = $('.prog');
        if (!t || !t.at || !(t.length > 0) || s.live) { box.hidden = true; return; }
        const len = t.length, at = Math.max(0, Math.min(len, core.now() - t.at));
        box.hidden = false;
        box.querySelector('i').style.width = (at / len * 100).toFixed(1) + '%';
        box.querySelector('span').textContent = mmss(at / 1000) + ' / ' + mmss(len / 1000);
        if (core.now() - t.at > len + 4000 && !s.engineUp) core.pollNow();
    }
    setInterval(() => { if (!document.hidden) tick(); }, 1000);

    /* ---------- the station's windows ---------- */
    const wins = {};                    // id → the Window we opened
    let elState = {};                   // id → 'open' | 'tucked'
    const available = (el) => {
        if (info.ui.off.includes(el.id) && !el.always) return false;
        if (el.secret && !info.ui.ifaceOn) return false;
        if (el.hidden) return false;                     // opened from another window (the Hall: from Chat)
        const x = s.extras || {};
        switch (el.needs) {
            case 'requests': return !!s.requestMode;
            case 'albums': return !!(x.albums && (x.albums.items || []).length);
            case 'board': return !!(x.board && x.board.url);
            case 'tv': return !!(s.tv && s.tv.live) || !!(x.tv && x.tv.channel);
            case 'links': return !!(x.links && x.links.length);
            default: return true;
        }
    };
    let lastButtons = '', lastFit = '';
    function buttons() {
        const list = ELEMENTS.filter(available);
        const label = (el) => (el.id === 'board' && s.extras && s.extras.board && s.extras.board.title) || el.label;
        const key = list.map(el => el.id + ':' + label(el)).join(',');
        if (key !== lastButtons) {
            lastButtons = key;
            $('.side').innerHTML = list.map(el => '<button type="button" data-el="' + el.id + '" title="' + esc(el.about) + '"><span class="e">' + el.icon + '</span><span class="l">' + esc(label(el)) + '</span></button>').join('');
        }
        if (key !== lastFit) { lastFit = key; requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); }      // re-measure for the new set
        for (const b of $('.side').children) {
            const id = b.dataset.el;
            b.classList.toggle('open', elState[id] === 'open');
            b.classList.toggle('tucked', elState[id] === 'tucked');
            if (id === 'tv') b.classList.toggle('pulse', !!(s.tv && s.tv.live) && !elState.tv);
            if (elState[id] === 'open' && id === 'chat') b.classList.remove('new');
        }
    }
    $('.side').onclick = (e) => { const b = e.target.closest('button[data-el]'); if (b) toggle(b.dataset.el); };

    function open(id) {
        const w = wins[id];
        if (w && !w.closed) { app.element(id, true); return; }
        // Off the air the TV button is the station's channel, in the browser.
        if (id === 'tv' && !(s.tv && s.tv.live)) { const c = s.extras && s.extras.tv && s.extras.tv.channel; if (c) app.openExternal(c); return; }
        wins[id] = window.open('win.html?w=' + id, 'el-' + id);
    }
    function toggle(id) {
        const w = wins[id];
        if (!w || w.closed) return open(id);
        app.element(id, elState[id] !== 'open');
    }
    app.onElements((st) => { elState = st || {}; buttons(); if (sign || elState.banner) paint(s); });
    app.onOpenElement((id) => open(id));

    // New chat while the chat window is away: a dot on its button.
    core.on('chat', (c) => { if (c.add && elState.chat !== 'open') { const b = $('.side [data-el="chat"]'); if (b) b.classList.add('new'); } });
    core.on('toast', (m) => UI.toast(m));
    core.on('state', paint);
    app.onTogglePlay(() => core.toggle());
    app.onPlay(() => { if (!core.state.playing) core.play(); });
    UI.onUi((i) => { document.body.classList.toggle('side-left', i.ui.side === 'left'); lastButtons = ''; paint(s); });
    document.body.classList.toggle('side-left', info.ui.side === 'left');

    // Type "interface" on the radio: the Interface button appears (type it again to hide it).
    let typed = '';
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1 || /input|textarea/i.test(e.target.tagName)) return;
        typed = (typed + e.key.toLowerCase()).slice(-9);
        if (typed !== 'interface') return;
        typed = '';
        const on = !info.ui.ifaceOn;
        app.setUi({ ifaceOn: on });
        UI.toast(on ? '🟩 Interface unlocked' : 'Interface hidden');
        if (on) setTimeout(() => open('interface'), 300);
    });

    // Small radios drop the button labels, short ones shrink the cover.
    const BTN_MIN = 24;
    const fit = () => {
        document.body.classList.toggle('narrow', window.innerWidth < 330);
        document.body.classList.toggle('short', window.innerHeight < 210);
        // As many buttons to a column as the radio is tall; the rest start a new column.
        const side = $('.side'), n = side.children.length;
        if (!n) return;
        // Columns shared out evenly (10 buttons in two columns = 5 and 5); the buttons
        // stretch to the full height, so the last row meets the sign with the same gap as everywhere.
        // A button's own height in this look (thick borders and big fonts make them taller than BTN_MIN).
        const probe = side.children[0].cloneNode(true);
        probe.style.cssText = 'position:absolute;visibility:hidden;height:auto;';
        side.appendChild(probe);
        const btn = Math.max(BTN_MIN, Math.ceil(probe.getBoundingClientRect().height));
        probe.remove();
        const per = Math.max(1, Math.floor((side.clientHeight + 4) / (btn + 4)));
        const cols = Math.ceil(n / Math.min(per, n));
        const rows = 'repeat(' + Math.ceil(n / cols) + ', minmax(' + btn + 'px, 1fr))';
        if (side.style.gridTemplateRows !== rows) side.style.gridTemplateRows = rows;
    };
    window.addEventListener('resize', fit); fit();
    // …and again whenever the room changes: the sign coming and going, the look's font arriving, a new look.
    new ResizeObserver(() => fit()).observe($('.radio'));
    if (document.fonts) document.fonts.ready.then(fit);
    UI.onLook(() => requestAnimationFrame(fit));

    paint(core.state);
    // The windows that were open last time, back where they were.
    setTimeout(() => {
        for (const [id, w] of Object.entries(info.windows || {})) {
            const el = ELEMENTS.find(x => x.id === id);
            if (w.open && el && (el.always || !info.ui.off.includes(id)) && id !== 'tv') open(id);
        }
    }, 400);
})();
