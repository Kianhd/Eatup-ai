/**
 * Stage-3 · G — "Export my data" (JSON download) and "Delete my data" (type-DELETE-to-confirm).
 * Export builds a Blob URL client-side. Delete returns R2 photoKeys for the integrator to purge.
 */

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { exportData, deleteAccountData } from "../../lib/settings.server";

type Props = {
  /** Called after a successful delete with the R2 keys the integrator should purge. */
  onDeleted: (photoKeys: string[]) => void;
};

const CONFIRM_WORD = "DELETE";

export function DataControls({ onDeleted }: Props) {
  const runExport = useServerFn(exportData);
  const runDelete = useServerFn(deleteAccountData);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function doExport() {
    setExporting(true);
    setExportError(null);
    try {
      const bundle = await runExport({});
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "eatup-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Couldn't export your data. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function doDelete() {
    if (confirm !== CONFIRM_WORD) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await runDelete({});
      if (res.ok) onDeleted(res.photoKeys);
      else setDeleteError("Delete failed. Please try again.");
    } catch {
      setDeleteError("Delete failed. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="settings-data">
      <h2 className="settings-section__title">Your data</h2>

      <div className="settings-data__export">
        <div>
          <h3 className="settings-data__label">Export my data</h3>
          <p className="settings-data__hint">Download everything as a JSON file.</p>
        </div>
        <button type="button" className="settings-data__btn" onClick={() => void doExport()} disabled={exporting}>
          {exporting ? "Preparing…" : "Export"}
        </button>
      </div>
      {exportError && <p className="settings-data__error" role="alert">{exportError}</p>}

      <div className="settings-data__danger">
        <h3 className="settings-data__label">Delete my data</h3>
        <p className="settings-data__hint">
          This permanently removes your profile, meals, photos, and history. This can't be undone.
        </p>
        <label className="settings-field">
          <span>
            Type <strong>{CONFIRM_WORD}</strong> to confirm
          </span>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoCapitalize="characters"
            aria-label={`Type ${CONFIRM_WORD} to confirm deletion`}
          />
        </label>
        <button
          type="button"
          className="settings-data__btn settings-data__btn--danger"
          onClick={() => void doDelete()}
          disabled={confirm !== CONFIRM_WORD || deleting}
        >
          {deleting ? "Deleting…" : "Delete everything"}
        </button>
        {deleteError && <p className="settings-data__error" role="alert">{deleteError}</p>}
      </div>
    </section>
  );
}
