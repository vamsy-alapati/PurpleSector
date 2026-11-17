-- Players: no login. A random secret token is stored (hashed) and kept in the player's browser.
CREATE TABLE players (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL UNIQUE,  -- lowercase, for case-insensitive uniqueness
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);

-- Each player's best lap per day (only today's are kept; older days are pruned).
CREATE TABLE laps (
  day         TEXT NOT NULL,         -- 'YYYY-MM-DD' (UTC) = the track seed
  player_id   TEXT NOT NULL REFERENCES players(id),
  time        REAL NOT NULL,         -- seconds, server-verified
  sectors     TEXT NOT NULL,         -- JSON [s1, s2, s3]
  inputs      TEXT NOT NULL,         -- run-length encoded input recording (for ghosts)
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (day, player_id)
);

CREATE INDEX laps_by_time ON laps (day, time);
