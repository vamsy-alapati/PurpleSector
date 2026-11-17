# Purple Sector

A daily time-trial racing game for the browser. Every day there's one new track, and everyone in the world drives the same one. Laps take about 20–28 seconds, so you can always fit in one more try. There's a daily leaderboard, and you can race any player's ghost.

## Run locally

Requires Node.js 22.12+.

```bash
npm install
npm run dev        # game: http://localhost:5173   (API runs on :8788 behind it)
```

`npm run dev` sets up the local database, then starts the game (Vite) and the API (the Cloudflare Worker + a local D1 database) together. Press Ctrl+C to stop both.

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

↑/W throttle · ↓/S/Space brake/reverse · ←→/AD steer · **R** instant restart · **C** full-track/chase camera · **G** ghost · **M** sound · **L** leaderboard · **Esc** pause

## Project layout

```
packages/sim   Deterministic simulation: physics, track generator, lap timing, replays.
               Shared by the browser and the API; no DOM.
apps/web       Vite + React + Canvas client (rendering, HUD, effects, audio, leaderboard UI)
server/        Cloudflare Worker: worker.ts (entry), routes/ (players, laps, leaderboard, ghost), lib.ts
migrations/    D1 (SQLite) schema
wrangler.toml  Cloudflare config (Worker, static assets, D1 binding)
PLAN.md        Roadmap and decisions
```

**How the anti-cheat works:** the game sends the list of key presses for each tick, never a time. The API re-runs them through the same deterministic simulation and records the time *it* computes.

## Hosting (Cloudflare Workers + D1, free tier)

The whole app is one Cloudflare Worker (`server/worker.ts`). It serves the built game from `apps/web/dist` and handles `/api/*`. Configuration lives in `wrangler.toml`.

One-time setup (already done for the live project):

1. `npx wrangler login` opens a browser window; approve the access request.
2. `npx wrangler d1 create purple-sector`. Copy the printed `database_id` into `wrangler.toml`.
3. `npm run db:migrate:remote` creates the tables in the live database.
4. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository**, pick the repo, and enter:
   - **Project name:** `purple-sector`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`

   The Node version comes from `.node-version`.

After that, every push to `main` builds and deploys automatically. If a future change adds a file to `migrations/`, run `npm run db:migrate:remote` too.

All game art, sound and track designs are original. They're generated in code and use no third-party assets.

### Admin: moving a stranded name to a player's new device

If a player loses access to their name (e.g. the site address changed before recovery codes existed):
1. They register a temporary name on the live site, e.g. `Black2`.
2. Run `node scripts/transfer-name.mjs --old "Black" --temp "Black2"` to see both players (dry run).
3. Add `--apply` to do it. Their device now signs in as `Black`, their best laps are merged, and the temporary name is removed. They just reload the game.

### Changing the car physics

Laps are verified, and ghosts replayed, by re-running inputs. So **a day's physics must never change once that day has started.** To tune the car, add a new `CarParams` version in `packages/sim/src/physics.ts` and make `physicsFor()` return it only from a **future** day. Existing laps keep replaying exactly.
