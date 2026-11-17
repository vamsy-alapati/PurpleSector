# Purple Sector

A daily time-trial racing game for the browser. Every day there's one new track, and everyone in the world drives the same one. Laps take about 20–28 seconds, so you can always fit in one more try. There's a daily leaderboard, and you can race any player's ghost.

## Run locally

Requires Node.js 22.12+.

```bash
npm install
npm run dev        # game: http://localhost:5173   (API runs on :8788 behind it)
```

`npm run dev` sets up the local database, then starts the game (Vite) and the API (Cloudflare Pages Functions + a local D1 database) together. Press Ctrl+C to stop both.

Add `?seed=anything` to the URL to practise on a different track. Practice laps are never submitted to the leaderboard.

| Command | What it does |
|---|---|
| `npm run dev` | Start the game and the API locally |
| `npm run dev:web` | Start the game only (the leaderboard shows "offline") |
| `npm test` | Run the simulation tests |
| `npm run typecheck` | Run the TypeScript type check (web + API) |
| `npm run build` | Build the site into `apps/web/dist` |
| `npm run db:migrate:remote` | Apply database migrations to the live database |

## Controls

↑/W throttle · ↓/S brake/reverse · ←→/AD steer · **R** instant restart · **C** full-track/chase camera · **G** ghost · **M** sound · **L** leaderboard · **Esc** pause

## Project layout

```
packages/sim   Deterministic simulation: physics, track generator, lap timing, replays.
               Shared by the browser and the API; no DOM.
apps/web       Vite + React + Canvas client (rendering, HUD, effects, audio, leaderboard UI)
functions/api  Cloudflare Pages Functions: players, laps (server-verified), leaderboard, ghost
server/        Shared helpers for the API
migrations/    D1 (SQLite) schema
wrangler.toml  Cloudflare config (site output dir + D1 binding)
PLAN.md        Roadmap and decisions
```

**How the anti-cheat works:** the game sends the list of key presses for each tick, never a time. The API re-runs them through the same deterministic simulation and records the time *it* computes.

## Hosting (Cloudflare Pages + D1, free tier)

One-time setup:

1. `npx wrangler login` opens a browser window; log in to Cloudflare.
2. `npx wrangler d1 create purple-sector`. Copy the printed `database_id` into `wrangler.toml`, then commit and push.
3. `npm run db:migrate:remote` creates the tables in the live database.
4. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git**, pick the repo, and enter:
   - **Build command:** `npm run build`
   - **Build output directory:** `apps/web/dist`
   - **Environment variable:** `NODE_VERSION` = `22`

   The D1 binding (`DB`) is read from `wrangler.toml`.

After that, every push to `main` redeploys the site and the API.

All game art, sound and track designs are original. They're generated in code and use no third-party assets.
