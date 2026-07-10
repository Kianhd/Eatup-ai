/**
 * Stage-3 · G — Edit profile & goals. Pre-fills from ProfileDto, submits via the existing
 * Stage-1 saveProfile (which recomputes targets), and shows a before→after targets diff.
 * Weight/height inputs display in the user's units; values are converted to metric on submit.
 */

import { useState } from "react";
import { saveProfile } from "../../lib/_stage1";
import { useServerFn } from "@tanstack/react-start";
import type {
  ActivityLevel,
  Gender,
  Goal,
  OnboardingInput,
  ProfileDto,
  Speed,
} from "../../lib/dto";
import type { Units } from "../../lib/units";
import {
  cmToFeetInches,
  feetInchesToCm,
  lbToKg,
  round1,
  weightInputValue,
} from "../../lib/units";

type Props = {
  profile: ProfileDto;
  units: Units;
  onSaved: (profile: ProfileDto) => void;
};

const ACTIVITY: ActivityLevel[] = ["sedentary", "light", "moderate", "active"];
const GOALS: Goal[] = ["lose", "gain", "maintain", "recomp", "muscle"];
const SPEEDS: Speed[] = ["slow", "moderate", "fast"];

type Diff = { before: ProfileDto; after: ProfileDto } | null;

export function ProfileForm({ profile, units, onSaved }: Props) {
  const run = useServerFn(saveProfile);
  const imperial = units === "imperial";

  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [gender, setGender] = useState<Gender>(profile.gender);
  const [weight, setWeight] = useState(String(weightInputValue(profile.weightKg, units)));
  const [goalWeight, setGoalWeight] = useState(
    String(weightInputValue(profile.goalWeightKg, units)),
  );
  const initHeight = cmToFeetInches(profile.heightCm);
  const [cm, setCm] = useState(String(Math.round(profile.heightCm)));
  const [feet, setFeet] = useState(String(initHeight.feet));
  const [inches, setInches] = useState(String(initHeight.inches));
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile.activityLevel);
  const [workoutDays, setWorkoutDays] = useState(String(profile.workoutDays));
  const [goal, setGoal] = useState<Goal>(profile.goal);
  const [speed, setSpeed] = useState<Speed>(profile.speed);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<Diff>(null);

  const heightCm = imperial ? feetInchesToCm(Number(feet), Number(inches)) : Number(cm);
  const weightKg = imperial ? lbToKg(Number(weight)) : Number(weight);
  const goalWeightKg = imperial ? lbToKg(Number(goalWeight)) : Number(goalWeight);

  const valid =
    name.trim().length > 0 &&
    isPos(age) &&
    heightCm > 0 &&
    weightKg > 0 &&
    goalWeightKg > 0 &&
    Number(workoutDays) >= 0 &&
    Number(workoutDays) <= 7;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    const input: OnboardingInput = {
      name: name.trim(),
      age: Math.round(Number(age)),
      gender,
      heightCm: round1(heightCm),
      weightKg: round1(weightKg),
      goalWeightKg: round1(goalWeightKg),
      activityLevel,
      workoutDays: Math.round(Number(workoutDays)),
      goal,
      speed,
    };
    try {
      const res = await run({ data: input });
      if (res.ok) {
        setDiff({ before: profile, after: res.profile });
        onSaved(res.profile);
      } else {
        setError(profileErrorCopy(res.code));
      }
    } catch {
      setError("Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="settings-profile"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="settings-section__title">Profile & goals</h2>

      <label className="settings-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="settings-field">
        <span>Age</span>
        <input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
      </label>

      <fieldset className="settings-field settings-field--group">
        <legend>Gender</legend>
        {(["male", "female"] as Gender[]).map((g) => (
          <label key={g} className="settings-radio">
            <input type="radio" name="gender" checked={gender === g} onChange={() => setGender(g)} />
            {g}
          </label>
        ))}
      </fieldset>

      <label className="settings-field">
        <span>Weight ({imperial ? "lb" : "kg"})</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </label>

      <label className="settings-field">
        <span>Goal weight ({imperial ? "lb" : "kg"})</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={goalWeight}
          onChange={(e) => setGoalWeight(e.target.value)}
        />
      </label>

      {imperial ? (
        <div className="settings-field settings-field--height">
          <span>Height</span>
          <div className="settings-height-imperial">
            <input type="number" inputMode="numeric" value={feet} onChange={(e) => setFeet(e.target.value)} aria-label="Feet" />
            <span>ft</span>
            <input type="number" inputMode="numeric" value={inches} onChange={(e) => setInches(e.target.value)} aria-label="Inches" />
            <span>in</span>
          </div>
        </div>
      ) : (
        <label className="settings-field">
          <span>Height (cm)</span>
          <input type="number" inputMode="numeric" value={cm} onChange={(e) => setCm(e.target.value)} />
        </label>
      )}

      <label className="settings-field">
        <span>Activity level</span>
        <select value={activityLevel} onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}>
          {ACTIVITY.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-field">
        <span>Workout days / week</span>
        <input type="number" inputMode="numeric" min={0} max={7} value={workoutDays} onChange={(e) => setWorkoutDays(e.target.value)} />
      </label>

      <label className="settings-field">
        <span>Goal</span>
        <select value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
          {GOALS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-field">
        <span>Pace</span>
        <select value={speed} onChange={(e) => setSpeed(e.target.value as Speed)}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="settings-profile__error" role="alert">{error}</p>}

      <button type="submit" className="settings-profile__save" disabled={!valid || saving}>
        {saving ? "Saving…" : "Save changes"}
      </button>

      {diff && <TargetsDiff before={diff.before} after={diff.after} />}
    </form>
  );
}

function TargetsDiff({ before, after }: { before: ProfileDto; after: ProfileDto }) {
  const rows: Array<[string, keyof ProfileDto, string]> = [
    ["Calories", "calorieTarget", "kcal"],
    ["Protein", "proteinTarget", "g"],
    ["Carbs", "carbsTarget", "g"],
    ["Fat", "fatTarget", "g"],
  ];
  return (
    <div className="settings-diff" aria-live="polite">
      <h3 className="settings-diff__title">Updated targets</h3>
      <ul className="settings-diff__list">
        {rows.map(([label, key, unit]) => {
          const b = before[key] as number;
          const a = after[key] as number;
          const d = a - b;
          return (
            <li key={key} className="settings-diff__row tabular-nums">
              <span className="settings-diff__label">{label}</span>
              <span className="settings-diff__values">
                {b} → {a} {unit}
                {d !== 0 && (
                  <span className={`settings-diff__delta settings-diff__delta--${d > 0 ? "up" : "down"}`}>
                    {d > 0 ? "+" : ""}
                    {d}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function isPos(s: string): boolean {
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

function profileErrorCopy(code: string): string {
  switch (code) {
    case "unauthorized":
      return "Please sign in again to update your profile.";
    case "invalid":
      return "Some values look off — double-check and try again.";
    default:
      return "Couldn't save your profile. Please try again.";
  }
}
