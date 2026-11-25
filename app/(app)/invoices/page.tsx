import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listInvoices, type InvoiceFilter } from "@/lib/data/invoices";
import { formatINR } from "@/lib/money";
import { getWorkspaceContext } from "@/lib/tenancy";
import { cn } from "@/lib/utils";
import { InvoiceStatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Invoices" };

const FILTERS: { key: InvoiceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "outstanding", label: "Outstanding" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
];

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="display text-4xl sm:text-5xl">Invoices</h1>
        <p className="text-sm text-muted-foreground">Create invoices from a deal page. Record payments here.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading invoices…</p>}>
        <InvoiceList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function InvoiceList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).filter;
  const filter = (FILTERS.find((f) => f.key === raw)?.key ?? "all") as InvoiceFilter;
  const ctx = await getWorkspaceContext();
  const invoices = await listInvoices(ctx, filter);
  const outstanding = invoices.reduce((s, i) => s + i.outstandingPaise, 0);

  return (
    <div className="grid gap-4">
      <nav aria-label="Filter invoices" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/invoices" : `/invoices?filter=${f.key}`}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              f.key === filter ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {invoices.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
          {filter === "all" ? "No invoices yet. Open a deal and choose “Create invoice”." : "Nothing here."}
        </p>
      ) : (
        <>
          {outstanding > 0 && (
            <p className="text-sm">
              Outstanding in this view: <span className="font-semibold">{formatINR(outstanding)}</span>
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Number</th>
                  <th className="px-3 py-2 font-medium">Brand · deal</th>
                  <th className="px-3 py-2 font-medium">Issued</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      <Link href={`/invoices/${inv.id}`} className="hover:underline">
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {inv.deal.brand.name} <span className="text-muted-foreground">· {inv.deal.title}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{dateFmt.format(inv.issueDate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(inv.totalPaise)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inv.outstandingPaise ? formatINR(inv.outstandingPaise) : "—"}</td>
                    <td className="px-3 py-2">
                      <InvoiceStatusBadge status={inv.status} overdueDays={inv.overdueDays} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
