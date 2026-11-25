import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NotFoundError } from "@/lib/data/deals";
import { getInvoice } from "@/lib/data/invoices";
import { istDateKey } from "@/lib/fy";
import { expectedTds, formatINR } from "@/lib/money";
import { mailtoLink, nextReminder, reminderMessage, whatsappLink, type ReminderKind } from "@/lib/reminders";
import { getWorkspaceContext, hasRole } from "@/lib/tenancy";
import { paiseToWords } from "@/lib/words";
import { buttonVariants } from "@/components/ui/button";
import { InvoiceStatusBadge } from "../status-badge";
import { DeletePaymentButton, RecordPaymentForm, ReminderPanel, VoidInvoiceForm, type ReminderDraft } from "./invoice-client";

export const metadata: Metadata = { title: "Invoice" };

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const pct = (bps: number) => `${bps / 100}%`;
const METHOD: Record<string, string> = { UPI: "UPI", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", CASH: "Cash", OTHER: "Other" };

export default function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  return (
    <div className="grid gap-6">
      <Link href="/invoices" className="text-sm text-muted-foreground hover:text-foreground">
        ← All invoices
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading invoice…</p>}>
        <InvoiceDetail params={params} />
      </Suspense>
    </div>
  );
}

async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  const now = new Date();
  const inv = await getInvoice(ctx, id, now).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const canEdit = hasRole(ctx.role, "MANAGER");
  const open = inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID";
  const tdsExpected = expectedTds(inv.subtotalPaise, inv.tdsRateBps);
  const tdsRecorded = inv.payments.reduce((s, p) => s + p.tdsPaise, 0);
  const suggestedTds = Math.min(Math.max(0, tdsExpected - tdsRecorded), inv.outstandingPaise);
  const brand = inv.deal.brand;

  const sent = new Set(inv.reminders.map((r) => r.kind as ReminderKind));
  const suggested = open ? nextReminder(inv.dueDate, now, sent) : null;
  const drafts: ReminderDraft[] = (["POLITE", "FIRM", "FINAL"] as const).map((kind) => {
    const msg = reminderMessage({
      kind,
      brandName: brand.name,
      contactName: brand.contactName,
      invoiceNumber: inv.number,
      outstandingPaise: inv.outstandingPaise,
      dueDate: inv.dueDate,
      senderName: inv.workspace.legalName ?? inv.workspace.name,
      upiId: inv.workspace.upiId,
      now,
    });
    return {
      kind,
      ...msg,
      whatsapp: whatsappLink(brand.contactPhone, msg.body),
      email: mailtoLink(brand.contactEmail, msg.subject, msg.body),
    };
  });

  const rows: [string, string][] = [
    ["Taxable value", formatINR(inv.subtotalPaise)],
    ...(inv.igstPaise ? [[`IGST @ ${pct(inv.gstRateBps)}`, formatINR(inv.igstPaise)] as [string, string]] : []),
    ...(inv.cgstPaise ? [[`CGST @ ${pct(inv.gstRateBps / 2)}`, formatINR(inv.cgstPaise)] as [string, string]] : []),
    ...(inv.sgstPaise ? [[`SGST @ ${pct(inv.gstRateBps / 2)}`, formatINR(inv.sgstPaise)] as [string, string]] : []),
  ];

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display text-4xl sm:text-5xl">{inv.number}</h1>
            <InvoiceStatusBadge status={inv.status} overdueDays={inv.overdueDays} />
          </div>
          <p className="text-sm text-muted-foreground">
            {inv.kind === "TAX_INVOICE" ? "Tax invoice" : "Bill of supply"} to{" "}
            <Link href={`/brands/${brand.id}`} className="underline-offset-2 hover:underline">
              {brand.name}
            </Link>{" "}
            for{" "}
            <Link href={`/deals/${inv.deal.id}`} className="underline-offset-2 hover:underline">
              {inv.deal.title}
            </Link>
          </p>
          {inv.status === "VOID" && <p className="text-sm text-destructive">Voided: {inv.voidReason}</p>}
        </div>
        <a href={`/invoices/${inv.id}/pdf`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
          Download PDF
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="grid content-start gap-3">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Issued</dt>
              <dd>{dateFmt.format(inv.issueDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Due</dt>
              <dd>{dateFmt.format(inv.dueDate)}</dd>
            </div>
          </dl>
          <table className="text-sm">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1 text-muted-foreground">{k}</td>
                  <td className="py-1 text-right tabular-nums">{v}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">{formatINR(inv.totalPaise)}</td>
              </tr>
              <tr>
                <td className="py-1 text-muted-foreground">Outstanding</td>
                <td className="py-1 text-right font-semibold tabular-nums">{formatINR(inv.outstandingPaise)}</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">{paiseToWords(inv.totalPaise)}</p>
          {inv.tdsRateBps > 0 && (
            <p className="text-xs text-muted-foreground">
              Expected TDS at {pct(inv.tdsRateBps)}: {formatINR(tdsExpected)}. The brand pays this to the government on your behalf.
            </p>
          )}
        </section>

        <section className="grid content-start gap-3">
          <h2 className="font-medium">Payments</h2>
          {inv.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="grid gap-2">
              {inv.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                  <span className="font-medium tabular-nums">{formatINR(p.amountPaise)}</span>
                  {p.tdsPaise > 0 && <span className="text-muted-foreground">+ {formatINR(p.tdsPaise)} TDS</span>}
                  <span className="text-muted-foreground">
                    · {METHOD[p.method]} · {dateFmt.format(p.receivedAt)}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                  {canEdit && (
                    <span className="ml-auto">
                      <DeletePaymentButton paymentId={p.id} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && open && (
            <RecordPaymentForm
              invoiceId={inv.id}
              suggestedAmountPaise={inv.outstandingPaise - suggestedTds}
              suggestedTdsPaise={suggestedTds}
              today={istDateKey(now)}
            />
          )}
        </section>
      </div>

      {open && (
        <section className="grid gap-3">
          <h2 className="font-medium">Follow up</h2>
          <ReminderPanel
            invoiceId={inv.id}
            suggested={suggested}
            drafts={inv.overdueDays > 0 ? drafts : drafts.filter((d) => d.kind === "POLITE")}
            canSend={canEdit}
            overdue={inv.overdueDays > 0}
          />
          {inv.reminders.length > 0 && (
            <ul className="grid gap-1 text-xs text-muted-foreground">
              {inv.reminders.map((r) => (
                <li key={r.id}>
                  {r.kind.charAt(0) + r.kind.slice(1).toLowerCase()} reminder opened in {r.channel === "WHATSAPP" ? "WhatsApp" : "email"} on{" "}
                  {dateFmt.format(r.sentAt ?? r.createdAt)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canEdit && inv.status !== "VOID" && inv.payments.length === 0 && (
        <div>
          <VoidInvoiceForm invoiceId={inv.id} />
        </div>
      )}
    </div>
  );
}
