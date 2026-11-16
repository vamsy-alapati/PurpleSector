# Purple Sector — Project Plan

> Name chosen: **Purple Sector** ("going purple" = fastest of anyone in a sector). Still to do before launch: check the trademark, domain and social handles.

## 1. Concept

A browser game with one new track each day for everyone. Players drive flat-out laps and post their best time. Everyone gets the same track for 24 hours, then it rotates. Sessions are short, the game is very replayable, and results are easy to share.

It's inspired by the *genre* of hotlapdaily.com. Game mechanics like daily challenges, time trials and ghosts can't be copyrighted. The name, art, text, code, team names and look all have to be our own.

**Core design decisions (from playtest #1):**
- **Laps last 15–25 seconds.** Generated tracks are 480–900 m long and fit a ~250 × 160 m box. Short laps drive the "one more try" loop.
- **The default camera shows the full track**, so the whole circuit is always visible and you can read random tracks at a glance. **The chase camera** (C) is optional and comes with a minimap.
- **Restart is instant** (R) with no countdown. Timing starts at the line, so a restart never costs the player anything.
- **A ghost of your best lap** is on by default.

**Public-version decisions (agreed 2026-11-16):**
- **One attempt = out-lap + one timed lap**, then the results pop-up (Retry / Share).
- **No login.** On first play you pick a **unique username**, and a secret player key is stored in the browser. There's **no recovery**: a new device or a cleared browser means a new name.
- **Leaderboard covers today only**, showing each player's best lap. It resets at **UTC midnight** with the new track, and old days are deleted. **Attempts are unlimited.**
- **Any leaderboard lap can be raced as a ghost.** Laps are stored as input recordings, and the server re-simulates every lap before accepting it (anti-cheat).
- **Share** uses Wordle-style spoiler-free text plus a link, through the native share sheet on phones or X / WhatsApp / Facebook / Reddit / copy on desktop. Challenge links that load a ghost come later.
- **No user-made tracks.**
- **Tracks are built from a blueprint:** a rectangle with notches, cut-outs and chamfers, rounded with real arcs. That gives at least 8 corners and laps of about 20–28 s.

## 2. Legal / IP rules (non-negotiable)

| Don't | Do |
|---|---|
| Use "F1", "Formula 1", "Grand Prix" or the FIA in the name, logo or marketing (all trademarked) | Use an original brand. "Open-wheel racing" is a generic term we can use |
| Use real or parody team names ("Prancing Horse", "Silver Arrows", "Papaya") or real liveries | Invent our own fictional teams and colour schemes |
| Use real driver names or likenesses | Use player-chosen nicknames only |
| Copy the reference site's UI, text, pixel art, sounds or code | Design our own visual identity, and use only assets we make or that have a CC0/MIT licence |
| Reproduce real circuit layouts exactly | Generate original tracks from a seed or design our own (we can use "inspired-by" styles) |

## 3. How we beat the original

1. **Verified leaderboards.** The server re-runs each submitted lap from its inputs, so cheated times are rejected.
2. **Race the #1 ghost.** Download and race the world record's ghost, or any player's.
3. **Wordle-style sharing.** One tap shares a spoiler-free result card (time, rank and sector emoji).
4. **Streaks and stats.** Daily streak, personal-best history, and an archive of past tracks.
5. **Track editor.** Draw a track, then share it as a link or seed and challenge friends.
6. **Variety.** Weather and time-of-day per track (dry, wet, night) that change grip and visibility.
7. **Mobile first.** Good touch controls, 60fps on mid-range phones, and installable as a PWA (works offline for practice).
8. **Accessibility.** Rebindable keys, colour-blind palettes, reduced motion, and gamepad support.

## 4. Tech stack (all free tier)

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | Client and server share the same physics code |
| Build tool | **Vite** | Fast, simple, and builds a static site |
| UI (menus, HUD, leaderboards) | **React** + **Tailwind CSS** | Most common stack, easy to learn and hire for |
| Game rendering | **HTML5 Canvas 2D** (top-down) | Lightweight, works on any device; we can move to PixiJS/WebGL later if needed |
| Physics | **Custom deterministic car model** in pure TS | Needed for replays, ghosts and anti-cheat |
| Backend API | **Cloudflare Workers** | Free, 100k requests/day, fast worldwide, never sleeps |
| Database | **Cloudflare D1** (SQLite) | Free 5 GB, with SQL |
| Cache / replays | **Cloudflare KV / R2** | Leaderboard cache and ghost storage |
| Hosting | **Cloudflare Pages** | Free, unlimited bandwidth, automatic deploys from GitHub |
| Source control / CI | **GitHub** + GitHub Actions | Free |
| Testing | **Vitest** (logic), **Playwright** (smoke tests) | |
| Domain | Free `*.pages.dev`, or a custom domain at ~$10/yr | |

Hosting cost at launch is **$0**. A custom domain is optional.

## 5. Architecture

```
purple-sector/  (npm workspaces monorepo)
├── packages/
│   └── sim/            # PURE TS, no DOM — shared by client and server
│       ├── physics.ts      car model, fixed 120 Hz timestep, deterministic
│       ├── track.ts        seeded track generator (spline → road mesh, checkpoints, sectors)
│       ├── rng.ts          seeded PRNG (date → seed)
│       └── replay.ts       input recording/encoding, re-simulation
├── apps/
│   ├── web/            # Vite + React + Canvas
│   │   ├── game/           render loop, camera, input (keys/touch/gamepad), ghost, audio
│   │   ├── ui/             menus, HUD, results, leaderboard, share card
│   │   └── state/          local storage (PBs, streaks, settings)
│   └── api/            # Cloudflare Worker
│       ├── routes/         /track/today, /laps (submit), /leaderboard, /ghost/:id
│       └── verify.ts       re-simulates submitted inputs with packages/sim
└── PLAN.md
```

**Lap submission flow (anti-cheat)**
```
Player drives → client records inputs every tick → lap done
  → POST /laps { trackId, nickname, playerId, inputs(compressed), claimedTime }
  → Worker re-runs the inputs in sim → its time matches the claim? → save to D1, update the cached leaderboard
                                                       → mismatch?          → reject
```

**Daily track:** `seed = hash("YYYY-MM-DD" UTC)` → the generator builds the track. Every client and the server get the same track without storing anything. The server only stores metadata such as name, weather and par time.

**Data model (D1)**
- `players(id, nickname, created_at)` — anonymous device ID at first; optional login later
- `tracks(date, seed, weather, name)`
- `laps(id, player_id, track_date, time_ms, sectors_json, replay_key, verified, created_at)`
- Leaderboard = `SELECT best per player WHERE track_date = ?`, cached in KV for 30–60 s

## 6. Roadmap

| Phase | Goal | Done when |
|---|---|---|
| **0. Setup** ✅ | Monorepo, Vite, TS, Git | `npm run dev` works |
| **1. Driving prototype** ✅ | Car physics, keyboard input, lap timer, sectors | A full lap is fun to drive |
| **2. Daily tracks** ✅ | Seeded generator (UTC date), validation, full-track view, minimap | A new valid short track each date |
| **3. Ghost and replay** 🟡 | PB ghost done (pose-based). Still to do: input-replay ghosts, test mode | Race against your best lap |
| **4. UI / UX** | Menus, HUD, results screen, touch controls, sound, theming | Playable and polished on a phone |
| **5. Backend** | Worker + D1, submission + verification, leaderboards | Verified global leaderboard live |
| **6. Launch** | Cloudflare Pages deploy, domain, privacy page, analytics (Cloudflare, cookieless) | Public URL |
| **7. Extras** | Share card, streaks, archive, #1 ghost, weather, track editor, PWA | Ongoing |

## 7. Working agreement

- Claude acts as lead dev: proposes the design, writes the code, and explains each step.
- You review and play-test each phase before we move on.
- Each phase ends with a Git commit. Pushes go to GitHub once that's set up.
- Accounts you'll need to create yourself: **GitHub** and **Cloudflare** (both free).
