/* =============================================================
   RTC CLIENT — one person's line to the studio.
   Used by callers and co-hosts on the listener page and by DJs
   on the remote console. Written in plain ES5 so it runs on the
   oldest phone that has WebRTC at all.

   The mic goes up; the show (minus your own voice) comes back
   down with no broadcast delay, so there is never a reason to
   have the stream playing while you are on the line.
   ============================================================= */
(function () {
    'use strict';

    var LT = window.LT = window.LT || {};
    var ICE = LT.ICE || [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];

    LT.callSupported = function () {
        return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext !== false);
    };

    /**
     * opts.send(obj)   — sends a message on the page's engine socket
     * opts.hifi        — music-grade audio (no voice processing, stereo)
     * opts.deviceId    — optional input device
     */
    function Call(opts) {
        this.opts = opts;
        this.pc = null;
        this.stream = null;
        this.audio = null;
        this.muted = false;
        this.analyser = null;
        this.token = '';          // lets a dropped connection pick the call back up
        this.away = false;
        this.wake = null;
    }

    LT.isIOS = function () {
        return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    };
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    Call.prototype.getMic = function () {
        var hifi = !!this.opts.hifi;
        var c = {
            echoCancellation: !hifi, noiseSuppression: !hifi, autoGainControl: !hifi,
            channelCount: hifi ? 2 : 1
        };
        if (this.opts.deviceId) c.deviceId = { exact: this.opts.deviceId };
        var self = this;
        return navigator.mediaDevices.getUserMedia({ audio: c }).then(function (s) {
            self.stream = s;
            self.meterSetup();
            self.watch();
            return s;
        });
    };

    /**
     * Phones pause or take the mic when the page is not in front: iOS
     * mutes it until you come back; a phone call or another app can end
     * it. Say so (the host sees "switched away"), and when the page is
     * back in front, bring the mic back — a fresh one if the old one died.
     */
    Call.prototype.watch = function () {
        var self = this;
        var t = this.stream && this.stream.getAudioTracks()[0];
        if (!t) return;
        t.onmute = function () { self.setAway(true); };
        t.onunmute = function () { self.setAway(document.hidden && touch); };
        t.onended = function () { if (!document.hidden) self.reacquire(); else self.setAway(true); };
        if (!this.visHooked) {
            this.visHooked = true;
            this.onVis = function () {
                if (!self.stream) return;
                var tr = self.stream.getAudioTracks()[0];
                if (document.hidden) { if (touch) self.setAway(true); return; }
                if (!tr || tr.readyState === 'ended') self.reacquire();
                else self.setAway(tr.muted);
                self.keepAwake();
                if (self.ctx && self.ctx.state === 'suspended') self.ctx.resume();
                if (self.audio && self.audio.paused) { var p = self.audio.play(); if (p && p.catch) p.catch(function () {}); }
            };
            document.addEventListener('visibilitychange', this.onVis);
            // pagehide fires on some phones where visibilitychange comes late.
            window.addEventListener('pagehide', function () { if (touch && self.stream) self.setAway(true); });
        }
    };

    Call.prototype.setAway = function (away) {
        away = !!away;
        if (away === this.away) return;
        this.away = away;
        this.opts.send({ t: 'away', away: away });
        // A page being hidden may be frozen before the socket flushes;
        // a beacon is the browser's promise to deliver anyway.
        if (away && this.opts.beaconUrl && this.token && navigator.sendBeacon) {
            try { navigator.sendBeacon(this.opts.beaconUrl, JSON.stringify({ token: this.token, away: true })); } catch (e) {}
        }
        if (this.opts.onAway) this.opts.onAway(away);
    };

    /** A new mic, swapped onto the same call without re-dialling. */
    Call.prototype.reacquire = function () {
        var self = this;
        var old = this.stream;
        if (this.ctx) { try { this.ctx.close(); } catch (e) {} this.ctx = null; }
        return this.getMic().then(function (s) {
            var track = s.getAudioTracks()[0];
            if (track) track.enabled = !self.muted;
            if (self.pc) {
                var sender = self.pc.getSenders().filter(function (x) { return !x.track || x.track.kind === 'audio'; })[0];
                if (sender) sender.replaceTrack(track);
            }
            if (old) old.getTracks().forEach(function (t) { if (t !== track) t.stop(); });
            self.setAway(false);
        }, function () { self.setAway(true); });
    };

    /** Keep the screen on for the length of the call; a locked phone is the commonest way to vanish. */
    Call.prototype.keepAwake = function () {
        var self = this;
        if (!navigator.wakeLock || document.hidden || this.wake) return;
        navigator.wakeLock.request('screen').then(function (w) {
            self.wake = w;
            w.addEventListener('release', function () { self.wake = null; });
        }, function () {});
    };

    /** Call controls on the lock screen / notification, where the phone offers them. */
    Call.prototype.mediaControls = function (onHangup, onToggleMic) {
        if (!('mediaSession' in navigator)) return;
        try { navigator.mediaSession.setActionHandler('hangup', onHangup); } catch (e) {}
        try { navigator.mediaSession.setActionHandler('togglemicrophone', onToggleMic); } catch (e) {}
        try { navigator.mediaSession.setMicrophoneActive(!this.muted); } catch (e) {}
    };

    Call.prototype.meterSetup = function () {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            this.ctx = new Ctx();
            var src = this.ctx.createMediaStreamSource(this.stream);
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 256;
            src.connect(this.analyser);
            this.buf = new Uint8Array(this.analyser.fftSize);
        } catch (e) { this.analyser = null; }
    };

    /** 0..1 input level, for the "they can hear you" ring. */
    Call.prototype.level = function () {
        if (!this.analyser || this.muted) return 0;
        this.analyser.getByteTimeDomainData(this.buf);
        var peak = 0;
        for (var i = 0; i < this.buf.length; i++) {
            var v = Math.abs(this.buf[i] - 128) / 128;
            if (v > peak) peak = v;
        }
        return peak;
    };

    /** Call once the engine has accepted the call. */
    Call.prototype.connect = function () {
        var self = this;
        if (this.pc) return;
        var pc = this.pc = new RTCPeerConnection({ iceServers: ICE });
        this.stream.getTracks().forEach(function (t) { pc.addTrack(t, self.stream); });

        pc.onicecandidate = function (e) {
            if (e.candidate) self.opts.send({ t: 'rtc', data: { ice: e.candidate } });
        };
        pc.ontrack = function (e) {
            if (!self.audio) {
                self.audio = document.createElement('audio');
                self.audio.autoplay = true;
                self.audio.setAttribute('playsinline', '');
                document.body.appendChild(self.audio);
            }
            self.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
            var p = self.audio.play();
            if (p && p.catch) p.catch(function () {});
        };
        pc.onconnectionstatechange = function () {
            if (self.opts.onConnection) self.opts.onConnection(pc.connectionState);
        };

        pc.createOffer({ offerToReceiveAudio: true }).then(function (offer) {
            if (self.opts.hifi && LT.opusHiFi) offer.sdp = LT.opusHiFi(offer.sdp);
            return pc.setLocalDescription(offer);
        }).then(function () {
            self.opts.send({ t: 'rtc', data: { sdp: pc.localDescription } });
        });
    };

    /** The studio lost our audio (a reload): dial it again, same mic. */
    Call.prototype.restart = function () {
        if (this.pc) { try { this.pc.close(); } catch (e) {} }
        this.pc = null;
        if (this.stream) this.connect();
    };

    Call.prototype.onRtc = function (data) {
        var pc = this.pc;
        if (!pc) return;
        if (data.sdp) pc.setRemoteDescription(data.sdp).catch(function () {});
        else if (data.ice) pc.addIceCandidate(data.ice).catch(function () {});
    };

    Call.prototype.setMuted = function (m) {
        this.muted = !!m;
        if (this.stream) this.stream.getAudioTracks().forEach(function (t) { t.enabled = !m; });
        this.opts.send({ t: 'self-mute', muted: this.muted });
        try { navigator.mediaSession.setMicrophoneActive(!this.muted); } catch (e) {}
    };

    Call.prototype.setVolume = function (v) { if (this.audio) this.audio.volume = v; };

    Call.prototype.end = function () {
        if (this.pc) { try { this.pc.close(); } catch (e) {} }
        this.pc = null;
        if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
        this.stream = null;
        if (this.audio) { this.audio.srcObject = null; this.audio.remove(); this.audio = null; }
        if (this.ctx) { try { this.ctx.close(); } catch (e) {} }
        if (this.onVis) document.removeEventListener('visibilitychange', this.onVis);
        if (this.wake) { try { this.wake.release(); } catch (e) {} this.wake = null; }
        if ('mediaSession' in navigator) {
            try { navigator.mediaSession.setActionHandler('hangup', null); } catch (e) {}
            try { navigator.mediaSession.setActionHandler('togglemicrophone', null); } catch (e) {}
        }
    };

    LT.Call = Call;

    /**
     * Pinned-message formatting, shared by the console and the listener page.
     *   **bold**  *italic*  __underline__  ~~strike~~  [words](https://link)
     * Bare https:// links work too; line breaks are kept. Everything is
     * escaped first, so nothing typed can become HTML or script — and only
     * http(s) links are ever made.
     */
    LT.richText = function (raw) {
        var s = String(raw == null ? '' : raw).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
        var links = [];
        function hold(html) { links.push(html); return '\u0000' + (links.length - 1) + '\u0000'; }
        function a(url, label) { return '<a href="' + url + '" target="_blank" rel="noopener nofollow ugc">' + label + '</a>'; }
        s = s.replace(/\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)]{1,300})\)/g, function (m, label, url) { return hold(a(url, label)); });
        s = s.replace(/https?:\/\/[^\s<\u0000]{1,300}/g, function (url) {
            var trail = (url.match(/[.,!?;:]+$/) || [''])[0];
            url = url.slice(0, url.length - trail.length);
            return hold(a(url, url)) + trail;
        });
        s = s.replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '<b>$1</b>')
            .replace(/__(?=\S)([^\n]*?\S)__/g, '<u>$1</u>')
            .replace(/~~(?=\S)([^\n]*?\S)~~/g, '<s>$1</s>')
            .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1<i>$2</i>')
            .replace(/\n/g, '<br>');
        return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return links[+i]; });
    };
    /**
     * Chat text with its web addresses clickable (https://… and www.…), and
     * nothing else: everything is escaped first, so only http(s) links are
     * ever made, and they open in a new tab (in the app: the browser).
     */
    LT.linkText = function (raw) {
        var s = String(raw == null ? '' : raw).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
        return s.replace(/(^|[^\w\/.@-])((?:https?:\/\/|www\.)[^\s<]{2,300})/gi, function (m, pre, url) {
            var trail = (url.match(/[.,!?;:)\]]+$/) || [''])[0];
            url = url.slice(0, url.length - trail.length);
            var href = /^www\./i.test(url) ? 'https://' + url : url;
            return pre + '<a href="' + href + '" target="_blank" rel="noopener nofollow ugc">' + url + '</a>' + trail;
        });
    };
    /** Chat text as HTML: links clickable, and a line starting with > in green (4chan's greentext; >>quotes stay as they are). */
    LT.chatHtml = function (raw) {
        var html = LT.linkText(raw);
        return /^\s*>(?!>)/.test(String(raw || '')) ? '<span style="color:#8cc63f">' + html + '</span>' : html;
    };

    /* :emoji: codes. Typed in any chat box they become the emoji when the
       message is sent (so they show everywhere, the Chattable copy too).
       Only emoji old enough to show on Windows 10. */
    LT.EMOJI = {
        smile: '😄', grin: '😁', joy: '😂', lol: '😂', rofl: '🤣', sweat_smile: '😅', wink: '😉', upside_down: '🙃', zany: '🤪', nerd: '🤓',
        sob: '😭', cry: '😢', sad: '😞', sunglasses: '😎', cool: '😎', thinking: '🤔', think: '🤔', flushed: '😳', angry: '😠', rage: '😡',
        pleading: '🥺', smirk: '😏', eyeroll: '🙄', kiss: '😘', heart_eyes: '😍', party: '🥳', woozy: '🥴', cowboy: '🤠', sleeping: '😴',
        scream: '😱', mindblown: '🤯', shush: '🤫', vomit: '🤮', cold: '🥶', hot: '🥵', money_mouth: '🤑', clown: '🤡', imp: '😈', devil: '😈',
        skull: '💀', ghost: '👻', alien: '👽', robot: '🤖', poop: '💩', eyes: '👀', pray: '🙏', thumbsup: '👍', '+1': '👍', thumbsdown: '👎',
        '-1': '👎', wave: '👋', clap: '👏', raised_hands: '🙌', muscle: '💪', metal: '🤘', v: '✌️', point_right: '👉', ok_hand: '👌', '100': '💯',
        heart: '❤️', broken_heart: '💔', sparkles: '✨', tada: '🎉', notes: '🎶', music: '🎵', zzz: '💤', anger: '💢', question: '❓',
        exclamation: '❗', fire: '🔥', star: '⭐', moai: '🗿', crab: '🦀', frog: '🐸', pepe: '🐸', eggplant: '🍆', peach: '🍑', clover: '🍀',
        seven: '7️⃣', knife: '🔪', fish: '🐟', pizza: '🍕', burger: '🍔', beer: '🍺', coffee: '☕', cake: '🎂', cookie: '🍪', banana: '🍌',
        cat: '🐈', dog: '🐕', pig: '🐖', monkey: '🐒', see_no_evil: '🙈', snake: '🐍', rocket: '🚀', boom: '💥', bomb: '💣', money: '💰',
        gem: '💎', crown: '👑', trophy: '🏆', guitar: '🎸', mic: '🎤', radio: '📻', tv: '📺', computer: '💻', gun: '🔫', hammer: '🔨',
        sword: '🗡️', shield: '🛡️', rose: '🌹', sun: '☀️', moon: '🌙', rainbow: '🌈', snowflake: '❄️', snowman: '⛄', warning: '⚠️',
        check: '✅', x: '❌', salt: '🧂', cap: '🧢', ok: '🆗', dice: '🎲', checkered_flag: '🏁', headphones: '🎧', dancer: '💃', bonk: '🔨'
    };
    LT.emojiCodes = function (text) {
        return String(text || '').replace(/:([a-z0-9_+\-]{1,30}):/gi, function (m, k) { return LT.EMOJI[k.toLowerCase()] || m; });
    };

    /**
     * A chat box's extras: suggestions while typing :fi… (Tab/Enter or click
     * picks one, ↑/↓ move, Esc closes), and Shift+↑ / Shift+↓ through what
     * you've sent before. Call .sent(text) after sending.
     */
    var sentKept = [];
    try { sentKept = JSON.parse(localStorage.getItem('ltl.sent') || '[]') || []; } catch (e) { sentKept = []; }
    LT.chatInput = function (input) {
        if (!input || input._chatInput) return input && input._chatInput;
        var pos = -1, draft = '', box = null, picks = [], sel = 0;
        function close() { if (box) { box.parentNode.removeChild(box); box = null; } picks = []; }
        function query() {
            var at = input.selectionStart == null ? input.value.length : input.selectionStart;
            var m = /(^|\s):([a-z0-9_+\-]{2,30})$/i.exec(input.value.slice(0, at));
            return m ? { q: m[2].toLowerCase(), from: at - m[2].length - 1, to: at } : null;
        }
        function show() {
            var q = query();
            if (!q) return close();
            var keys = Object.keys(LT.EMOJI), seen = {}, list = [];
            keys.filter(function (k) { return k.indexOf(q.q) === 0; }).concat(keys.filter(function (k) { return k.indexOf(q.q) > 0; }))
                .forEach(function (k) { if (list.length < 7 && !seen[LT.EMOJI[k]]) { seen[LT.EMOJI[k]] = 1; list.push(k); } });
            if (!list.length) return close();
            picks = list; sel = 0;
            if (!box) {
                box = document.createElement('div');
                box.style.cssText = 'position:fixed;z-index:3000;background:#1a1626;color:#eee;border:1px solid rgba(255,255,255,.35);border-radius:6px;' +
                    'padding:3px;font:13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.5);display:flex;flex-direction:column;min-width:150px';
                box.addEventListener('mousedown', function (e) {
                    e.preventDefault();
                    var b = e.target.closest('[data-k]');
                    if (b) pick(b.getAttribute('data-k'));
                });
                document.body.appendChild(box);
            }
            paint();
            var r = input.getBoundingClientRect();
            box.style.left = Math.max(4, r.left) + 'px';
            box.style.top = Math.max(4, r.top - box.offsetHeight - 4) + 'px';
        }
        function paint() {
            if (!box) return;
            box.innerHTML = picks.map(function (k, i) {
                return '<div data-k="' + k + '" style="padding:3px 8px;border-radius:4px;cursor:pointer;' + (i === sel ? 'background:rgba(255,255,255,.15)' : '') +
                    '"><span style="font-size:17px">' + LT.EMOJI[k] + '</span> :' + k + ':</div>';
            }).join('');
        }
        function pick(k) {
            var q = query();
            if (!q || !LT.EMOJI[k]) return close();
            var e = LT.EMOJI[k] + ' ';
            input.value = input.value.slice(0, q.from) + e + input.value.slice(q.to);
            var c = q.from + e.length;
            input.setSelectionRange(c, c);
            close();
            input.focus();
        }
        input.addEventListener('input', show);
        input.addEventListener('blur', function () { setTimeout(close, 150); });
        input.addEventListener('keydown', function (e) {
            if (box && picks.length && !e.shiftKey) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { sel = (sel + (e.key === 'ArrowDown' ? 1 : picks.length - 1)) % picks.length; paint(); e.preventDefault(); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { pick(picks[sel]); e.preventDefault(); e.stopPropagation(); return; }
                if (e.key === 'Escape') { close(); e.preventDefault(); e.stopPropagation(); return; }
            }
            if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && sentKept.length) {
                e.preventDefault();
                if (pos === -1) draft = input.value;
                pos = e.key === 'ArrowUp' ? Math.min(sentKept.length - 1, pos + 1) : pos - 1;
                input.value = pos < 0 ? draft : sentKept[sentKept.length - 1 - pos];
                if (pos < 0) pos = -1;
                var end = input.value.length;
                input.setSelectionRange(end, end);
            }
        });
        input._chatInput = {
            sent: function (text) {
                text = String(text || '').trim();
                pos = -1; draft = '';
                if (!text || sentKept[sentKept.length - 1] === text) return;
                sentKept.push(text);
                if (sentKept.length > 50) sentKept.shift();
                try { localStorage.setItem('ltl.sent', JSON.stringify(sentKept)); } catch (e) {}
            }
        };
        return input._chatInput;
    };

    /**
     * The song picker: type part of a song or artist (or an album's name) and
     * choose, or browse the albums. Shared by the listener page, the room on
     * the website and the app's Request window; each place's own classes and
     * colours style it (rq-* rows, and the buttons it names in `go`/`quiet`).
     *   lib    the AutoDJ's library index (engine/library-index.js)
     *   send   function (track, message, ok, again) — makes the request
     *   name   function () → the listener's name; setName(n) keeps a new one
     */
    var fold = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); };
    var PICK_CSS = '.rq-top{display:flex;gap:6px;align-items:center}.rq-top .rq-q{flex:1;min-width:0;margin:0}' +
        '.rq-pics{flex:none;min-height:0!important;padding:4px 10px!important}.rq-pics:not(.on){opacity:.6}' +
        '.rq-pick .rq-count{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.rq-back{min-height:0!important;padding:2px 10px!important}' +
        '.rq-pick .rq-sec{display:block;font-size:.72em;text-transform:uppercase;letter-spacing:.08em;opacity:.7;padding:8px 4px 2px;border:0}' +
        '.rq-pick .rq-item{cursor:pointer}.rq-pick .rq-item.sel{outline:2px solid currentColor;outline-offset:-2px;border-radius:8px}' +
        '.rq-pick .rq-nopic .rq-item{grid-template-columns:minmax(0,1fr) auto auto}.rq-pick .rq-done b{opacity:.6}' +
        '.rq-pick .rq-text b,.rq-pick .rq-text>span{display:block}';
    LT.songPicker = function (box, o) {
        if (!document.getElementById('rqPickCss')) {
            var st = document.createElement('style'); st.id = 'rqPickCss'; st.textContent = PICK_CSS; document.head.appendChild(st);
        }
        var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
        var mmss = function (s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
        var go = o.go || 'act act-go', quiet = o.quiet || 'act act-quiet', lib = o.lib;
        var tracks = lib.tracks.map(function (t) {
            return { id: t[0], title: t[1], artist: t[2], album: t[3], year: t[4], secs: t[5], pic: !!t[6], key: fold(t[1] + ' ' + t[2] + ' ' + t[3]), tkey: fold(t[1]), akey: fold(t[2]) };
        });
        var byAlbum = {};
        tracks.forEach(function (t) { var a = t.album || '(no album)'; (byAlbum[a] = byAlbum[a] || []).push(t); });
        var albumList = Object.keys(byAlbum).sort(function (a, b) { return fold(a) < fold(b) ? -1 : 1; })
            .map(function (a) { return { name: a, key: fold(a), songs: byAlbum[a] }; });
        var pics = false;
        try { pics = localStorage.getItem('ltl.rqPics') === '1'; } catch (e) {}
        var album = null, opts = [], sel = -1, open = -1, done = {};
        box.innerHTML = '<div class="rq rq-pick"><div class="rq-top">' +
            '<input class="rq-q" type="search" maxlength="80" placeholder="Search by title, artist or album…" autocomplete="off" aria-label="Search the station’s music">' +
            '<button type="button" class="' + quiet + ' rq-pics" title="Show cover pictures">🖼</button></div>' +
            '<p class="rq-count hint" aria-live="polite"></p><ul class="rq-list ' + (o.list || '') + '" role="listbox"></ul></div>';
        var input = box.querySelector('.rq-q'), list = box.querySelector('.rq-list'), count = box.querySelector('.rq-count'), picsBtn = box.querySelector('.rq-pics');
        var art = function (t) {
            return pics ? '<span class="rq-art">' + (t && t.pic && lib.img ? '<img class="thumb" loading="lazy" alt="" src="' + esc(lib.img.replace('{id}', t.id)) + '">' : '') + '</span>' : '';
        };
        var songs = function (n) { return n + (n === 1 ? ' song' : ' songs'); };

        // What shows: an album's songs; or, with nothing typed, the albums;
        // otherwise matching songs, and albums only when their name is what was typed.
        function results() {
            if (album) return album.songs.map(function (t) { return { t: t }; });
            var q = fold(input.value);
            if (!q) return albumList.map(function (a) { return { a: a }; });
            var words = q.split(' ');
            var hasAll = function (k) { return words.every(function (w) { return k.indexOf(w) >= 0; }); };
            var score = function (t) {
                return (t.tkey.indexOf(q) === 0 ? 8 : 0) + (t.akey === q ? 6 : t.akey.indexOf(q) === 0 ? 4 : 0) + (t.tkey.indexOf(q) > 0 ? 2 : 0) + (t.akey.indexOf(q) > 0 ? 1 : 0);
            };
            var as = albumList.filter(function (a) { return hasAll(a.key); }).slice(0, 8);
            var all = tracks.filter(function (t) { return hasAll(t.key); }).sort(function (x, y) { return score(y) - score(x); });
            var ss = all.slice(0, 40), out = [];
            if (as.length) out.push({ sec: 'Albums' }), out = out.concat(as.map(function (a) { return { a: a }; }));
            if (ss.length) {
                if (as.length) out.push({ sec: 'Songs' });
                out = out.concat(ss.map(function (t) { return { t: t }; }));
            }
            out.total = all.length; out.shown = ss.length;
            return out;
        }
        function draw() {
            var rows = results(), q = input.value.trim();
            opts = rows.filter(function (r) { return !r.sec; });
            if (sel >= opts.length) sel = opts.length - 1;
            if (album) count.innerHTML = '<button type="button" class="' + quiet + ' rq-back">‹ Back</button><span>📀 ' + esc(album.name) + ' · ' + esc(lib.by || '') + (lib.by ? ' · ' : '') + songs(album.songs.length) + '</span>';
            else if (!q) count.textContent = songs(tracks.length) + ' in ' + albumList.length + ' albums — type to search, or open an album';
            else count.textContent = rows.total > rows.shown ? 'The first ' + rows.shown + ' of ' + rows.total + ' songs for “' + q + '” — type more to narrow it' : songs(rows.total) + ' found for “' + q + '”';
            list.classList.toggle('rq-nopic', !pics);
            var i = -1;
            list.innerHTML = rows.length ? rows.map(function (r) {
                if (r.sec) return '<li class="rq-sec">' + esc(r.sec) + '</li>';
                i++;
                var on = i === sel ? ' sel' : '';
                if (r.a) {
                    return '<li class="rq-item' + on + '" data-i="' + i + '" role="option">' + art(r.a.songs[0]) +
                        '<span class="rq-text grow"><b class="ell">📀 ' + esc(r.a.name) + '</b><span class="dim ell">' + (lib.by ? esc(lib.by) + ' · ' : '') + songs(r.a.songs.length) + '</span></span>' +
                        '<button type="button" class="' + quiet + ' rq-go" tabindex="-1">Open ›</button></li>';
                }
                var t = r.t, asked = done[t.id], sub = [t.artist, album ? '' : t.album].filter(Boolean).join(' · ') + (t.year ? ' (' + t.year + ')' : '');
                return '<li class="rq-item' + on + (asked ? ' rq-done' : '') + (open === t.id ? ' open' : '') + '" data-i="' + i + '" role="option">' + art(t) +
                    '<span class="rq-text grow"><b class="ell">' + esc(t.title) + '</b>' + (sub ? '<span class="dim ell">' + esc(sub) + '</span>' : '') + '</span>' +
                    (t.secs ? '<span class="rq-len dim">' + mmss(t.secs) + '</span>' : '') +
                    '<button type="button" class="' + (asked ? quiet : go) + ' rq-go" tabindex="-1"' + (asked ? ' disabled' : '') + '>' + (asked ? 'Requested ✓' : 'Request') + '</button>' +
                    (open === t.id ? form() : '') + '</li>';
            }).join('') : '<li class="rq-note dim">Nothing by that name. Try fewer letters.</li>';
        }
        function form() {
            return '<form class="rq-form">' +
                '<input name="n" maxlength="30" placeholder="Your name (optional)" value="' + esc(o.name ? o.name() : '') + '">' +
                '<input name="m" maxlength="80" placeholder="A message for the show (optional)">' +
                '<div class="row"><button class="' + go + '">Send request</button><button type="button" class="' + quiet + '" data-cancel>Cancel</button></div></form>';
        }
        function choose(i) {
            var x = opts[i];
            if (!x) return;
            if (x.a) { album = x.a; sel = -1; open = -1; draw(); list.scrollTop = 0; return; }
            if (done[x.t.id]) return;
            open = open === x.t.id ? -1 : x.t.id;
            sel = i;
            draw();
            var f = list.querySelector('.rq-form input');
            if (f) f.focus();
        }
        input.oninput = function () { album = null; sel = input.value.trim() ? 0 : -1; open = -1; draw(); list.scrollTop = 0; };
        input.onkeydown = function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                sel = Math.max(0, Math.min(opts.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
                draw();
                var s = list.querySelector('.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') { e.preventDefault(); if (sel >= 0) choose(sel); }
            else if (e.key === 'Escape' && album) { e.stopPropagation(); album = null; draw(); }
        };
        picsBtn.onclick = function () {
            pics = !pics;
            try { localStorage.setItem('ltl.rqPics', pics ? '1' : '0'); } catch (e) {}
            picsBtn.classList.toggle('on', pics); draw();
        };
        picsBtn.classList.toggle('on', pics);
        box.addEventListener('error', function (e) { if (e.target && e.target.tagName === 'IMG') e.target.parentNode.removeChild(e.target); }, true);
        box.onclick = function (e) {
            if (e.target.closest('.rq-back')) { album = null; draw(); input.focus(); return; }
            if (e.target.closest('[data-cancel]')) { open = -1; draw(); return; }
            if (e.target.closest('.rq-form')) return;
            var li = e.target.closest('.rq-item');
            if (li) choose(+li.getAttribute('data-i'));
        };
        box.onsubmit = function (e) {
            e.preventDefault();
            var f = e.target, t = tracks.filter(function (x) { return x.id === open; })[0];
            if (!t) return;
            if (f.n.value.trim() && o.setName) o.setName(f.n.value.trim().slice(0, 32));
            var btn = f.querySelector('button:not([data-cancel])');
            btn.disabled = true; btn.textContent = 'Sending…';
            o.send(t, f.m.value.trim(), function () {
                done[t.id] = true; open = -1; draw();
                if (o.toast) o.toast('Requested “' + (t.title || 'that one') + '” — AutoDJ will play it soon.');
            }, function (msg) { btn.disabled = false; btn.textContent = 'Send request'; if (o.toast) o.toast(msg); });
        };
        draw();
        setTimeout(function () { try { input.focus(); } catch (er) {} }, 30);
    };
})();
