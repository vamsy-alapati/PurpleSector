/**
 * POST /api/laps   (Authorization: Bearer <token>)
 *   { day, inputs }  →  { time, sectors, improved, best, rank, total }
 *
 * Anti-cheat: the client's claimed time is ignored. The server re-runs the input
 * recording through the same deterministic simulation and uses ITS result.
 */
import { decodeInputs, simulateAttempt } from '@purple-sector/sim';
import { acceptsLapsFor, authPlayer, DAY_RE, dayOffset, error, json, readJson, today, trackFor, type Env } from '../lib';

interface Body {
  day?: unknown;
  inputs?: unknown;
}

export async function handleLaps(request: Request, env: Env): Promise<Response> {
  const player = await authPlayer(request, env);
  if (!player) return error(401, 'Unknown player');

  const body = await readJson<Body>(request, 64 * 1024);
  if (!body || typeof body.day !== 'string' || !DAY_RE.test(body.day) || typeof body.inputs !== 'string') {
    return error(400, 'Invalid request');
  }
  const day = body.day;
  if (!acceptsLapsFor(day)) return error(409, "That track isn't open any more");

  let inputs: Uint8Array;
  try {
    inputs = decodeInputs(body.inputs);
  } catch {
    return error(400, 'Invalid recording');
  }

  const { lap, ticks } = simulateAttempt(trackFor(day), inputs);
  if (!lap) return error(422, 'Recording does not complete a lap');
  if (!lap.valid) return error(422, 'Lap was invalid (track limits)');

  // Store only what the lap actually used
  const stored = body.inputs.length <= 40_000 ? body.inputs : '';
  if (ticks < inputs.length - 120 * 5) return error(400, 'Recording continues long after the lap');

  const now = Date.now();
  const sectors = JSON.stringify(lap.sectors.map((s) => Math.round(s * 1e6) / 1e6));
  const [, prev] = await env.DB.batch([
    // keep only today + yesterday
    env.DB.prepare('DELETE FROM laps WHERE day < ?').bind(dayOffset(today(), -1)),
    env.DB.prepare('SELECT time FROM laps WHERE day = ? AND player_id = ?').bind(day, player.id),
  ]);
  const prevTime = (prev?.results?.[0] as { time?: number } | undefined)?.time ?? null;
  const improved = prevTime === null || lap.time < prevTime;

  if (improved) {
    await env.DB.prepare(
      `INSERT INTO laps (day, player_id, time, sectors, inputs, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (day, player_id) DO UPDATE SET
         time = excluded.time, sectors = excluded.sectors, inputs = excluded.inputs, created_at = excluded.created_at
       WHERE excluded.time < laps.time`,
    )
      .bind(day, player.id, lap.time, sectors, stored, now)
      .run();
  }

  const best = improved ? lap.time : prevTime!;
  const stats = await env.DB.prepare(
    'SELECT (SELECT COUNT(*) FROM laps WHERE day = ?1 AND time < ?2) + 1 AS rank, (SELECT COUNT(*) FROM laps WHERE day = ?1) AS total',
  )
    .bind(day, best)
    .first<{ rank: number; total: number }>();

  return json({
    time: lap.time,
    sectors: lap.sectors,
    improved,
    best,
    rank: stats?.rank ?? null,
    total: stats?.total ?? null,
  });
}
