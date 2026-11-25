"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteDealAction } from "../actions";

/** Two-step delete with an inline confirmation (no browser dialog). */
export function DeleteDealButton({ dealId }: { dealId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Delete this deal and its deliverables?</span>
      <Button
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteDealAction(dealId);
            setError(result?.errors?.form);
          })
        }
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
