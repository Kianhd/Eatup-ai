/**
 * Stage-3 · G — Settings screen orchestrator. Loads settings, renders the profile form,
 * preferences, and data controls. Loading / error states for the settings fetch.
 *
 * INTEGRATION: pass the current ProfileDto (from bootstrap). onProfileSaved lets the shell
 * refresh targets; onDeleted hands back R2 keys to purge after account deletion.
 */

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSettings, type SettingsDto } from "../../lib/settings.server";
import type { ProfileDto } from "../../lib/dto";
import { ProfileForm } from "./ProfileForm";
import { PreferencesForm } from "./PreferencesForm";
import { DataControls } from "./DataControls";

type Props = {
  profile: ProfileDto | null;
  onClose: () => void;
  onProfileSaved: (profile: ProfileDto) => void;
  onDeleted: (photoKeys: string[]) => void;
};

export function SettingsScreen({ profile, onClose, onProfileSaved, onDeleted }: Props) {
  const load = useServerFn(getSettings);
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await load({});
        if (alive) setSettings(s);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  return (
    <main className="settings-screen">
      <header className="settings-screen__header">
        <h1 className="settings-screen__title">Settings</h1>
        <button type="button" className="settings-screen__close" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </header>

      {failed && (
        <p className="settings-screen__error">Couldn't load your settings. Please reopen this screen.</p>
      )}

      {!failed && settings === null && (
        <div className="settings-screen__loading" aria-busy="true">
          <span className="settings-skeleton" />
          <span className="settings-skeleton" />
        </div>
      )}

      {settings && (
        <>
          {profile ? (
            <ProfileForm profile={profile} units={settings.units} onSaved={onProfileSaved} />
          ) : (
            <p className="settings-screen__no-profile">Finish onboarding to edit your profile.</p>
          )}

          <PreferencesForm settings={settings} onChange={setSettings} />

          <DataControls onDeleted={onDeleted} />
        </>
      )}
    </main>
  );
}
