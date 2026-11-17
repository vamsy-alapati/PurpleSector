/**
 * GET /api/leaderboard?day=YYYY-MM-DD   (Authorization optional → includes your own position)
 *   → { day, total, entries: [{ rank, playerId, name, time, sectors }], me: { rank, time } | null }
 */
import { authPlayer, DAY_RE, error, json, today, type Env } from '../../server/lib';

const LIMIT = 100;

interface Row {
  player_id: string;
  name: string;
  time: number;
  sectors: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const day = url.searchParams.get('day') ?? today();
  if (!DAY_RE.test(day)) return error(400, 'Invalid day');

  const [rows, count] = await env.DB.batch([
    env.DB.prepare(
      `SELECT l.player_id, p.name, l.time, l.sectors
         FROM laps l JOIN players p ON p.id = l.player_id
        WHERE l.day = ? ORDER BY l.time ASC, l.created_at ASC LIMIT ?`,
    ).bind(day, LIMIT),
    env.DB.prepare('SELECT COUNT(*) AS total FROM laps WHERE day = ?').bind(day),
  ]);

  const entries = ((rows?.results ?? []) as unknown as Row[]).map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    name: r.name,
    time: r.time,
    sectors: JSON.parse(r.sectors) as number[],
  }));
  const total = ((count?.results?.[0] as { total?: number } | undefined)?.total ?? 0) as number;

  let me: { rank: number; time: number } | null = null;
  const player = await authPlayer(request, env);
  if (player) {
    me = await env.DB.prepare(
      `SELECT time, (SELECT COUNT(*) FROM laps WHERE day = ?1 AND time < l.time) + 1 AS rank
         FROM laps l WHERE day = ?1 AND player_id = ?2`,
    )
      .bind(day, player.id)
      .first<{ rank: number; time: number }>();
  }

  return json({ day, total, entries, me });
};
