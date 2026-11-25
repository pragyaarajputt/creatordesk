"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, selectClass, TextField } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import {
  deletePaymentAction,
  logReminderAction,
  recordPaymentAction,
  voidInvoiceAction,
} from "../actions";

const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

export function RecordPaymentForm({
  invoiceId,
  suggestedAmountPaise,
  suggestedTdsPaise,
  today,
}: {
  invoiceId: string;
  suggestedAmountPaise: number;
  suggestedTdsPaise: number;
  today: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordPaymentAction.bind(null, invoiceId), {});
  const e = state.errors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="grid gap-3 rounded-xl border p-4" noValidate>
      <h3 className="text-sm font-medium">Record a payment</h3>
      {e.form && <p role="alert" className="text-sm text-destructive">{e.form}</p>}
      {state.ok && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Amount received (₹)"
          name="amount"
          inputMode="decimal"
          defaultValue={v.amount ?? rupees(suggestedAmountPaise)}
          error={e.amount}
        />
        <TextField
          label="TDS deducted by the brand (₹)"
          name="tds"
          inputMode="decimal"
          defaultValue={v.tds ?? rupees(suggestedTdsPaise)}
          hint="Counts as paid. Claim it when you file your return."
          error={e.tds}
        />
        <TextField label="Date received" name="receivedAt" type="date" defaultValue={v.receivedAt ?? today} error={e.receivedAt} />
        <Field label="Method" name="method" error={e.method}>
          <select id="method" name="method" className={selectClass} defaultValue={v.method ?? "BANK_TRANSFER"}>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="UPI">UPI</option>
            <option value="CHEQUE">Cheque</option>
            <option value="CASH">Cash</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <TextField label="Reference (optional)" name="reference" placeholder="UTR / transaction ID" defaultValue={v.reference} error={e.reference} className="sm:col-span-2" />
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Record payment"}
      </Button>
    </form>
  );
}

export function DeletePaymentButton({ paymentId }: { paymentId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  if (!confirming) {
    return (
      <Button variant="ghost" size="xs" onClick={() => setConfirming(true)}>
        Remove
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      Remove this payment?
      <Button
        variant="destructive"
        size="xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await deletePaymentAction(paymentId);
            setError(r.errors?.form);
          })
        }
      >
        Yes
      </Button>
      <Button variant="ghost" size="xs" onClick={() => setConfirming(false)}>
        No
      </Button>
      {error && <span className="text-destructive">{error}</span>}
    </span>
  );
}

type Kind = "POLITE" | "FIRM" | "FINAL";
export interface ReminderDraft {
  kind: Kind;
  subject: string;
  body: string;
  whatsapp: string | null;
  email: string | null;
}

export function ReminderPanel({
  invoiceId,
  suggested,
  drafts,
  canSend,
  overdue,
}: {
  invoiceId: string;
  suggested: Kind | null;
  drafts: ReminderDraft[];
  canSend: boolean;
  overdue: boolean;
}) {
  const [kind, setKind] = useState<Kind>(suggested ?? "POLITE");
  const [, startTransition] = useTransition();
  const draft = drafts.find((d) => d.kind === kind)!;
  const log = (channel: "WHATSAPP" | "EMAIL") =>
    startTransition(async () => {
      await logReminderAction(invoiceId, kind, channel);
    });

  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{overdue ? "Payment reminder" : "Friendly note before the due date"}</h3>
        <div role="radiogroup" aria-label="Reminder tone" className="ml-auto flex gap-1">
          {drafts.map(({ kind: k }) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                kind === k ? "border-foreground bg-foreground text-background" : "text-muted-foreground",
              )}
            >
              {k.charAt(0) + k.slice(1).toLowerCase()}
              {suggested === k ? " · suggested" : ""}
            </button>
          ))}
        </div>
      </div>
      <pre className="max-h-56 overflow-auto rounded-lg bg-muted/50 p-3 font-sans text-sm whitespace-pre-wrap">{draft.body}</pre>
      {canSend ? (
        <div className="flex flex-wrap gap-2">
          {draft.whatsapp ? (
            <a
              href={draft.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => log("WHATSAPP")}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Open in WhatsApp
            </a>
          ) : null}
          {draft.email ? (
            <a
              href={draft.email}
              onClick={() => log("EMAIL")}
              className="inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium"
            >
              Open email
            </a>
          ) : null}
          {!draft.whatsapp && !draft.email && (
            <p className="text-sm text-muted-foreground">Add the brand contact&apos;s phone or email on the brand page to send this in one tap.</p>
          )}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Nothing is sent automatically. WhatsApp or your email app opens with the message, and you press send.
      </p>
    </div>
  );
}

export function VoidInvoiceForm({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(voidInvoiceAction.bind(null, invoiceId), {});
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Void invoice
      </Button>
    );
  }
  return (
    <form action={action} className="grid gap-2 rounded-xl border border-destructive/40 p-4" noValidate>
      <p className="text-sm">
        Voiding keeps the invoice number (so numbering has no gaps) but removes it from every total. It can&apos;t be undone.
      </p>
      {state.errors?.form && <p role="alert" className="text-sm text-destructive">{state.errors.form}</p>}
      <TextField label="Reason" name="reason" placeholder="e.g. Wrong GST rate" defaultValue={state.values?.reason} error={state.errors?.reason} />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Voiding…" : "Void invoice"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}
