/**
 * Players (no login):
 *   POST /api/players                 { name }  → { id, name, token }   create a player
 *   GET  /api/players/me              (auth)    → { id, name }          who am I (refreshes a renamed/transferred player)
 *   POST /api/players/recovery-code   (auth)    → { code }              new recovery code (replaces any previous one)
 *   POST /api/players/recover         { code }  → { id, name, token }   use your name on this device
 */
import {
  authPlayer,
  error,
  hashToken,
  json,
  newRecoveryCode,
  newToken,
  normaliseRecoveryCode,
  readJson,
  validateName,
  type Env,
} from '../lib';

export async function handlePlayers(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ name?: unknown }>(request, 1024);
  if (!body) return error(400, 'Invalid request');
  const v = validateName(body.name);
  if ('error' in v) return error(400, v.error);

  const id = crypto.randomUUID();
  const token = newToken();
  try {
    await env.DB.prepare(
      'INSERT INTO players (id, name, name_key, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(id, v.name, v.name.toLowerCase(), await hashToken(token), Date.now())
      .run();
  } catch (e) {
    if (String(e).includes('UNIQUE')) return error(409, 'That name is already taken');
    throw e;
  }
  return json({ id, name: v.name, token }, 201);
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const player = await authPlayer(request, env);
  if (!player) return error(401, 'Unknown player');
  return json(player);
}

export async function handleRecoveryCode(request: Request, env: Env): Promise<Response> {
  const player = await authPlayer(request, env);
  if (!player) return error(401, 'Unknown player');
  const code = newRecoveryCode();
  await env.DB.prepare('UPDATE players SET recovery_hash = ? WHERE id = ?')
    .bind(await hashToken(normaliseRecoveryCode(code)!), player.id)
    .run();
  return json({ code });
}

export async function handleRecover(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ code?: unknown }>(request, 1024);
  const code = normaliseRecoveryCode(body?.code);
  if (!code) return error(400, 'That doesn’t look like a recovery code (12 letters/numbers)');

  const player = await env.DB.prepare('SELECT id, name FROM players WHERE recovery_hash = ?')
    .bind(await hashToken(code))
    .first<{ id: string; name: string }>();
  if (!player) return error(404, 'No driver found for that code');

  // New key for this device; the player's other devices keep working
  const token = newToken();
  await env.DB.prepare('INSERT INTO player_tokens (token_hash, player_id, created_at) VALUES (?, ?, ?)')
    .bind(await hashToken(token), player.id, Date.now())
    .run();
  return json({ id: player.id, name: player.name, token });
}
