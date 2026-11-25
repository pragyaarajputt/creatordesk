"use client";

import { useState, useTransition } from "react";
import { selectClass } from "@/components/app/field";
import { DEAL_STAGES, STAGE_LABEL } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { moveStageAction } from "./actions";

export function StageSelect({ dealId, stage, disabled }: { dealId: string; stage: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="grid gap-1">
      <select
        aria-label="Deal stage"
        className={cn(selectClass, "h-7 text-xs")}
        defaultValue={stage}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            const result = await moveStageAction(dealId, next);
            setError(result.errors?.form);
          });
        }}
      >
        {DEAL_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
