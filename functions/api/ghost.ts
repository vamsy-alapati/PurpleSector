/** GET /api/ghost?day=YYYY-MM-DD&player=<id>  →  { name, time, inputs }   (any leaderboard lap) */
import { DAY_RE, error, json, type Env } from '../../server/lib';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const day = url.searchParams.get('day') ?? '';
  const player = url.searchParams.get('player') ?? '';
  if (!DAY_RE.test(day) || !/^[0-9a-f-]{36}$/.test(player)) return error(400, 'Invalid request');

  const row = await env.DB.prepare(
    'SELECT p.name, l.time, l.inputs FROM laps l JOIN players p ON p.id = l.player_id WHERE l.day = ? AND l.player_id = ?',
  )
    .bind(day, player)
    .first<{ name: string; time: number; inputs: string }>();
  if (!row || !row.inputs) return error(404, 'Lap not found');

  // A player's best only changes when they improve; a short cache is safe and saves reads
  return json(row, 200, { 'cache-control': 'public, max-age=30' });
};
