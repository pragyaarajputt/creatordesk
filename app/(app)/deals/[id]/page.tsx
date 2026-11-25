import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDeal, NotFoundError } from "@/lib/data/deals";
import { formatINR } from "@/lib/money";
import { getWorkspaceContext, hasRole } from "@/lib/tenancy";
import { STAGE_LABEL } from "@/lib/validation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StageSelect } from "../stage-select";
import { AddDeliverableForm, DeliverableStatusSelect } from "./deliverables";
import { DeleteDealButton } from "./delete-deal-button";
import { IssueInvoiceForm } from "./issue-invoice-form";
import { InvoiceStatusBadge } from "../../invoices/status-badge";
import { getWorkspace } from "@/lib/data/settings";
import { withMoney } from "@/lib/data/invoices";
import { istDateKey } from "@/lib/fy";

export const metadata: Metadata = { title: "Deal" };

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const pretty = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace("_", " ");

export default function DealPage({ params }: PageProps<"/deals/[id]">) {
  return (
    <div className="grid gap-6">
      <Link href="/deals" className="text-sm text-muted-foreground hover:text-foreground">
        ← All deals
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading deal…</p>}>
        <DealDetail params={params} />
      </Suspense>
    </div>
  );
}

async function DealDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  const deal = await getDeal(ctx, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const canEdit = hasRole(ctx.role, "MANAGER");
  const workspace = await getWorkspace(ctx);
  const now = new Date();
  const invoiced = deal.invoices.filter((i) => i.status !== "VOID").reduce((sum, i) => sum + i.subtotalPaise, 0);
  const remaining = Math.max(0, deal.amountPaise - invoiced);

  const facts: [string, string][] = [
    ["Brand", deal.brand.name],
    ...(deal.creator ? [["Creator", deal.creator.name] as [string, string]] : []),
    ["Type", pretty(deal.type)],
    ...(deal.type !== "BARTER" ? [["Fee (before GST)", formatINR(deal.amountPaise)] as [string, string]] : []),
    ...(deal.type !== "PAID" ? [["Product value", formatINR(deal.productValuePaise)] as [string, string]] : []),
    ["Usage rights", deal.usageRightsMonths ? `${deal.usageRightsMonths} months` : "Not set"],
    ["Payment terms", `${deal.paymentTermsDays} days`],
  ];

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="display text-4xl sm:text-5xl">{deal.title}</h1>
          <p className="text-sm text-muted-foreground">
            {deal.brand.name} · {STAGE_LABEL[deal.stage]}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <StageSelect dealId={deal.id} stage={deal.stage} />
            </div>
            <Link href={`/deals/${deal.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Edit
            </Link>
            <DeleteDealButton dealId={deal.id} />
          </div>
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
        {facts.map(([term, value]) => (
          <div key={term} className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">{term}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {deal.notes && <p className="max-w-2xl whitespace-pre-wrap text-sm">{deal.notes}</p>}

      <section className="grid gap-3">
        <h2 className="font-medium">Deliverables</h2>
        {deal.deliverables.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deliverables yet. Add the reels, stories or posts you owe.</p>
        ) : (
          <ul className="grid gap-2">
            {deal.deliverables.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                <span className="font-medium">
                  {d.platform === "X" ? "X" : pretty(d.platform)} {pretty(d.format).toLowerCase()}
                </span>
                <span className="text-muted-foreground">{d.dueDate ? `due ${dateFmt.format(d.dueDate)}` : "no due date"}</span>
                {d.status === "POSTED" && <Badge variant="secondary">Posted</Badge>}
                <span className="ml-auto">
                  <DeliverableStatusSelect deliverableId={d.id} status={d.status} disabled={!canEdit} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && <AddDeliverableForm dealId={deal.id} />}
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Invoices</h2>
        {deal.invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <ul className="grid gap-2">
            {deal.invoices.map((raw) => {
              const inv = withMoney(raw, now);
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                  <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                    {inv.number}
                  </Link>
                  <span className="tabular-nums">{formatINR(inv.totalPaise)}</span>
                  <span className="ml-auto">
                    <InvoiceStatusBadge status={inv.status} overdueDays={inv.status === "PAID" ? 0 : inv.overdueDays} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {canEdit && deal.type !== "BARTER" && remaining > 0 && (
          <IssueInvoiceForm
            dealId={deal.id}
            remainingPaise={remaining}
            registeredForGst={Boolean(workspace.gstin)}
            defaultDescription={deal.title}
            today={istDateKey(now)}
          />
        )}
        {deal.type === "BARTER" && <p className="text-xs text-muted-foreground">Barter deals have no fee to invoice.</p>}
      </section>
    </div>
  );
}
