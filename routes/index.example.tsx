/**
 * Stage-3 · J — App shell wiring REFERENCE (not the final route).
 *
 * Shows the main-screen state machine and how the Stage-1/2/3 pieces compose:
 *   loading skeleton → Landing (signed out) → Onboarding (no profile) → Dashboard
 * Dashboard = DashboardCard + SuggestionsStrip [D] + DailyRecapCard [B] + NudgeBanner [H]
 *             + meal timeline + floating dock (chat / camera / settings), with the
 *             LogMealFlow [E], SettingsScreen [G], and CheckinModal [C] overlays.
 *
 * The CLIENT is the source of `day`. Bootstrap refetches on day change and window refocus.
 * The integrator merges this into the real index route.
 *
 * INTEGRATION: paths marked "// Stage-1" / "// TODO" point at existing app pieces — repoint
 * them. `lastWeightLoggedAt` isn't in the bootstrap contract; supply it (extend bootstrap or
 * a small query) or the weigh-in nudge will treat the user as never-weighed.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getBootstrap } from "../lib/_stage1";
import { getSettings, type SettingsDto } from "../lib/settings.server";
import { useLocalDay } from "../lib/useLocalDay";
import { computeNudge, type NudgeAction } from "../lib/nudges";
import type { BootstrapResult, MealDto, ProfileDto } from "../lib/dto";

import { Landing } from "../components/Landing";
import { LogMealFlow } from "../components/capture/LogMealFlow";
import { SettingsScreen } from "../components/settings/SettingsScreen";
import { NudgeBanner } from "../components/NudgeBanner";
import { SuggestionsStrip } from "../components/SuggestionsStrip"; // Stage 2 · D
import { DailyRecapCard } from "../components/DailyRecapCard"; // Stage 2 · B
import { CheckinModal } from "../components/CheckinModal"; // Stage 2 · C

// ── Existing Stage-1 components — repoint these imports ──────────────────────
import { Onboarding } from "~/components/Onboarding"; // Stage-1
import { DashboardCard } from "~/components/DashboardCard"; // Stage-1
import { MealTimeline } from "~/components/MealTimeline"; // Stage-1

export const Route = createFileRoute("/")({
  component: AppShell,
});

type Status = "loading" | "ready" | "error";

function AppShell() {
  const day = useLocalDay();
  const runBootstrap = useServerFn(getBootstrap);
  const runSettings = useServerFn(getSettings);

  const [status, setStatus] = useState<Status>("loading");
  const [boot, setBoot] = useState<BootstrapResult | null>(null);
  const [settings, setSettings] = useState<SettingsDto | null>(null);

  const [capturing, setCapturing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);

  // INTEGRATION: most recent weight_log day; wire from your data. null ⇒ "never weighed".
  const lastWeightLoggedAt: string | null = null;

  const load = useCallback(
    async (silent = false) => {
      if (!day) return;
      if (!silent) setStatus("loading");
      try {
        const res = await runBootstrap({ data: { day } });
        setBoot(res);
        setStatus("ready");
        if (res.signedIn) {
          // Settings power the nudges; load once we know the user is signed in.
          runSettings({}).then(setSettings).catch(() => setSettings(null));
        }
      } catch {
        setStatus("error");
      }
    },
    [day, runBootstrap, runSettings],
  );

  // Refetch on day change.
  useEffect(() => {
    void load();
  }, [load]);

  // Silent refetch on window refocus.
  useEffect(() => {
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const signedIn = boot?.signedIn === true;
  const profile = signedIn ? boot.profile : null;
  const meals = signedIn ? boot.meals : [];
  const totals = signedIn ? boot.totals : null;

  const nudge = useMemo(() => {
    if (!profile || !totals || !settings || !day) return null;
    return computeNudge({
      now: new Date(),
      profile,
      totals,
      meals,
      settings,
      lastWeightLoggedAt,
    });
  }, [profile, totals, settings, meals, day, lastWeightLoggedAt]);

  const onNudgeAction = useCallback((action: NudgeAction) => {
    if (action === "open-capture") setCapturing(true);
    if (action === "open-checkin") setCheckinOpen(true);
  }, []);

  const onLogged = useCallback(
    (_meal: MealDto) => {
      setCapturing(false);
      void load(true); // refresh totals + timeline
    },
    [load],
  );

  // ── Render states ──────────────────────────────────────────────────────────
  if (status === "loading" || !day) return <DashboardSkeleton />;

  if (status === "error") {
    return (
      <main className="app-shell app-shell--error">
        <p>Something went wrong loading your day.</p>
        <button type="button" onClick={() => void load()}>
          Retry
        </button>
      </main>
    );
  }

  if (!signedIn) {
    // INTEGRATION: wire onSignIn to your real auth entry point.
    return <Landing onSignIn={() => (window.location.href = "/api/auth/signin")} />;
  }

  if (!profile) {
    // Stage-1 onboarding wizard; on completion, refetch.
    return <Onboarding onComplete={() => void load(true)} />;
  }

  return (
    <main className="app-shell">
      <DashboardCard profile={profile} totals={totals} />

      {/* Suggestions strip sits under the macro bars; refresh when meal count changes. */}
      <SuggestionsStrip day={day} refreshKey={meals.length} />

      <NudgeBanner nudge={nudge} onAction={onNudgeAction} />

      <DailyRecapCard day={day} />

      <MealTimeline meals={meals} />

      {/* Floating dock */}
      <nav className="app-dock" aria-label="Primary">
        <Link to="/chat" className="app-dock__btn app-dock__btn--chat">
          Coach
        </Link>
        <button
          type="button"
          className="app-dock__btn app-dock__btn--camera"
          onClick={() => setCapturing(true)}
          aria-label="Log a meal"
        >
          ＋
        </button>
        <button
          type="button"
          className="app-dock__btn app-dock__btn--settings"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
        >
          ⚙
        </button>
      </nav>

      {/* Overlays */}
      {capturing && (
        <LogMealFlow day={day} onLogged={onLogged} onClose={() => setCapturing(false)} />
      )}

      {settingsOpen && (
        <SettingsScreen
          profile={profile}
          onClose={() => setSettingsOpen(false)}
          onProfileSaved={() => void load(true)}
          onDeleted={() => {
            setSettingsOpen(false);
            void load(); // back to signed-out/onboarding after wipe
          }}
        />
      )}

      <CheckinModal
        open={checkinOpen}
        day={day}
        initialWeightKg={profile.weightKg}
        onClose={() => setCheckinOpen(false)}
        onSaved={() => void load(true)}
      />
    </main>
  );
}

function DashboardSkeleton() {
  return (
    <main className="app-shell app-shell--loading" aria-busy="true">
      <div className="app-skeleton app-skeleton--ring" />
      <div className="app-skeleton app-skeleton--bars" />
      <div className="app-skeleton app-skeleton--card" />
    </main>
  );
}
