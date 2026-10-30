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
})();
