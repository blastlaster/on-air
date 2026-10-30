/* The live watcher, against pretend versions of a station's website,
   its studio PC and its hosting panel, all on this machine. */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { resolveStation, checkStation, Watcher, panelLive } = require('../watch');

const world = {
    engineUp: true, live: false, since: 0,
    panelRow: { dj_name: ':^)', all_music_id: 12, length: 180000, author: 'SickoCat', title: 'fireballs', metadata: ':^): SickoCat - fireballs' }
};
let site, studio, panel, SITE, STUDIO, PANEL;

function serve(handler) {
    return new Promise((res) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => res(s)); });
}
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

before(async () => {
    studio = await serve((req, res) => {
        if (!world.engineUp) { res.destroy(); return; }
        if (req.url.startsWith('/api/status')) return json(res, 200, {
            live: world.live, dj: world.live ? 'DJ Example' : '', show: world.live ? 'Late Night' : '', since: world.since,
            nowPlaying: world.live ? { artist: '3bard', title: 'Flipper' } : null,
            autodj: { artist: 'SickoCat', title: 'fireballs' }, station: { name: 'Test FM' }
        });
        json(res, 404, {});
    });
    STUDIO = `http://127.0.0.1:${studio.address().port}`;
    panel = await serve((req, res) => {
        if (req.url.startsWith('/api/v2/history/')) return json(res, 200, { results: [world.panelRow] });
        json(res, 404, {});
    });
    PANEL = `http://127.0.0.1:${panel.address().port}/api/v2`;
    site = await serve((req, res) => {
        const u = req.url.split('?')[0];
        if (u === '/onair/station.json') return json(res, 200, { engine: world.engineUp ? STUDIO : '', station: { name: 'Test FM', panel: { api: PANEL, server: 1 } } });
        if (u === '/' || u === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><title>Test FM</title>'); }
        res.writeHead(404); res.end();
    });
    SITE = `http://127.0.0.1:${site.address().port}`;
});
after(() => { site.close(); studio.close(); panel.close(); });

test('a station is found from its page, its onair page, its pointer file or its PC', async () => {
    const a = await resolveStation(SITE + '/');
    assert.equal(a.name, 'Test FM');
    assert.equal(a.pointerUrl, SITE + '/onair/station.json');
    assert.equal(a.pageUrl, SITE + '/');
    const b = await resolveStation(SITE + '/onair/station.json');
    assert.equal(b.pageUrl, SITE + '/onair/index.html');
    const c = await resolveStation(STUDIO);
    assert.equal(c.engineUrl, STUDIO);
    await assert.rejects(resolveStation('http://127.0.0.1:1/'), /No On Air station/);
    await assert.rejects(resolveStation('javascript:alert(1)'), /web address/);
});

test('live comes from the studio when it answers, from the panel when it does not', async () => {
    const st = await resolveStation(SITE + '/');
    world.engineUp = true; world.live = false;
    let s = await checkStation(st);
    assert.equal(s.via, 'studio'); assert.equal(s.live, false); assert.equal(s.song, 'SickoCat — fireballs');

    world.live = true; world.since = 1000;
    s = await checkStation(st);
    assert.deepEqual([s.live, s.dj, s.show, s.song], [true, 'DJ Example', 'Late Night', '3bard — Flipper']);

    // PC off: the panel shows a DJ on the stream (no library id, no length).
    world.engineUp = false;
    world.panelRow = { dj_name: 'DJ Example', all_music_id: 0, length: 0, metadata: 'DJ Example: 3bard - Flipper' };
    s = await checkStation(st);
    assert.deepEqual([s.via, s.live, s.dj, s.song], ['panel', true, 'DJ Example', '3bard - Flipper']);
    // AutoDJ has a "DJ" name too, but a library id and a length: not live.
    assert.equal(panelLive({ dj_name: ':^)', all_music_id: 9, length: 1000 }), '');
});

test('one alert per show: not every check, not after a restart, not when the PC drops mid-show', async () => {
    const st = await resolveStation(SITE + '/');
    const alerts = [];
    let saved = '';
    world.engineUp = true; world.live = false; world.since = 0;
    world.panelRow = { dj_name: ':^)', all_music_id: 12, length: 180000 };
    const w = new Watcher(st, { onLive: (s) => alerts.push(s.dj), remember: (k) => { saved = k; } });
    await w.check();
    assert.equal(alerts.length, 0, 'AutoDJ: no alert');

    world.live = true; world.since = 5000;
    await w.check(); await w.check();
    assert.deepEqual(alerts, ['DJ Example'], 'one alert, however often it looks');

    // The PC drops mid-show; the panel still shows the DJ.
    world.engineUp = false;
    world.panelRow = { dj_name: 'DJ Example', all_music_id: 0, length: 0 };
    await w.check();
    assert.equal(alerts.length, 1, 'the same show, seen another way');

    // The app restarts mid-show: it remembers what it already told you.
    world.engineUp = true;
    const w2 = new Watcher(st, { seen: saved, onLive: (s) => alerts.push('again') });
    await w2.check();
    assert.equal(alerts.length, 1, 'no repeat after a restart');

    // The show ends; the next one alerts again.
    world.live = false; await w2.check();
    world.live = true; world.since = 9000; await w2.check();
    assert.equal(alerts.at(-1), 'again');
});
