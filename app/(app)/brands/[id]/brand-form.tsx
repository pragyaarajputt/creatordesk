"use client";

import { useActionState } from "react";
import { Field, TextField } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/action-result";
import { updateBrandAction } from "../../settings/actions";

export interface BrandDefaults {
  name: string;
  gstin: string;
  stateCode: string;
  address: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
}

export function BrandForm({ brandId, defaults, canEdit }: { brandId: string; defaults: BrandDefaults; canEdit: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateBrandAction.bind(null, brandId), {});
  const v = { ...defaults, ...state.values };
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid max-w-2xl gap-4" noValidate>
      {e.form && <p role="alert" className="text-sm text-destructive">{e.form}</p>}
      {state.ok && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        <TextField label="Brand name" name="name" defaultValue={v.name} error={e.name} />
        <TextField label="GSTIN" name="gstin" defaultValue={v.gstin} placeholder="27ABCDE1234F1Z5" error={e.gstin} />
        <TextField label="GST state code" name="stateCode" maxLength={2} defaultValue={v.stateCode} hint="Filled from the GSTIN if blank. Decides IGST vs CGST + SGST." error={e.stateCode} />
        <TextField label="Contact person" name="contactName" defaultValue={v.contactName} error={e.contactName} />
        <TextField label="Contact email" name="contactEmail" type="email" defaultValue={v.contactEmail} error={e.contactEmail} />
        <TextField label="Contact WhatsApp number" name="contactPhone" inputMode="tel" defaultValue={v.contactPhone} placeholder="98765 43210" error={e.contactPhone} />
        <Field label="Billing address" name="address" error={e.address} className="sm:col-span-2">
          <Textarea id="address" name="address" rows={2} defaultValue={v.address} />
        </Field>
        <Field label="Notes" name="notes" error={e.notes} className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={2} defaultValue={v.notes} />
        </Field>
      </fieldset>
      {canEdit && (
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? "Saving…" : "Save brand"}
        </Button>
      )}
    </form>
  );
}
