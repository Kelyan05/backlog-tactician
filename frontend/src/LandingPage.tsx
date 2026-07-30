function KnapsackIcon() {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 122 138"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="10"
        y="38"
        width="100"
        height="90"
        rx="18"
        stroke="var(--accent)"
        strokeWidth="6"
      />
      <path
        d="M32 22 q28 -20 56 0 v20 h-56 z"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <rect
        x="40"
        y="70"
        width="40"
        height="30"
        rx="8"
        fill="var(--accent)"
        fillOpacity="0.85"
      />
      <line
        x1="34"
        y1="38"
        x2="34"
        y2="52"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <line
        x1="86"
        y1="38"
        x2="86"
        y2="52"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const steps = [
  {
    title: "Connect Steam",
    body: "Sign in with your real Steam account (OpenID 2.0 — Steam doesn’t do OAuth2), then import your owned games in one click.",
  },
  {
    title: "Say how much time you have",
    body: "Tell it how many hours you’re free this week. That number is the knapsack’s capacity.",
  },
  {
    title: "Get a plan, not a list",
    body: "A scheduling engine picks and orders games to maximise variety and finish what you’re already close to completing — explained, not just handed to you.",
  },
];

const features = [
  {
    title: "Greedy vs. exact DP",
    body: "Ships both a fast greedy heuristic and an exact dynamic-programming solver, plus a benchmark script measuring the real gap between them.",
  },
  {
    title: "Genre variety",
    body: "Avoids stacking five shooters into one week — a plan-wide property, not a per-game score.",
  },
  {
    title: "Real progress tracking",
    body: "Mark a session played and the next plan adapts: less time remaining, more credit for what’s nearly finished.",
  },
  {
    title: "Built like production",
    body: "Multi-user auth, per-user data isolation, rate limiting, security headers, CI with real integration tests, and a documented OpenAPI spec.",
  },
];

function LandingPage() {
  return (
    <div className="login-shell">
      <div className="landing">
        <header className="landing-hero">
          <KnapsackIcon />
          <h1>Backlog Tactician</h1>
          <p className="landing-tagline">
            Turn your Steam backlog into an optimised weekly play plan.
          </p>
          <p className="landing-sub">
            Every gamer has 40+ unplayed games and no idea what to actually play
            next. This models that as a <strong>0/1 knapsack problem</strong>{" "}
            instead of a plain list.
          </p>
          <div className="landing-cta">
            <a className="steam-login" href="/auth/steam/login">
              Log in with Steam
            </a>
            <a
              className="landing-secondary-link"
              href="https://github.com/Kelyan05/backlog-tactician"
              target="_blank"
              rel="noreferrer"
            >
              View source on GitHub
            </a>
          </div>
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
        </header>

        <section className="landing-steps">
          {steps.map((step, i) => (
            <div className="step-card" key={step.title}>
              <span className="step-number">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </section>

        <section className="landing-features">
          {features.map((feature) => (
            <div className="feature-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
          ))}
        </section>

        <footer className="landing-footer">
          <a
            href="https://github.com/Kelyan05/backlog-tactician"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/Kelyan05/backlog-tactician/blob/main/openapi.yaml"
            target="_blank"
            rel="noreferrer"
          >
            API reference
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/Kelyan05/backlog-tactician/blob/main/docs/scheduling.md"
            target="_blank"
            rel="noreferrer"
          >
            Scheduling engine design doc
          </a>
        </footer>
      </div>
    </div>
  );
}

export default LandingPage;
