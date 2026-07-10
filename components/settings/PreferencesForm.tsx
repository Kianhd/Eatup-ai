/**
 * Stage-3 · G — Units toggle (display-only) + reminder preferences. Persists to the
 * settings table via saveSettings. Optimistic with rollback on failure.
 */

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveSettings, type SettingsDto } from "../../lib/settings.server";
import type { Units } from "../../lib/units";

type Props = {
  settings: SettingsDto;
  onChange: (next: SettingsDto) => void;
};

const REMINDERS: Array<{ key: keyof SettingsDto; label: string }> = [
  { key: "remindMeals", label: "Meal reminders" },
  { key: "remindWater", label: "Water reminders" },
  { key: "remindProtein", label: "Protein reminders" },
  { key: "remindWeighin", label: "Weigh-in reminders" },
];

export function PreferencesForm({ settings, onChange }: Props) {
  const run = useServerFn(saveSettings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function persist(patch: Partial<SettingsDto>) {
    const optimistic = { ...settings, ...patch };
    onChange(optimistic); // optimistic
    setBusy(true);
    setError(null);
    try {
      const saved = await run({ data: patch });
      onChange(saved); // reconcile with server truth
    } catch {
      onChange(settings); // rollback
      setError("Couldn't save that preference. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-prefs">
      <h2 className="settings-section__title">Preferences</h2>

      <div className="settings-field settings-field--units">
        <span>Units</span>
        <div className="settings-units-toggle" role="group" aria-label="Units">
          {(["metric", "imperial"] as Units[]).map((u) => (
            <button
              key={u}
              type="button"
              className={`settings-units-toggle__option${
                settings.units === u ? " settings-units-toggle__option--active" : ""
              }`}
              aria-pressed={settings.units === u}
              disabled={busy}
              onClick={() => settings.units !== u && void persist({ units: u })}
            >
              {u === "metric" ? "Metric (kg, cm)" : "Imperial (lb, ft)"}
            </button>
          ))}
        </div>
      </div>

      <ul className="settings-reminders">
        {REMINDERS.map(({ key, label }) => {
          const checked = settings[key] as boolean;
          return (
            <li key={key} className="settings-reminders__row">
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={(e) => void persist({ [key]: e.target.checked } as Partial<SettingsDto>)}
                />
                <span>{label}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && <p className="settings-prefs__error" role="alert">{error}</p>}
    </section>
  );
}
