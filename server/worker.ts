/**
 * Cloudflare Worker entry point.
 * /api/* is handled here; everything else is the game's static files (env.ASSETS).
 */
import { error, type Env } from './lib';
import { handleGhost } from './routes/ghost';
import { handleLaps } from './routes/laps';
import { handleLeaderboard } from './routes/leaderboard';
import { handlePlayers } from './routes/players';

type Handler = (request: Request, env: Env) => Promise<Response>;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  '/api/players': { POST: handlePlayers },
  '/api/laps': { POST: handleLaps },
  '/api/leaderboard': { GET: handleLeaderboard },
  '/api/ghost': { GET: handleGhost },
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const route = ROUTES[url.pathname];
    if (!route) return error(404, 'Not found');
    const handler = route[request.method];
    if (!handler) return error(405, 'Method not allowed');
    try {
      return await handler(request, env);
    } catch (e) {
      console.error(`${request.method} ${url.pathname} failed:`, e);
      return error(500, 'Server error, please try again');
    }
  },
} satisfies ExportedHandler<Env>;
