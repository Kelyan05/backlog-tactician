-- Session 2 warm-up: run these by hand in psql, one block at a time.
-- Goal: leave understanding why `game_id` in sessions is a foreign key,
-- not just working SQL. Drop everything at the end.

CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  hours_to_beat NUMERIC NOT NULL
);

CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id),
  played_at DATE NOT NULL,
  hours_played NUMERIC NOT NULL
);

INSERT INTO games (title, hours_to_beat) VALUES
  ('Hades', 22),
  ('Celeste', 9);

INSERT INTO sessions (game_id, played_at, hours_played) VALUES
  (1, '2026-07-14', 2.5),
  (1, '2026-07-16', 1.0),
  (2, '2026-07-15', 3.0);

-- One-to-many: each game has many sessions, each session belongs to one game.
-- The JOIN below only works because game_id points at a real games.id —
-- try inserting a session with game_id = 999 and watch the foreign key reject it.
SELECT
  games.title,
  sessions.played_at,
  sessions.hours_played
FROM sessions
JOIN games ON games.id = sessions.game_id
ORDER BY sessions.played_at;

-- Cleanup
DROP TABLE sessions;
DROP TABLE games;
