"use client";

import { useActionState } from "react";
import { Field, selectClass, TextField } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { createWorkspaceAction, type OnboardingState } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createWorkspaceAction, {});
  return (
    <form action={action} className="grid gap-4" noValidate>
      <TextField
        label="Workspace name"
        name="name"
        required
        placeholder="Your name or your agency's name"
        defaultValue={state.values?.name}
        error={state.errors?.name}
      />
      <Field label="I'm setting this up as" name="type" error={state.errors?.type}>
        <select id="type" name="type" className={selectClass} defaultValue={state.values?.type ?? "CREATOR"}>
          <option value="CREATOR">A creator (my own deals)</option>
          <option value="AGENCY">A talent manager or agency (many creators)</option>
        </select>
      </Field>
      <TextField
        label="GST state code (optional)"
        name="stateCode"
        inputMode="numeric"
        maxLength={2}
        placeholder="07"
        hint="Decides CGST + SGST vs IGST on invoices. Delhi is 07, Maharashtra 27."
        defaultValue={state.values?.stateCode}
        error={state.errors?.stateCode}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
