"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toActionError, type ActionState } from "@/lib/action-result";
import { istMidnight } from "@/lib/fy";
import { deletePayment, issueInvoice, logReminder, recordPayment, voidInvoice } from "@/lib/data/invoices";
import { issueInvoiceSchema, paymentSchema, voidSchema } from "@/lib/schemas";
import { getWorkspaceContext } from "@/lib/tenancy";
import { fieldErrors, formToObject } from "@/lib/validation";

export async function issueInvoiceAction(dealId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  const values = formToObject(form);
  const parsed = issueInvoiceSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  let id: string;
  try {
    const { kind, gstRateBps, tdsRateBps, amount, description, issueDate } = parsed.data;
    const invoice = await issueInvoice(ctx, dealId, {
      kind,
      gstRateBps,
      tdsRateBps,
      amountPaise: amount,
      description,
      // Noon IST keeps the chosen calendar day stable in every timezone.
      issueDate: issueDate ? new Date(istMidnight(issueDate).getTime() + 12 * 3600_000) : undefined,
    });
    id = invoice.id;
  } catch (error) {
    return toActionError(error, values);
  }
  redirect(`/invoices/${id}`);
}

export async function recordPaymentAction(invoiceId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  const values = formToObject(form);
  const parsed = paymentSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await recordPayment(ctx, invoiceId, {
      amountPaise: parsed.data.amount,
      tdsPaise: parsed.data.tds,
      receivedAt: new Date(istMidnight(parsed.data.receivedAt).getTime() + 12 * 3600_000),
      method: parsed.data.method,
      reference: parsed.data.reference,
    });
  } catch (error) {
    return toActionError(error, values);
  }
  refresh();
  return { ok: true, message: "Payment recorded." };
}

export async function deletePaymentAction(paymentId: string): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  try {
    await deletePayment(ctx, paymentId);
  } catch (error) {
    return toActionError(error);
  }
  refresh();
  return { ok: true };
}

export async function voidInvoiceAction(invoiceId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  const values = formToObject(form);
  const parsed = voidSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await voidInvoice(ctx, invoiceId, parsed.data.reason);
  } catch (error) {
    return toActionError(error, values);
  }
  refresh();
  return { ok: true };
}

const reminderInput = z.object({
  kind: z.enum(["POLITE", "FIRM", "FINAL"]),
  channel: z.enum(["WHATSAPP", "EMAIL"]),
});

/** Called when the creator opens a WhatsApp or email reminder, so it shows in the history. */
export async function logReminderAction(invoiceId: string, kind: string, channel: string): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  const parsed = reminderInput.safeParse({ kind, channel });
  if (!parsed.success) return { errors: { form: "Unknown reminder" } };
  try {
    await logReminder(ctx, invoiceId, parsed.data.kind, parsed.data.channel);
  } catch (error) {
    return toActionError(error);
  }
  refresh();
  return { ok: true };
}
