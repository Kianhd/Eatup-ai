/**
 * Stage-3 · I — Signed-out landing screen. Rendered when bootstrap says signedIn:false.
 * Premium, minimal, copy-first — no fake screenshots or stock imagery, just structure + copy.
 * The integrator styles it; `onSignIn` wires to the real auth entry point.
 */

type Props = { onSignIn: () => void };

const FEATURES = [
  {
    title: "Snap a photo → full macros",
    body: "Point your camera at any meal. Calories, protein, carbs, fat, and fiber — estimated in seconds.",
  },
  {
    title: "A coach that knows you",
    body: "Chat with a coach that sees your goals, your day, and your history — and answers like it.",
  },
  {
    title: "Zero manual tracking",
    body: "No databases to search, no portions to weigh. Just eat, snap, and keep moving.",
  },
] as const;

const STEPS = [
  { n: 1, label: "Set your goal" },
  { n: 2, label: "Photograph meals" },
  { n: 3, label: "Get coached daily" },
] as const;

export function Landing({ onSignIn }: Props) {
  return (
    <main className="landing">
      <section className="landing__hero">
        <p className="landing__brand">Eatup</p>
        <h1 className="landing__tagline">Eat. Track. Grow.</h1>
        <p className="landing__pitch">
          Your AI nutrition coach. Photograph a meal and get full macros plus a personal nudge —
          no manual logging, ever.
        </p>
        <button type="button" className="landing__cta" onClick={onSignIn}>
          Get started
        </button>
      </section>

      <section className="landing__features" aria-label="What Eatup does">
        {FEATURES.map((f) => (
          <div key={f.title} className="landing__feature">
            <h2 className="landing__feature-title">{f.title}</h2>
            <p className="landing__feature-body">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="landing__how" aria-label="How it works">
        <h2 className="landing__how-title">How it works</h2>
        <ol className="landing__steps">
          {STEPS.map((s) => (
            <li key={s.n} className="landing__step">
              <span className="landing__step-n tabular-nums">{s.n}</span>
              <span className="landing__step-label">{s.label}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="landing__footer">
        <button type="button" className="landing__cta landing__cta--footer" onClick={onSignIn}>
          Start with a photo
        </button>
      </footer>
    </main>
  );
}
