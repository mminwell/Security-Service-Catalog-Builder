"use client";

import { useEffect, useState } from "react";
import {
  browserPromptStore,
  dismissProfilePrompt,
  isProfilePromptDismissed,
  profileIsIncomplete,
} from "@/lib/auth/profile";
import { useCatalog } from "@/components/catalog-provider";
import { ProfileForm } from "@/components/profile-form";

/**
 * Shown once after sign-in when an older account has no first or last name.
 * Not now hides it for this tab. Profile in the account menu stays available.
 */
export function CompleteProfilePrompt() {
  const api = useCatalog();
  const session = api.session;
  const [dismissed, setDismissed] = useState(() => {
    const store = browserPromptStore();
    const userId = session?.userId;
    return Boolean(userId && store && isProfilePromptDismissed(store, userId));
  });

  const userId = session?.userId ?? null;
  const incomplete = session ? profileIsIncomplete(session) : false;

  useEffect(() => {
    if (!userId || dismissed || !incomplete) return;
    const accountId = userId;
    document.getElementById("prompt-first-name")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const store = browserPromptStore();
      if (store) dismissProfilePrompt(store, accountId);
      setDismissed(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismissed, incomplete, userId]);

  if (!session || dismissed || !profileIsIncomplete(session)) return null;

  function notNow() {
    if (!session) return;
    const store = browserPromptStore();
    if (store) dismissProfilePrompt(store, session.userId);
    setDismissed(true);
  }

  return (
    <div className="modal-backdrop confirm-layer" role="presentation" onMouseDown={notNow}>
      <div
        className="modal-card profile-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="micro">Account</p>
        <h2 id="complete-profile-title">Complete your profile</h2>
        <p className="lede">Add your name so the header can show it. You can edit this later from Profile.</p>
        <ProfileForm
          idPrefix="prompt"
          initial={{
            firstName: session.firstName ?? "",
            lastName: session.lastName ?? "",
            company: session.company ?? "",
          }}
          submitLabel="Save profile"
          onSubmit={api.saveProfile}
        />
        <div className="row-actions">
          <button type="button" className="btn btn-ghost" onClick={notNow}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
