// Dashboard numbers. Pure functions over plain rows, so they're easy to test.
import { daysBetween, financialYear, istParts } from "@/lib/fy";
import { outstandingPaise } from "@/lib/money";
import { daysOverdue } from "@/lib/reminders";

export interface InvoiceRow {
  id: string;
  status: "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID";
  financialYear: string;
  issueDate: Date;
  dueDate: Date;
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  brandName: string;
  payments: { amountPaise: number; tdsPaise: number; receivedAt: Date }[];
}

export interface DealRow {
  stage: string;
  amountPaise: number;
}

const monthKey = (d: Date) => {
  const { year, month } = istParts(d);
  return `${year}-${String(month).padStart(2, "0")}`;
};

export function summarise(invoices: InvoiceRow[], deals: DealRow[], now: Date) {
  const live = invoices.filter((i) => i.status !== "VOID");
  const fy = financialYear(now);
  const thisMonth = monthKey(now);

  // Money received counts cash plus TDS (TDS is income the brand paid to the government for you).
  const payments = live.flatMap((i) => i.payments.map((p) => ({ ...p, brandName: i.brandName })));
  const settled = (p: { amountPaise: number; tdsPaise: number }) => p.amountPaise + p.tdsPaise;
  const receivedThisMonth = payments.filter((p) => monthKey(p.receivedAt) === thisMonth).reduce((s, p) => s + settled(p), 0);
  const receivedThisFY = payments.filter((p) => financialYear(p.receivedAt) === fy).reduce((s, p) => s + settled(p), 0);

  let outstanding = 0;
  let overdue = 0;
  let overdueCount = 0;
  for (const inv of live) {
    const due = outstandingPaise(inv.totalPaise, inv.payments);
    outstanding += due;
    if (due > 0 && daysOverdue(inv.dueDate, now) > 0) {
      overdue += due;
      overdueCount += 1;
    }
  }

  // Average days from invoice to full payment, over paid invoices.
  const paidDurations = live
    .filter((i) => i.status === "PAID" && i.payments.length > 0)
    .map((i) => daysBetween(i.issueDate, new Date(Math.max(...i.payments.map((p) => p.receivedAt.getTime())))));
  const avgDaysToPaid = paidDurations.length
    ? Math.round(paidDurations.reduce((s, d) => s + d, 0) / paidDurations.length)
    : null;

  // Open pipeline: agreed work not yet invoiced.
  const pipeline = deals
    .filter((d) => ["AGREED", "IN_PRODUCTION", "POSTED"].includes(d.stage))
    .reduce((s, d) => s + d.amountPaise, 0);

  // Last 6 months of money received, oldest first.
  const months: { key: string; label: string; paise: number }[] = [];
  const { year, month } = istParts(now);
  for (let back = 5; back >= 0; back--) {
    const m = new Date(Date.UTC(year, month - 1 - back, 15));
    const key = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = m.toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
    months.push({ key, label, paise: payments.filter((p) => monthKey(p.receivedAt) === key).reduce((s, p) => s + settled(p), 0) });
  }

  // Top brands by money received this financial year.
  const byBrand = new Map<string, number>();
  for (const p of payments.filter((p) => financialYear(p.receivedAt) === fy)) {
    byBrand.set(p.brandName, (byBrand.get(p.brandName) ?? 0) + settled(p));
  }
  const topBrands = [...byBrand.entries()]
    .map(([name, paise]) => ({ name, paise }))
    .sort((a, b) => b.paise - a.paise)
    .slice(0, 5);

  // Tax summary for invoices issued this financial year (for the CA).
  const fyInvoices = live.filter((i) => i.financialYear === fy);
  const tax = {
    financialYear: fy,
    invoiced: fyInvoices.reduce((s, i) => s + i.subtotalPaise, 0),
    gst: fyInvoices.reduce((s, i) => s + i.cgstPaise + i.sgstPaise + i.igstPaise, 0),
    tdsDeducted: fyInvoices.reduce((s, i) => s + i.payments.reduce((t, p) => t + p.tdsPaise, 0), 0),
  };

  return { receivedThisMonth, receivedThisFY, outstanding, overdue, overdueCount, avgDaysToPaid, pipeline, months, topBrands, tax };
}

export type DashboardSummary = ReturnType<typeof summarise>;
