/** POST /api/players  { name }  →  { id, name, token }   (create a player; no login) */
import { error, hashToken, json, newToken, readJson, validateName, type Env } from '../lib';

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
