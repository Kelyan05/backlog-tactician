import { useEffect, useMemo, useState } from "react";
import type { Game } from "./types";
import PlanScreen from "./PlanScreen";
import "./App.css";

function coverUrl(game: Game): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.steamAppId}/header.jpg`;
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  return `${hours}h`;
}

function SourceBadge({ source }: { source: string | null }) {
  if (source === "IGDB") return <span className="badge badge--good">IGDB</span>;
  if (source === "MANUAL")
    return <span className="badge badge--accent">Manual</span>;
  return <span className="badge badge--muted">– Missing</span>;
}

function PlaytimeMeter({ game }: { game: Game }) {
  if (!game.timeToBeatHours) return null;
  const playedHours = game.playtimeMinutes / 60;
  const percent = Math.min(100, (playedHours / game.timeToBeatHours) * 100);
  const complete = percent >= 100;
  return (
    <div
      className="meter"
      title={`${playedHours.toFixed(1)}h played of ${
        game.timeToBeatHours
      }h to beat`}
    >
      <div className="track">
        <div
          className={`fill${complete ? " complete" : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="label">
        {complete ? "Beaten" : `${Math.round(percent)}%`}
      </span>
    </div>
  );
}

function GameCard({ game }: { game: Game }) {
  return (
    <div className="game-card">
      <img
        className="cover"
        src={coverUrl(game)}
        alt=""
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.visibility = "hidden";
        }}
      />
      <div className="body">
        <div className="title">{game.name}</div>
        <div className="badges">
          {game.genre && (
            <span className="badge badge--muted">{game.genre}</span>
          )}
          <SourceBadge source={game.timeToBeatSource} />
        </div>
        <div className="stat-line label">
          {formatHours(game.timeToBeatHours)} to beat
        </div>
        <PlaytimeMeter game={game} />
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="skeleton-grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="cover skeleton" />
          <div className="line skeleton" style={{ width: "80%" }} />
          <div className="line skeleton" style={{ width: "50%" }} />
        </div>
      ))}
    </div>
  );
}

type SortKey = "name" | "timeToBeat" | "playtime";

function GameList() {
  const [games, setGames] = useState<Game[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">(
    "loading"
  );
  const [importStatus, setImportStatus] = useState<
    "idle" | "importing" | "error"
  >("idle");
  const [enrichStatus, setEnrichStatus] = useState<
    "idle" | "enriching" | "error"
  >("idle");
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");

  const loadGames = () => {
    setStatus("loading");
    fetch("/api/games", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json() as Promise<Game[]>;
      })
      .then((data) => {
        setGames(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  };

  useEffect(loadGames, []);

  const importLibrary = () => {
    setImportStatus("importing");
    fetch("/api/import/steam", { method: "POST", credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        setImportStatus("idle");
        loadGames();
      })
      .catch(() => setImportStatus("error"));
  };

  const enrichLibrary = () => {
    setEnrichStatus("enriching");
    fetch("/api/enrich/igdb", { method: "POST", credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        setEnrichStatus("idle");
        loadGames();
      })
      .catch(() => setEnrichStatus("error"));
  };

  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const game of games) if (game.genre) set.add(game.genre);
    return Array.from(set).sort();
  }, [games]);

  const visibleGames = useMemo(() => {
    let result = games;
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      result = result.filter((game) =>
        game.name.toLowerCase().includes(needle)
      );
    }
    if (genreFilter !== "all") {
      result = result.filter((game) => game.genre === genreFilter);
    }
    const sorted = [...result];
    sorted.sort((a, b) => {
      if (sortKey === "timeToBeat")
        return (b.timeToBeatHours ?? -1) - (a.timeToBeatHours ?? -1);
      if (sortKey === "playtime") return b.playtimeMinutes - a.playtimeMinutes;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [games, search, genreFilter, sortKey]);

  return (
    <div>
      <div className="toolbar">
        <button
          type="button"
          className="primary"
          onClick={importLibrary}
          disabled={importStatus === "importing"}
        >
          {importStatus === "importing" ? "Importing…" : "Import Steam library"}
        </button>
        <button
          type="button"
          onClick={enrichLibrary}
          disabled={enrichStatus === "enriching"}
        >
          {enrichStatus === "enriching" ? "Enriching…" : "Enrich with IGDB"}
        </button>
        <div className="spacer" />
        {genres.length > 0 && (
          <select
            value={genreFilter}
            onChange={(event) => setGenreFilter(event.target.value)}
            aria-label="Filter by genre"
          >
            <option value="all">All genres</option>
            {genres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        )}
        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          aria-label="Sort games"
        >
          <option value="name">Sort: name</option>
          <option value="timeToBeat">Sort: time to beat</option>
          <option value="playtime">Sort: most played</option>
        </select>
        <input
          type="search"
          placeholder="Search your library…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search games"
        />
      </div>

      {importStatus === "error" && (
        <p className="alert" role="alert">
          Couldn't import your library. Make sure STEAM_API_KEY is set and
          you're logged in via Steam.
        </p>
      )}
      {enrichStatus === "error" && (
        <p className="alert" role="alert">
          Couldn't enrich your library. Make sure
          IGDB_CLIENT_ID/IGDB_CLIENT_SECRET are set.
        </p>
      )}

      {status === "loading" && <SkeletonGrid />}
      {status === "error" && (
        <p className="empty-state">
          Couldn't load your games. Is the API running?
        </p>
      )}
      {status === "ready" && games.length === 0 && (
        <p className="empty-state">
          Your library is empty — click "Import Steam library" to pull in your
          games.
        </p>
      )}
      {status === "ready" && games.length > 0 && (
        <>
          <p className="count-pill">
            {visibleGames.length} of {games.length} game
            {games.length === 1 ? "" : "s"}
          </p>
          <div className="game-grid">
            {visibleGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AuthBar({ onLoggedOut }: { onLoggedOut: () => void }) {
  const logout = () => {
    fetch("/auth/logout", { method: "POST", credentials: "include" }).then(
      onLoggedOut
    );
  };

  return (
    <div className="auth-bar">
      <button type="button" onClick={logout}>
        Log out
      </button>
    </div>
  );
}

function LoginScreen() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <h1>Backlog Tactician</h1>
        <p>
          Sign in with Steam to import your library and build a weekly plan.
        </p>
        <a className="steam-login" href="/auth/steam/login">
          Log in with Steam
        </a>
        {import.meta.env.DEV && (
          <div className="dev-login">
            <button
              type="button"
              onClick={() => {
                fetch("/auth/dev-login", {
                  method: "POST",
                  credentials: "include",
                }).then(() => window.location.reload());
              }}
            >
              Dev login (local testing only)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [userId, setUserId] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    fetch("/auth/me", { credentials: "include" })
      .then((res) => res.json() as Promise<{ userId: number | null }>)
      .then((data) => {
        setUserId(data.userId);
        setStatus("ready");
      });
  }, []);

  if (status === "loading") return null;
  if (userId === null) return <LoginScreen />;

  return (
    <main>
      <div className="topbar">
        <h1>
          Backlog Tactician <span className="tagline">— what to play next</span>
        </h1>
        <AuthBar onLoggedOut={() => setUserId(null)} />
      </div>
      <section className="panel">
        <PlanScreen />
      </section>
      <section className="panel">
        <h2>Your library</h2>
        <GameList />
      </section>
    </main>
  );
}

export default App;
