# Apex Daily

A daily time-trial racing game for the browser. Every day there's one new track, and everyone in the world drives the same one. Laps take 15–25 seconds, so you can always fit in one more try.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Add `?seed=anything` to the URL to try a different track.

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run the simulation tests |
| `npm run typecheck` | Run the TypeScript type check |
| `npm run build` | Build a production bundle into `apps/web/dist` |

## Controls

↑/W throttle · ↓/S brake/reverse · ←→/AD steer · **R** instant restart · **C** full-track/chase camera · **G** ghost · **M** sound · **Esc** pause

## Project layout

```
packages/sim   Deterministic simulation (physics, track generator, lap timing).
               No DOM, so the API server can re-run laps to verify them.
apps/web       Vite + React + Canvas client (rendering, HUD, effects, audio)
PLAN.md        Roadmap and architecture
```

All game art, sound and track designs are original. They're generated in code and use no third-party assets.
