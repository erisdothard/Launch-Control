"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { controlCampaignAction } from "@/app/(admin)/admin/campaigns/actions";
import { Spinner } from "./ui";

interface CampaignControlsProps {
  id: string;
  status: string;
  hasFollowUp: boolean;
  demo: boolean;
}

// Pause, resume, cancel, duplicate; continue or delete a draft. Every stop asks first.
export default function CampaignControls({ id, status, hasFollowUp, demo }: CampaignControlsProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const q = demo ? "&demo=1" : "";

  function run(action: "pause" | "resume" | "cancel" | "delete_draft", question?: string) {
    if (question && !confirm(question)) return;
    setError("");
    if (demo) {
      setError("Demo mode: nothing changes.");
      return;
    }
    start(async () => {
      const result = await controlCampaignAction(id, action);
      if (!result.ok) setError(result.error);
      else if (action === "delete_draft") router.push("/admin/campaigns");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-3">
        {status === "draft" && (
          <>
            <Link href={`/admin/campaigns/new?from=${id}${q}`} className="btn btn-primary">
              Finish and send
            </Link>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run("delete_draft", "Delete this draft? This can't be undone.")}>
              Delete draft
            </button>
          </>
        )}
        {(status === "sending" || status === "scheduled") && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run("pause")}>
            {pending && <Spinner />}
            Pause
          </button>
        )}
        {status === "paused" && (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run("resume")}>
            {pending && <Spinner />}
            Resume sending
          </button>
        )}
        {(status === "sending" || status === "scheduled" || status === "paused") && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run("cancel", "Cancel this campaign? Nobody else will get it, including follow-ups. Emails already sent stay sent.")}
          >
            Cancel
          </button>
        )}
        {status === "sent" && hasFollowUp && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => run("cancel", "Stop the automatic follow-ups? Nobody else will get one.")}
          >
            Stop follow-ups
          </button>
        )}
        {status !== "draft" && (
          <Link href={`/admin/campaigns/new?from=${id}${q}`} className="btn btn-secondary">
            Duplicate as new
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[15px] text-[var(--color-hot)]">
          {error}
        </p>
      )}
    </div>
  );
}

/** Keeps a sending campaign's numbers current without a manual reload. */
export function AutoRefresh({ every = 15_000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
