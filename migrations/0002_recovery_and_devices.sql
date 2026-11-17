-- Recovery codes: lets a player use their name on another device/browser.
ALTER TABLE players ADD COLUMN recovery_hash TEXT;
CREATE UNIQUE INDEX players_recovery ON players (recovery_hash) WHERE recovery_hash IS NOT NULL;

-- Extra device keys for a player (recovered devices, manual name transfers).
-- The player's first device key stays in players.token_hash.
CREATE TABLE player_tokens (
  token_hash  TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);
CREATE INDEX player_tokens_player ON player_tokens (player_id);
