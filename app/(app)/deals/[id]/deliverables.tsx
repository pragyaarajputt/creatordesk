"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, selectClass, TextField } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { DELIVERABLE_FORMATS, DELIVERABLE_STATUSES, PLATFORMS } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { addDeliverableAction, setDeliverableStatusAction, type FormState } from "../actions";

const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace("_", " ");

export function AddDeliverableForm({ dealId }: { dealId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addDeliverableAction.bind(null, dealId), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]" noValidate>
      <Field label="Platform" name="platform" error={e.platform}>
        <select id="platform" name="platform" className={selectClass} defaultValue={state.values?.platform ?? "INSTAGRAM"}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p === "X" ? "X" : label(p)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Format" name="format" error={e.format}>
        <select id="format" name="format" className={selectClass} defaultValue={state.values?.format ?? "REEL"}>
          {DELIVERABLE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {label(f)}
            </option>
          ))}
        </select>
      </Field>
      <TextField label="Due date" name="dueDate" type="date" defaultValue={state.values?.dueDate} error={e.dueDate} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      {e.form && <p className="text-xs text-destructive sm:col-span-4">{e.form}</p>}
    </form>
  );
}

export function DeliverableStatusSelect({
  deliverableId,
  status,
  disabled,
}: {
  deliverableId: string;
  status: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <>
      <select
        aria-label="Deliverable status"
        className={cn(selectClass, "h-7 w-36 text-xs")}
        defaultValue={status}
        disabled={disabled || pending}
        onChange={(ev) => {
          const next = ev.target.value;
          startTransition(async () => {
            const result = await setDeliverableStatusAction(deliverableId, next);
            setError(result.errors?.form);
          });
        }}
      >
        {DELIVERABLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {label(s)}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </>
  );
}
