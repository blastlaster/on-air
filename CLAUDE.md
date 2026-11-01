# CLAUDE.md — build a station backend for the On Air app

This repository is the **On Air desktop app**. It does not include a station
backend. This file tells Claude (or any developer) how to build one: a
program that runs on the station's computer and gives the app everything it
expects — live status, chat, requests, call-in, voicemail, the LED sign, live
pings, and the green threads behind the app's Interface.

Point Claude at a copy of this folder with this file in it and ask it to
"build my station backend". (If a backend already sits beside the app —
an `engine/` folder or similar — work on that one instead of starting over.) Everything below is the contract the app already
speaks; the station's own details (names, servers, passwords) come from the
person setting it up, never from this file.

---

## 0. How to work (Claude: read this first)

1. **Interview before building.** Ask the setup questions in §2, in plain
   words, a few at a time. Offer sensible defaults. Never invent a station's
   details.
2. **Secrets never go through chat.** For the streaming password, API keys and
   tokens, tell the person to type them into the backend's own setup page
   (§3), which stores them on their computer only. If someone pastes one into
   the conversation anyway, don't repeat it, don't write it into any file you
   show, and suggest they change it.
3. **Build in the order in §8**, testing each step against the real app
   before moving on.
4. **Keep the show safe.** The backend shares a computer with a live
   broadcast. Nothing optional (chat, green threads, uploads) may ever crash
   it or starve the audio. See §7.
5. **Don't change the app** to fit the backend. The app's behaviour is fixed;
   match it. If something truly can't be matched, say so and ask.
6. **Nothing personal in the repo.** Configuration lives in a `data/` folder
   that is git-ignored from the first commit.

---

## 1. What the app needs, at a glance

```
           (the station's own website — any static host)
             onair/station.json   ← "where the station PC is right now"
             onair/extras.json    ← albums, links, board, video (optional)
                    │
 On Air app ────────┤  reads station.json, then talks to the engine
                    ▼
       ENGINE on the station PC  (public side, reachable over https)
         GET  /api/status           live state, now playing, ping, …
         WS   /ws                   chat, requests, calls, live updates
         GET  /api/requestable      search the library to request
         POST /api/voicemail        a voicemail upload
         POST /api/call/away        a caller's "I switched away" beacon
         POST /api/skip             (optional) a vote to skip the AutoDJ song
         GET  /extras.json          (optional) same as onair/extras.json
         /green/api/…               green threads (the Interface)
                    │
       STUDIO (the host's mixer UI, this PC only)
         mic, music, soundboard → encoded audio → the streaming server
                                                 (Icecast / Shoutcast / …)
                                                 → listeners
```

Listeners hear the stream from the **streaming server**, not from the station
PC, so the PC's upload speed doesn't limit the audience. The app never needs
the streaming server's password — only its public listen URL.

### How the app finds a station

In the app, the person pastes an address. The app tries, in order:

1. a URL ending in `.json` — a **pointer file**;
2. `<address>/onair/station.json`, then `<address>/station.json` — a pointer
   published on the station's website;
3. `<address>/api/status` — the engine itself.

A pointer file is just:

```json
{
  "engine": "https://<the engine's current public address>",
  "station": { "name": "…", "tagline": "…", "accent": "#ff3d6e", "autoAccent": "#4ecdff",
               "listenUrl": "https://<stream>", "chattable": "", "banner": null, "tv": null, "panel": null }
}
```

`engine` is `""` while the station PC is off. The backend should republish it
whenever its public address changes (a quick tunnel gets a new address on
every start) and blank it on shutdown. The app re-reads the pointer every 15 s
while it can't reach the engine, so a changing address is fine.

---

## 2. Setup questions to ask

Ask these (Claude in conversation, or the backend's own first-run page — §3).
Defaults in brackets.

| Topic | Ask |
|---|---|
| **Station** | Name; a one-line tagline; colours for "live" and "AutoDJ" [#ff3d6e / #4ecdff]; the host's on-air name. |
| **Streaming server** | Type (Icecast, Shoutcast v1/v2, or a hosting panel's DJ input); host; port; mount (Icecast); DJ/source username; bitrate [128 kbps MP3]. *Password: typed into the setup page only.* The public **listen URL** listeners use. |
| **AutoDJ / hosting panel** | Does the host run an AutoDJ when nobody is live? If its panel has a public API (now playing, history, requests), its base URL and server id. Otherwise skip. |
| **Website** | Where the pointer (`onair/station.json`) will be published: any static host. If the host has an upload API (e.g. Neocities), the backend can publish automatically — *key typed into the setup page only*. Otherwise the person uploads by hand, or uses a permanent address (below) so the pointer never changes. |
| **Public address** | How the engine is reached from the internet: a Cloudflare quick tunnel [default: no account, address changes each start], a named tunnel with a fixed hostname, or their own reverse proxy. Never ask them to open router ports unless they want to. |
| **Music** | Folders holding the station's music (read in place, never copied). |
| **Requests** | Off, free text, or from the library [library]; how many waiting per listener [3]. |
| **Calls** | Allow call-in [yes, opened per show]; max queue [25]. |
| **Voicemail** | Allow [yes]; max length [5 minutes]; where files go [data/voicemail]. |
| **Skip votes** | Let listeners vote AutoDJ songs off [no]. Needs the hosting panel's login (a login without a two-step code), *typed into the setup page only*. |
| **Chat** | Off-air community chat room on Chattable (room name), if any. |
| **Green threads** | Serve them for the Interface [yes]. |
| **Extras** | Albums (archive.org identifiers or track URLs), links, a board URL, a YouTube channel — for `extras.json` (§5). |
| **Remote DJs** | Anyone who should go live from elsewhere (name + their own password, set by them in the setup page). |

---

## 3. In-app setup (the backend's own pages)

Build a **studio** web page served on `http://127.0.0.1:<studio port>` only.
On first run, open it and show a setup wizard with the §2 questions; save to
`data/config.json`. Rules:

- Password and key fields are `type="password"`, saved locally, and **never
  sent back** to any browser afterwards (show "saved" instead).
- A **"Save & test connection"** button for the streaming server that tries
  the details and reports plainly what worked.
- Everything in the wizard stays editable later under ⚙ Settings.
- The studio is also where the host goes live, manages callers, chat, pins,
  the LED sign, and presses **📣 Ping** (§4.6).

---

## 4. The contract

All public endpoints answer JSON with `Access-Control-Allow-Origin: *` where a
browser page might also use them. Times are milliseconds since the epoch
unless noted.

### 4.1 `GET /api/status`

```json
{
  "live": true,
  "dj": "On-air name", "show": "Show title", "since": 1790000000000,
  "nowPlaying": { "id": "…", "title": "…", "artist": "…", "album": "…",
                  "art": "/art/…jpg", "requestedBy": "", "note": "" },
  "autodj": { "title": "…", "artist": "…", "song": "artist - title", "img": "https://…",
              "listeners": 12, "startedAt": 0, "length": 0, "musicId": 0, "recent": [] },
  "listeners": 12,
  "requests": "library",
  "callsOpen": true,
  "voicemail": true,
  "station": { "name": "…", "tagline": "…", "accent": "#…", "autoAccent": "#…",
               "listenUrl": "https://…", "chattable": "",
               "banner": { "on": true, "items": ["…"], "color": "#…", "speed": 1, "font": "block", "effect": "none", "caps": false },
               "tv": { "live": false, "videoId": "", "title": "" },
               "panel": { "api": "https://…/api/v2", "server": 1, "requests": true } },
  "history": [{ "title": "…", "artist": "…", "requestedBy": "", "at": 0, "art": "" }],
  "onAir": [{ "name": "…", "lane": "host|cohost|caller", "color": "#…" }],
  "green": true,
  "skip": { "on": true, "musicId": 126, "votes": 1, "needed": 2, "listeners": 2, "skipped": false },
  "ping": { "id": "a1b2c3", "at": 1790000000000, "title": "…", "body": "…" }
}
```

- `live` is true only while actually connected to the streaming server and live.
- `nowPlaying` / `history` only while live; `autodj` describes the off-air music
  (empty `{}` if unknown). `art` may be a path on the engine or a full URL.
- `requests`: `"off"`, `"text"` (free text) or `"library"` (search via §4.4).
- `callsOpen`: only while live, the studio is open and the host opened the lines.
- `voicemail`: accepted whenever the engine is up, live or not.
- `banner`: `items` may use `%current %artist %title %dj %show %listeners
  %station %time %pin1`–`%pin5`; the app fills them in.
- `tv.live` + `tv.videoId`: a live YouTube stream the app's TV button opens.
- `panel` (optional): a hosting panel with an Everestcast-style public API
  (`/history/`, `/channels/`, `/forecast/`, `/music/{id}/like|dislike/`,
  `/track_requests/`) the app uses directly while the engine is off. Use `null`
  if there isn't one.
- `green`: this engine serves green threads at `/green/api/` (§4.7).
- `ping`: the host's latest 📣 Ping, kept for an hour (§4.6).
- `skip` (optional): a vote to skip the AutoDJ song. `on` only off air, while
  the engine can skip (the host switched it on and saved a panel login);
  `musicId` is the panel's id for the song now playing (`all_music_id` in its
  history); `needed` is more than half of `listeners`. The app shows ⏭ and a
  bar under the volume, and votes with `POST /api/skip` (text/plain body
  `{ "voter": "<stable id per app>", "musicId": 126 }`; answer: this same
  object, or `{ "error": "…" }`). One vote per voter per song, a few per
  address. At the threshold the engine signs in to the panel
  (`POST api-token-auth/` → `{ access }`, then `Authorization: JWT <access>`),
  finds the AutoDJ (`GET djs/?server=N`, the entry with `cat: "auto"`) and
  presses its Next Track (`POST djs/<id>/rewind/`), and records the song in a
  list of skipped songs for the host. Push a `status` after every vote.

### 4.2 WebSocket `/ws`

JSON messages, one per frame. Field `t` is the type.

**App → engine**

| `t` | Fields | |
|---|---|---|
| `app` | — | Sent on connect: "I'm the desktop app" (count it for Ping). |
| `hello` | `name`, `pass?` | Set the listener's name; with `pass` (a guest code) → co-host. |
| `chat` | `text` | Say something (≤ 400 chars; rate-limit). |
| `request` | `id` *or* `song`, `note` | Request a library track by id, or ask for a song by text. |
| `call` | `name`, `topic` | Join the call queue (mic already granted). |
| `rtc` | `data: { sdp }` or `data: { ice }` | WebRTC signalling for the call (§4.5). |
| `resume` | `token` | Rejoin a dropped call within 60 s. |
| `self-mute` | `muted` | The caller muted themselves. |
| `away` | `away` | The caller's page went to the background. |
| `hangup` | — | End the call. |

**Engine → app**

| `t` | Fields | |
|---|---|---|
| `welcome` | `id`, `role`, `name`, `chat: [msg]`, `pins: [pin]` | On connect (and again after a guest code: `role: "cohost"`). |
| `status` | *the whole §4.1 object* | On connect and on every change (push; the app doesn't poll while connected). |
| `chat` | `msg: { id, name, text, role, color, at }` | `role`: `listener`, `host`, `cohost`, `request`, `system`. |
| `chat-hide` | `id` | Remove a message. |
| `chat-pins` | `pins: [{ id, name, text, at }]` | Up to 5 pinned notes (simple `**bold**`, `*italic*`, `[link](https://…)`). |
| `named` | `name`, `role` | Name accepted. |
| `requested` | `title`, `queued`, `bumped?` | Request result. |
| `call` | `state`, `position?`, `token?`, `muted?`, `reason?` | `state`: `queued`, `screen` (host talking privately), `onair`, `backstage` (co-host), `ended`, `closed`. |
| `rtc` | `data` | The studio's answer / ICE for this caller. |
| `rtc-restart` | — | The studio lost the call's audio: the app re-offers. |
| `resumed-call` | — | `resume` worked. |
| `error` | `message` | Shown to the person as-is — write it for listeners. |

Send a ping frame every ~25 s and drop silent sockets.

### 4.3 Chat

Rate-limit per connection, strip control and direction-changing characters
from names and text, cap names at 32 characters, keep the last ~150 messages
for `welcome`. The host can hide messages and pin up to 5.

### 4.4 Requests: `GET /api/requestable?q=…`

`[{ "id": "…", "title": "…", "artist": "…" }]`, at most ~25, only when
`requests` is `"library"`. Never expose file paths. A request by `id` goes into
the queue tagged with the listener's name; by text it becomes a slot the host
fills later.

### 4.5 Calls (WebRTC, browser to browser)

The app is the **offerer**: after `call` is accepted (the engine sends
`call` with `state: "queued"` and a resume `token`), the app creates an
`RTCPeerConnection` (STUN only: Google and Cloudflare), adds its mic, and sends
`{ t: "rtc", data: { sdp: offer } }` and ICE candidates. The engine relays
these to the **studio page**, which answers with the show's audio minus the
caller's own voice (mix-minus) and sends `rtc` back through the engine. Audio
never passes through the engine.

- One call per connection; queue order; the host screens, puts on air, makes
  co-host, mutes, ends.
- Hold a dropped call's place for 60 s (`resume`).
- `POST /api/call/away` (`navigator.sendBeacon`, body `{"token","away"}`)
  marks a caller whose page went to the background.

### 4.6 Pings and live alerts

The app shows a notification (with its one sound):

- when `live` turns true (once per show, keyed by `since`), and
- for every new `ping.id` — the host pressed **📣 Ping** in the studio, live or
  not. Include `ping` in `status` for an hour after sending; push a `status`
  at once so connected apps show it immediately. Cap pings at one a minute.
  Pings older than 10 minutes are ignored by the app.

### 4.7 Green threads: `/green/api/…`

The Interface's community threads. Text only; post ids are 4–8 characters of
`[0-9a-zA-Z]` with **at least one letter** (`7xK2`), quoted as `>>7xK2`. Full
rules — levels, milestones, checks, achievements — are in
[docs/interface.md](docs/interface.md); implement them exactly as written there.

| | |
|---|---|
| `GET /green/api/threads?v=N` | `{ version, mode, threads: [summary] }` by last bump; `{ version, unchanged: true }` if `v` equals the current version. |
| `GET /green/api/thread/:id?v=N` | `{ version, thread: summary, posts: [post] }`, live or archived (404 if gone). |
| `GET /green/api/archive?page=0` | `{ page, total, threads: [summary] }`, 50 a page, newest death first. |
| `POST /green/api/thread` | `{ key, sub, name, text, refs?, cap? }` → `{ ok, version, thread, post, me, levelUp, earned, dubs, checks }`. 403 under level 11, 409 if they already have a live thread. |
| `POST /green/api/thread/:id/reply` | `{ key, name, options, text, refs?, cap? }` → `{ ok, version, post, me, levelUp, earned, dubs, checks }`. `options: "sage"` doesn't bump. |
| `POST /green/api/me` | `{ key }` → `{ me }`. |
| `POST /green/api/check` | `{ key, thread, nos, text }` → `{ ok, checks, earned, me, levelUp }`. |
| `POST /green/api/report` | `{ id, reason }`. |
| `GET /green/api/admin/reports`, `POST /green/api/admin/delete {id}`, `/ban {id, hours, reason}`, `/dismiss {id}` | `Authorization: Bearer <moderator token>`. |

- `summary` = `{ id, sub, name, trip, cap, lv, text (≤400), time, bumped, replies, archived, died, closed, expires, last: [post (text ≤200)] }`;
  `post` = `{ id, name, trip, cap, lv, text, time }`; `me` = `{ level, xp, from, next, title, posts, canThread, threadLevel, thread, today, todayCap, ach: [{ id, name, about, xp }] }`.
- `key`: a private random string the app makes per person; store only a salted
  hash. Without one, fall back to a salted hash of their address.
- `name#secret` → `name` + tripcode `!` + 10 characters of a salted hash.
- `refs: [{ no, thread }]` and `/check`: board posts quoted in the text; verify
  each against `https://a.4cdn.org/<board>/thread/<thread>.json` (cache it;
  only posts from the last 24 h) before giving check XP.
- `mode`: `on`, `read` (no posting) or `off` — a switch in the studio.
- The moderator token is generated once, kept in `data/`, readable only from
  the studio page; the person pastes it into the app (Interface → ⚙).

### 4.8 Voicemail: `POST /api/voicemail?name=…&note=…`

Body: the audio file (recorded in the app as WebM/Opus, or a file the person
picked; ≤ 25 MB). Answer `{ "ok": true }` or `{ "error": "…" }` (400/413/429).
**Never keep or open the upload as-is**: check the bytes are really audio,
quarantine it under a random name, decode it in an isolated context, and write
a brand-new MP3. Rate-limit per address.

### 4.9 `extras.json` and the pointer's website

Published next to `station.json` (and optionally at `/extras.json` on the
engine). Format and fields: see [docs/desktop-app.md](docs/desktop-app.md#for-stations-extrasjson).
If green threads should live somewhere other than the station PC, name it as
`"board": { …, "interface": { "server": "https://…" } }`.

---

## 5. The studio (host side)

At minimum: go live / end show (two taps each), mic and music to the stream
(MP3 at the chosen bitrate, sent to the streaming server as a source client),
a music player with a queue fed by requests, a soundboard, chat with hide and
pin, the call queue with screen / on air / co-host / end, voicemail playback,
the LED sign editor, 📣 Ping, the green-threads switch and token, and ⚙
Settings (§3). Recording every show to `data/recordings/` is strongly
recommended.

Browsers can't open raw TCP to a streaming server, so the engine relays: the
studio encodes and sends audio frames to the engine over a local WebSocket, and
the engine keeps the source connection to the server (retrying on drops).

---

## 6. Security

- **Two ports.** The studio and every admin control on `127.0.0.1` only (check
  the `Host` header; refuse cross-site writes). The public side on its own
  port, the only one behind the tunnel/proxy.
- Secrets (stream password, publishing key, DJ password hashes, moderator
  token) in `data/config.json` and `data/` files only — never in a page, a
  status, a log line or the pointer.
- Behind a tunnel every visitor arrives from `127.0.0.1`; use the proxy's
  client-address header (e.g. `CF-Connecting-IP`) for limits, and never store
  raw addresses — salted hashes only.
- Cap request bodies; rate-limit chat, requests, calls, voicemail, pings and
  green-thread posts.

## 7. The show comes first

The backend runs beside a live broadcast. Required:

- No optional feature may crash the process: catch errors at every request and
  timer; writes to disk are asynchronous, atomic (temp file + rename) and never
  throw.
- Watch the event loop (`perf_hooks.monitorEventLoopDelay`); if it lags past
  ~120 ms, pause green threads and other optional work for a few seconds.
- Green threads: station-wide caps (20 posts a minute, 8 new threads per 10
  minutes), per-person caps (a post every 10 s, 30 per 10 minutes, one live
  thread, level 11 to start one), a ceiling on bytes sent (~130 KB/s), cached
  answers with "unchanged" replies, bounded sizes (100 live threads, 300 posts a
  thread, 1000 archived).
- The station's own posts don't count toward anyone's caps.

## 8. Build order (test each step with the real app)

1. **Config + studio skeleton** on 127.0.0.1 with the setup wizard (§3).
2. **`/api/status` + pointer publishing** → add the station in the app; the radio shows its name and AutoDJ.
3. **Streaming source** → go live from the studio; the app's live light turns red and alerts once.
4. **`/ws` with `welcome`/`status`/chat** → the app's Chat window works live.
5. **Requests** (`/api/requestable`, `request`).
6. **📣 Ping** → the app pops it up within a second.
7. **Calls** (§4.5), then **voicemail** (§4.8).
8. **LED sign**, **TV**, **extras.json**.
9. **Green threads** (§4.7) with the §7 guards, then unlock the app's Interface (type `interface` on the radio) and try posting, levels and checks.
10. **Tests** for each endpoint and message type, and a "show-first" test that floods green threads while checking the engine stays responsive.

### Testing against the app

The app has test switches (see [app/README.md](app/README.md)): e.g.

```bash
cd app && npm install
ONAIR_SMOKE=30000 ONAIR_USERDATA=./tmp-userdata ONAIR_STATION=http://127.0.0.1:<public port> ONAIR_SMOKE_SHOW=1 npx electron .
```

Use a scratch data folder and spare ports for test engines, never open a real
station's studio from a test, and never send real requests, votes or posts to a
real station while testing.
