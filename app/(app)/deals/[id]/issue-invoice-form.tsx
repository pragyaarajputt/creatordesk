"use client";

import { useActionState, useState } from "react";
import { Field, selectClass, TextField } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-result";
import { issueInvoiceAction } from "../../invoices/actions";

const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

export function IssueInvoiceForm({
  dealId,
  remainingPaise,
  registeredForGst,
  defaultDescription,
  today,
}: {
  dealId: string;
  remainingPaise: number;
  registeredForGst: boolean;
  defaultDescription: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(issueInvoiceAction.bind(null, dealId), {});
  const [kind, setKind] = useState(registeredForGst ? "TAX_INVOICE" : "BILL_OF_SUPPLY");
  const e = state.errors ?? {};
  const v = state.values ?? {};

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="justify-self-start">
        Create invoice
      </Button>
    );
  }

  return (
    <form action={action} className="grid gap-3 rounded-xl border p-4" noValidate>
      <h3 className="text-sm font-medium">New invoice</h3>
      {e.form && <p role="alert" className="text-sm text-destructive">{e.form}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Invoice type" name="kind" error={e.kind}>
          <select id="kind" name="kind" className={selectClass} value={kind} onChange={(ev) => setKind(ev.target.value)}>
            <option value="TAX_INVOICE" disabled={!registeredForGst}>
              Tax invoice (GST registered){registeredForGst ? "" : ": add GSTIN in Settings"}
            </option>
            <option value="BILL_OF_SUPPLY">Bill of supply (not GST registered)</option>
          </select>
        </Field>
        {kind === "TAX_INVOICE" ? (
          <Field label="GST rate" name="gstRateBps" error={e.gstRateBps}>
            <select id="gstRateBps" name="gstRateBps" className={selectClass} defaultValue={v.gstRateBps ?? "1800"}>
              <option value="1800">18% (most creator services)</option>
              <option value="1200">12%</option>
              <option value="500">5%</option>
              <option value="2800">28%</option>
              <option value="0">0%</option>
            </select>
          </Field>
        ) : (
          <input type="hidden" name="gstRateBps" value="0" />
        )}
        <TextField
          label="Amount before GST (₹)"
          name="amount"
          inputMode="decimal"
          defaultValue={v.amount ?? rupees(remainingPaise)}
          hint={`Fee left to invoice: ₹${rupees(remainingPaise)}. Lower it for an advance.`}
          error={e.amount}
        />
        <Field label="TDS the brand will deduct" name="tdsRateBps" error={e.tdsRateBps}>
          <select id="tdsRateBps" name="tdsRateBps" className={selectClass} defaultValue={v.tdsRateBps ?? "1000"}>
            <option value="1000">10% (194J, professional fees)</option>
            <option value="200">2% (194C, company contract)</option>
            <option value="100">1% (194C, individual contract)</option>
            <option value="0">None</option>
          </select>
        </Field>
        <TextField label="Description" name="description" defaultValue={v.description ?? defaultDescription} error={e.description} />
        <TextField label="Invoice date" name="issueDate" type="date" defaultValue={v.issueDate ?? today} error={e.issueDate} />
      </div>
      <p className="text-xs text-muted-foreground">TDS section depends on your agreement with the brand. Check with your CA if unsure.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create invoice"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
