#!/usr/bin/env node
/**
 * Admin: give a stranded driver name to a player's new device.
 *
 * The player registers a temporary name on the new site (e.g. "Black2"), then:
 *   node scripts/transfer-name.mjs --old "Black" --temp "Black2"            (dry run: shows both players)
 *   node scripts/transfer-name.mjs --old "Black" --temp "Black2" --apply    (do it, live database)
 *   add --local to run against the local dev database instead
 *
 * Effect: the temp player's device key now signs in as the OLD name; their laps are merged
 * (best lap per day wins); the temp player is deleted. Their game picks up the old name on reload.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const arg = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const oldName = arg('--old');
const tempName = arg('--temp');
const apply = args.includes('--apply');
const where = args.includes('--local') ? ['--local', '--persist-to', '.wrangler/state'] : ['--remote'];

if (!oldName || !tempName) {
  console.error('Usage: node scripts/transfer-name.mjs --old "<old name>" --temp "<temporary name>" [--apply] [--local]');
  process.exit(1);
}
const q = (s) => `'${s.toLowerCase().replace(/'/g, "''")}'`;
const O = `(SELECT id FROM players WHERE name_key = ${q(oldName)})`;
const T = `(SELECT id FROM players WHERE name_key = ${q(tempName)})`;

const WRANGLER = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/** Run SQL through wrangler (no shell, so names with spaces/quotes are passed safely). Returns parsed JSON. */
function d1(sql) {
  const out = execFileSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', 'purple-sector', ...where, '--command', sql.replace(/\s+/g, ' ').trim(), '--json'],
    { encoding: 'utf8' },
  );
  const start = out.search(/^\s*\[/m);
  if (start < 0) throw new Error(`Unexpected output from wrangler:\n${out}`);
  return JSON.parse(out.slice(start));
}

const preview = d1(
  `SELECT p.name, datetime(p.created_at / 1000, 'unixepoch') AS created_utc,
          (SELECT COUNT(*) FROM laps l WHERE l.player_id = p.id) AS laps,
          (SELECT MIN(time) FROM laps l WHERE l.player_id = p.id) AS best
     FROM players p WHERE p.name_key IN (${q(oldName)}, ${q(tempName)});`,
)[0].results;
console.table(preview);
const names = preview.map((r) => r.name.toLowerCase());
if (!names.includes(oldName.toLowerCase()) || !names.includes(tempName.toLowerCase())) {
  console.error('Both names must exist. Nothing changed.');
  process.exit(1);
}
if (!apply) {
  console.log(`Dry run. Re-run with --apply to give "${oldName}" to ${tempName}'s device.`);
  process.exit(0);
}

d1(`
INSERT INTO player_tokens (token_hash, player_id, created_at)
  SELECT token_hash, ${O}, CAST(strftime('%s','now') AS INTEGER) * 1000 FROM players WHERE id = ${T};
INSERT INTO player_tokens (token_hash, player_id, created_at)
  SELECT token_hash, ${O}, created_at FROM player_tokens WHERE player_id = ${T};
DELETE FROM player_tokens WHERE player_id = ${T};
DELETE FROM laps WHERE player_id = ${O}
  AND EXISTS (SELECT 1 FROM laps t WHERE t.player_id = ${T} AND t.day = laps.day AND t.time < laps.time);
DELETE FROM laps WHERE player_id = ${T}
  AND EXISTS (SELECT 1 FROM laps o WHERE o.player_id = ${O} AND o.day = laps.day);
UPDATE laps SET player_id = ${O} WHERE player_id = ${T};
DELETE FROM players WHERE id = ${T};
`);
console.log(`Done: "${oldName}" now belongs to the device that registered "${tempName}". They just reload the game.`);
