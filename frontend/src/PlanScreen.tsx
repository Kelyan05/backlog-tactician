import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Plan, PlanEntry } from "./types";

function coverUrl(entry: PlanEntry): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${entry.game.steamAppId}/header.jpg`;
}

function ReasonBadges({ entry }: { entry: PlanEntry }) {
  const badges: ReactNode[] = [];
  if (entry.completionBonus >= 5) {
    badges.push(
      <span className="badge badge--good" key="completion">
        Almost done
      </span>
    );
  } else if (entry.completionBonus > 0) {
    badges.push(
      <span className="badge badge--good" key="completion">
        Progress banked
      </span>
    );
  }
  if (entry.recencyPenalty > 0) {
    badges.push(
      <span className="badge badge--warning" key="recency">
        Played recently
      </span>
    );
  }
  if (entry.varietyBonus > 0) {
    badges.push(
      <span className="badge badge--accent" key="variety">
        New genre{entry.game.genre ? `: ${entry.game.genre}` : ""}
      </span>
    );
  }
  if (badges.length === 0) {
    badges.push(
      <span className="badge badge--muted" key="fresh">
        Fresh pick
      </span>
    );
  }
  return <div className="reason-row">{badges}</div>;
}

function PlanEntryRow({ entry }: { entry: PlanEntry }) {
  const [hoursPlayed, setHoursPlayed] = useState("1");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  const markPlayed = () => {
    const value = Number(hoursPlayed);
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("error");
      return;
    }

    setStatus("saving");
    fetch(`/api/games/${entry.game.id}/play-sessions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hoursPlayed: value }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        setStatus("saved");
      })
      .catch(() => setStatus("error"));
  };

  return (
    <li className="entry-card">
      <img
        className="cover"
        src={coverUrl(entry)}
        alt=""
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.visibility = "hidden";
        }}
      />
      <div className="entry-body">
        <div className="entry-head">
          <span className="name">{entry.game.name}</span>
          <span className="hours">{entry.allocatedHours.toFixed(1)}h</span>
        </div>
        <ReasonBadges entry={entry} />
        <div className="mark-played">
          <input
            type="number"
            min="0.25"
            step="0.25"
            value={hoursPlayed}
            onChange={(event) => setHoursPlayed(event.target.value)}
            aria-label={`Hours played on ${entry.game.name}`}
          />
          <button
            type="button"
            onClick={markPlayed}
            disabled={status === "saving"}
          >
            Mark played
          </button>
          {status === "saved" && (
            <span className="feedback">
              Logged — regenerate your plan to see it reflected.
            </span>
          )}
          {status === "error" && (
            <span className="feedback error" role="alert">
              Couldn't log that session.
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function BudgetMeter({
  hoursUsed,
  hoursAvailable,
}: {
  hoursUsed: number;
  hoursAvailable: number;
}) {
  const percent =
    hoursAvailable > 0 ? Math.min(100, (hoursUsed / hoursAvailable) * 100) : 0;
  return (
    <div
      className="meter"
      title={`${hoursUsed.toFixed(1)}h of ${hoursAvailable}h used`}
    >
      <div className="track">
        <div className="fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="label">
        {hoursUsed.toFixed(1)}h / {hoursAvailable}h
      </span>
    </div>
  );
}

function PlanResult({
  plan,
  hoursAvailable,
}: {
  plan: Plan;
  hoursAvailable: number;
}) {
  if (plan.entries.length === 0) {
    return (
      <p className="empty-state">
        Nothing fits that budget yet — try a bigger number, or add time-to-beat
        estimates to more games.
      </p>
    );
  }

  const hoursUsed = plan.entries.reduce(
    (sum, entry) => sum + entry.allocatedHours,
    0
  );

  return (
    <div>
      <div className="plan-summary">
        <strong>
          {plan.entries.length} game{plan.entries.length === 1 ? "" : "s"}
        </strong>
        <BudgetMeter hoursUsed={hoursUsed} hoursAvailable={hoursAvailable} />
      </div>
      <ol className="entry-list">
        {plan.entries.map((entry) => (
          <PlanEntryRow key={entry.id} entry={entry} />
        ))}
      </ol>
    </div>
  );
}

function PlanScreen() {
  const [hours, setHours] = useState("8");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planHours, setPlanHours] = useState(0);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">(
    "idle"
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const hoursAvailable = Number(hours);
    if (!Number.isFinite(hoursAvailable) || hoursAvailable <= 0) {
      setStatus("error");
      return;
    }

    setStatus("loading");
    fetch("/api/plans", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hoursAvailable }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json() as Promise<Plan>;
      })
      .then((data) => {
        setPlan(data);
        setPlanHours(hoursAvailable);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  };

  return (
    <section>
      <h2>This week's plan</h2>
      <form className="plan-form" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="hours">Hours free this week</label>
          <input
            id="hours"
            type="number"
            min="0.5"
            step="0.5"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
        </div>
        <button
          type="submit"
          className="primary"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Building plan…" : "Build my plan"}
        </button>
      </form>

      {status === "error" && (
        <p className="alert" role="alert">
          Couldn't build a plan. Check the hours you entered and try again.
        </p>
      )}
      {status === "ready" && plan && (
        <PlanResult plan={plan} hoursAvailable={planHours} />
      )}
    </section>
  );
}

export default PlanScreen;
