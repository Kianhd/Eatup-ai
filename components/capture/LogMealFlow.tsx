/**
 * Stage-3 · E — Meal capture flow. The app's most important interaction.
 *
 * <LogMealFlow day onLogged onClose /> — a self-contained state machine:
 *   entry → preview → (uploading → analyzing) → success(onLogged) | error
 *
 * - Two triggers: camera (capture="environment") and gallery (same input, no capture).
 * - Downscales client-side (lib/image.ts) before upload.
 * - Distinct uploading/analyzing copy; typed error handling (no_food keeps the photo).
 * - Abortable: closing mid-analysis cancels the request.
 *
 * Placeholder classNames only — integrator maps styling.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeMeal, isAbort } from "../../lib/_stage1";
import { downscaleImage } from "../../lib/image";
import type { AnalyzeMealResult, MealDto } from "../../lib/dto";

type Props = {
  day: string; // user-local YYYY-MM-DD
  onLogged: (meal: MealDto) => void;
  onClose: () => void;
};

type ErrorCode = Extract<AnalyzeMealResult, { ok: false }>["code"] | "decode_failed";

type Phase =
  | { step: "entry" }
  | { step: "preparing" } // decoding + downscaling the chosen file
  | { step: "preview" }
  | { step: "uploading" }
  | { step: "analyzing" }
  | { step: "error"; code: ErrorCode };

const NOTE_MAX = 500;
const NOTE_CHIPS = ["Only ate half", "Extra olive oil", "No sugar", "Made with milk"] as const;

export function LogMealFlow({ day, onLogged, onClose }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const uploadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>({ step: "entry" });
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const inFlight = phase.step === "uploading" || phase.step === "analyzing";

  // Cleanup: revoke object URL + abort any in-flight request on unmount.
  useEffect(() => {
    return () => {
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
      abortRef.current?.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const setPreview = useCallback((blob: Blob) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setPhoto(blob);
    setPreviewUrl(url);
  }, []);

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setPhase({ step: "preparing" });
      try {
        const { blob } = await downscaleImage(file);
        setPreview(blob);
        setPhase({ step: "preview" });
      } catch {
        setPhase({ step: "error", code: "decode_failed" });
      }
    },
    [setPreview],
  );

  const submit = useCallback(async () => {
    if (!photo) return;
    const controller = new AbortController();
    abortRef.current = controller;

    // Approximate the upload→analyze transition (fetch gives no upload progress):
    // show "uploading" first, flip to "analyzing" once bytes are plausibly sent.
    setPhase({ step: "uploading" });
    uploadTimerRef.current = setTimeout(() => {
      setPhase((p) => (p.step === "uploading" ? { step: "analyzing" } : p));
    }, 1100);

    try {
      const result = await analyzeMeal(
        photo,
        { note: note.trim().slice(0, NOTE_MAX), day, loggedAt: new Date().toISOString() },
        controller.signal,
      );
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);

      if (result.ok) {
        onLogged(result.meal);
        return;
      }
      setPhase({ step: "error", code: result.code });
    } catch (err) {
      if (uploadTimerRef.current) clearTimeout(uploadTimerRef.current);
      if (isAbort(err)) return; // user closed mid-flight; nothing to show
      setPhase({ step: "error", code: "error" });
    } finally {
      abortRef.current = null;
    }
  }, [photo, note, day, onLogged]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    onClose();
  }, [onClose]);

  const appendChip = useCallback((chip: string) => {
    setNote((prev) => {
      if (prev.toLowerCase().includes(chip.toLowerCase())) return prev;
      const joined = prev.trim() ? `${prev.trim()}. ${chip}` : chip;
      return joined.slice(0, NOTE_MAX);
    });
  }, []);

  return (
    <div className="capture" role="dialog" aria-modal="true" aria-label="Log a meal">
      <div className="capture__backdrop" onClick={inFlight ? undefined : close} />
      <div className="capture__panel">
        <button
          type="button"
          className="capture__close"
          onClick={close}
          aria-label={inFlight ? "Cancel analysis and close" : "Close"}
        >
          ✕
        </button>

        {/* Hidden inputs shared by all steps so retake works from anywhere. */}
        <input
          ref={cameraRef}
          className="capture__file"
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <input
          ref={galleryRef}
          className="capture__file"
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />

        {phase.step === "entry" && (
          <div className="capture__entry">
            <h2 className="capture__title">Log a meal</h2>
            <p className="capture__subtitle">Snap your plate — we'll do the macros.</p>
            <div className="capture__triggers">
              <button
                type="button"
                className="capture__trigger capture__trigger--camera"
                onClick={() => cameraRef.current?.click()}
              >
                Take photo
              </button>
              <button
                type="button"
                className="capture__trigger capture__trigger--gallery"
                onClick={() => galleryRef.current?.click()}
              >
                From gallery
              </button>
            </div>
          </div>
        )}

        {phase.step === "preparing" && (
          <div className="capture__preparing" aria-busy="true">
            <p className="capture__status">Getting your photo ready…</p>
          </div>
        )}

        {(phase.step === "preview" ||
          phase.step === "uploading" ||
          phase.step === "analyzing" ||
          phase.step === "error") &&
          previewUrl && (
            <div className="capture__preview">
              <img className="capture-preview" src={previewUrl} alt="Your meal" />

              {phase.step === "preview" && (
                <>
                  <label className="capture__note-label" htmlFor="capture-note">
                    Add a note (optional)
                  </label>
                  <textarea
                    id="capture-note"
                    className="capture__note"
                    value={note}
                    maxLength={NOTE_MAX}
                    placeholder="Anything the photo doesn't show…"
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                  />
                  <div className="capture__chips">
                    {NOTE_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="capture__chip"
                        onClick={() => appendChip(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <div className="capture__actions">
                    <button
                      type="button"
                      className="capture__retake"
                      onClick={() => galleryRef.current?.click()}
                    >
                      Retake
                    </button>
                    <button
                      type="button"
                      className="capture__submit"
                      onClick={() => void submit()}
                    >
                      Log this meal
                    </button>
                  </div>
                </>
              )}

              {(phase.step === "uploading" || phase.step === "analyzing") && (
                <div className="capture__progress" aria-busy="true" aria-live="polite">
                  <span className="capture__spinner" aria-hidden="true" />
                  <p className="capture__status">
                    {phase.step === "uploading" ? "Uploading your photo…" : "Reading your plate…"}
                  </p>
                </div>
              )}

              {phase.step === "error" && (
                <CaptureError
                  code={phase.code}
                  onRetry={() => void submit()}
                  onRetake={() => galleryRef.current?.click()}
                />
              )}
            </div>
          )}

        {phase.step === "error" && !previewUrl && (
          <CaptureError
            code={phase.code}
            onRetry={() => setPhase({ step: "entry" })}
            onRetake={() => galleryRef.current?.click()}
          />
        )}
      </div>
    </div>
  );
}

function CaptureError({
  code,
  onRetry,
  onRetake,
}: {
  code: ErrorCode;
  onRetry: () => void;
  onRetake: () => void;
}) {
  const { message, primary } = errorCopy(code);
  return (
    <div className="capture__error" role="alert">
      <p className="capture__error-msg">{message}</p>
      <div className="capture__actions">
        {code === "no_food" || code === "photo_too_large" || code === "decode_failed" ? (
          <button type="button" className="capture__submit" onClick={onRetake}>
            {primary}
          </button>
        ) : (
          <button type="button" className="capture__submit" onClick={onRetry}>
            {primary}
          </button>
        )}
      </div>
    </div>
  );
}

function errorCopy(code: ErrorCode): { message: string; primary: string } {
  switch (code) {
    case "no_food":
      return {
        message: "Hmm, we couldn't spot any food. Try a clearer, closer shot of your plate.",
        primary: "Retake photo",
      };
    case "rate_limit":
      return {
        message: "Our coach is a little busy. Give it a minute and try again.",
        primary: "Try again",
      };
    case "photo_too_large":
      return {
        message: "That image was too large even after shrinking. Try another photo.",
        primary: "Choose another",
      };
    case "no_profile":
      return {
        message: "Finish setting up your profile first, then log your meal.",
        primary: "Try again",
      };
    case "missing_key":
      return {
        message: "Meal analysis is temporarily unavailable. Please try again shortly.",
        primary: "Try again",
      };
    case "decode_failed":
      return { message: "We couldn't read that image. Try a different photo.", primary: "Choose another" };
    default:
      return { message: "Something went wrong analyzing your meal.", primary: "Try again" };
  }
}
