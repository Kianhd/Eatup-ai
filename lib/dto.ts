/**
 * Client-safe DTO types shared across Stage 3 (no server imports, no runtime code).
 * Mirrors the Stage-1 backend contract exactly. Reused by both server fns and components.
 */

export type Gender = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";
export type Goal = "lose" | "gain" | "maintain" | "recomp" | "muscle";
export type Speed = "slow" | "moderate" | "fast";

export type ProfileDto = {
  name: string;
  age: number;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  activityLevel: ActivityLevel;
  workoutDays: number;
  goal: Goal;
  speed: Speed;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  waterTarget: number;
};

/** The subset the onboarding/edit form submits (targets are recomputed server-side). */
export type OnboardingInput = {
  name: string;
  age: number;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  activityLevel: ActivityLevel;
  workoutDays: number;
  goal: Goal;
  speed: Speed;
};

export type MealItem = { name: string; grams: number; calories: number };

export type MealDto = {
  id: string;
  day: string; // YYYY-MM-DD
  loggedAt: string; // ISO
  photoUrl: string | null;
  note: string | null;
  title: string;
  items: MealItem[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: number; // 0..1
  coaching: string;
};

export type DayTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water: number;
};

export type ChatMessageDto = {
  id: string;
  role: "user" | "model";
  content: string;
  createdAt: string; // ISO
};

/* ── Backend result unions (Stage-1 contract) ──────────────────────────────── */

export type BootstrapResult =
  | { signedIn: false }
  | {
      signedIn: true;
      profile: ProfileDto | null;
      meals: MealDto[];
      totals: DayTotals;
    };

export type SaveProfileResult =
  | { ok: true; profile: ProfileDto; explanation: string; etaWeeks: number | null }
  | { ok: false; code: string };

export type SetWaterResult = { ok: boolean; glasses: number };
export type DeleteMealResult = { ok: boolean };
export type GetChatResult = { messages: ChatMessageDto[] };

export type SendChatResult =
  | { ok: true; reply: ChatMessageDto }
  | {
      ok: false;
      code: "unauthorized" | "rate_limit" | "missing_key" | "error";
      message: string;
    };

export type AnalyzeMealResult =
  | { ok: true; meal: MealDto }
  | {
      ok: false;
      code:
        | "no_food"
        | "rate_limit"
        | "missing_key"
        | "no_profile"
        | "photo_too_large"
        | "error";
      message?: string;
    };
