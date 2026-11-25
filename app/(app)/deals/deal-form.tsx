"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, selectClass, TextField } from "@/components/app/field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DEAL_STAGES, STAGE_LABEL } from "@/lib/validation";
import type { FormState } from "./actions";

export interface DealFormDefaults {
  title?: string;
  brandName?: string;
  type?: "PAID" | "BARTER" | "HYBRID";
  stage?: string;
  amount?: string;
  productValue?: string;
  usageRightsMonths?: string;
  paymentTermsDays?: string;
  notes?: string;
  creatorId?: string;
}

const HIDDEN_KEYS = ["deliverablesJson", "contactName", "contactEmail", "contactPhone"];
const pick = (values: Record<string, string> | undefined, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => values?.[k]).map((k) => [k, values![k]]));

export function DealForm({
  action,
  defaults = {},
  submitLabel,
  cancelHref,
  creators = [],
  hidden,
}: {
  creators?: { id: string; name: string }[];
  /** Extra values submitted with the form (e.g. deliverables read from a brief). */
  hidden?: Record<string, string>;
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  defaults?: DealFormDefaults;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Submitted values win over defaults so a failed submit keeps what the user typed.
  const d: DealFormDefaults = { ...defaults, ...state.values };
  const [type, setType] = useState(defaults.type ?? "PAID");
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="grid max-w-2xl gap-4" noValidate>
      {Object.entries({ ...hidden, ...pick(state.values, HIDDEN_KEYS) }).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {(e.deliverablesJson || e.contactEmail) && (
        <p role="alert" className="text-sm text-destructive">
          {e.deliverablesJson ?? `Brand contact from the brief: ${e.contactEmail}`}
        </p>
      )}
      {e.form && (
        <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          {e.form}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Deal name" name="title" required defaultValue={d.title} placeholder="Diwali reel" error={e.title} />
        <TextField label="Brand" name="brandName" required defaultValue={d.brandName} placeholder="Glow Co" error={e.brandName} />
        {creators.length > 0 && (
          <Field label="Creator" name="creatorId" error={e.creatorId}>
            <select id="creatorId" name="creatorId" className={selectClass} defaultValue={d.creatorId ?? ""}>
              <option value="">Not assigned</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Deal type" name="type" error={e.type}>
          <select
            id="type"
            name="type"
            className={selectClass}
            value={type}
            onChange={(ev) => setType(ev.target.value as typeof type)}
          >
            <option value="PAID">Paid</option>
            <option value="BARTER">Barter (product only)</option>
            <option value="HYBRID">Hybrid (fee + product)</option>
          </select>
        </Field>
        <Field label="Stage" name="stage" error={e.stage}>
          <select id="stage" name="stage" className={selectClass} defaultValue={d.stage ?? "PITCHED"}>
            {DEAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        {type !== "BARTER" ? (
          <TextField
            label="Fee (₹, before GST)"
            name="amount"
            inputMode="decimal"
            defaultValue={d.amount}
            placeholder="25000"
            error={e.amount}
          />
        ) : (
          <input type="hidden" name="amount" value="" />
        )}
        {type !== "PAID" ? (
          <TextField
            label="Product value (₹)"
            name="productValue"
            inputMode="decimal"
            defaultValue={d.productValue}
            placeholder="5000"
            error={e.productValue}
          />
        ) : (
          <input type="hidden" name="productValue" value="" />
        )}
        <TextField
          label="Usage rights (months, optional)"
          name="usageRightsMonths"
          inputMode="numeric"
          defaultValue={d.usageRightsMonths}
          placeholder="3"
          error={e.usageRightsMonths}
        />
        <TextField
          label="Payment terms (days)"
          name="paymentTermsDays"
          inputMode="numeric"
          defaultValue={d.paymentTermsDays ?? "30"}
          hint="How long the brand has to pay after the invoice."
          error={e.paymentTermsDays}
        />
      </div>
      <Field label="Notes (optional)" name="notes" error={e.notes}>
        <Textarea id="notes" name="notes" rows={3} defaultValue={d.notes} placeholder="Brief, hashtags, contact person…" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost", size: "lg" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
