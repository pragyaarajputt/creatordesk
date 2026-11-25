import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDashboard } from "@/lib/data/dashboard";
import { formatINR } from "@/lib/money";
import { getWorkspaceContext } from "@/lib/tenancy";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export default function DashboardPage() {
  return (
    <div className="grid gap-6">
      <h1 className="display text-4xl sm:text-5xl">Dashboard</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your numbers…</p>}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "alert" }) {
  return (
    <div className="grid gap-1.5 rounded-2xl border bg-background/80 p-5">
      <p className="eyebrow">{label}</p>
      <p className={`display text-4xl tabular-nums ${tone === "alert" ? "text-destructive" : ""}`}>{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

async function Dashboard() {
  const ctx = await getWorkspaceContext();
  const { summary: s, upcoming } = await getDashboard(ctx);
  const peak = Math.max(...s.months.map((m) => m.paise), 1);
  const empty = s.receivedThisFY === 0 && s.outstanding === 0 && s.pipeline === 0;

  if (empty && upcoming.length === 0) {
    return (
      <div className="grid justify-items-start gap-3 rounded-xl border border-dashed p-8">
        <h2 className="font-medium">Your numbers will appear here</h2>
        <p className="text-sm text-muted-foreground">Add a deal, invoice the brand, and record the payment when it arrives.</p>
        <Link href="/deals/new" className={buttonVariants()}>
          Add a deal
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Received this month" value={formatINR(s.receivedThisMonth)} note="Including TDS" />
        <Stat label={`Received in FY ${s.tax.financialYear}`} value={formatINR(s.receivedThisFY)} />
        <Stat
          label="Overdue"
          value={formatINR(s.overdue)}
          note={s.overdueCount ? `${s.overdueCount} invoice${s.overdueCount === 1 ? "" : "s"} · outstanding ${formatINR(s.outstanding)}` : `Outstanding ${formatINR(s.outstanding)}`}
          tone={s.overdue > 0 ? "alert" : undefined}
        />
        <Stat
          label="Average days to get paid"
          value={s.avgDaysToPaid === null ? "—" : `${s.avgDaysToPaid} days`}
          note={`Agreed work not yet invoiced: ${formatINR(s.pipeline)}`}
        />
      </section>

      {s.overdue > 0 && (
        <p className="text-sm">
          <Link href="/invoices?filter=overdue" className="font-medium underline underline-offset-2">
            Follow up on overdue invoices →
          </Link>
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="grid content-start gap-3">
          <h2 className="font-medium">Money received, last 6 months</h2>
          <figure className="grid gap-2">
            <div className="flex h-40 items-end gap-2" role="img" aria-label={s.months.map((m) => `${m.label}: ${formatINR(m.paise)}`).join(", ")}>
              {s.months.map((m) => (
                <div key={m.key} className="flex h-full flex-1 flex-col justify-end gap-1">
                  <span className="text-center text-[10px] text-muted-foreground tabular-nums">
                    {m.paise ? formatINR(m.paise).replace("₹", "") : ""}
                  </span>
                  <div className="rounded-t-md bg-primary" style={{ height: `${Math.max((m.paise / peak) * 100, m.paise ? 4 : 1)}%` }} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              {s.months.map((m) => (
                <span key={m.key} className="flex-1 text-center">
                  {m.label}
                </span>
              ))}
            </div>
          </figure>
        </section>

        <section className="grid content-start gap-3">
          <h2 className="font-medium">Due in the next 7 days</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deliverables due.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {upcoming.map((d) => (
                <li key={d.id} className="flex flex-wrap gap-x-2">
                  <Link href={`/deals/${d.deal.id}`} className="font-medium hover:underline">
                    {d.format.charAt(0) + d.format.slice(1).toLowerCase()} for {d.deal.brand.name}
                  </Link>
                  <span className="text-muted-foreground">{d.dueDate ? dateFmt.format(d.dueDate) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid content-start gap-3">
          <h2 className="font-medium">Top brands this financial year</h2>
          {s.topBrands.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <ol className="grid gap-1 text-sm">
              {s.topBrands.map((b) => (
                <li key={b.name} className="flex justify-between gap-4">
                  <span>{b.name}</span>
                  <span className="tabular-nums">{formatINR(b.paise)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="grid content-start gap-3">
          <h2 className="font-medium">Tax summary · FY {s.tax.financialYear}</h2>
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Invoiced (before GST)</dt>
              <dd className="tabular-nums">{formatINR(s.tax.invoiced)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">GST charged</dt>
              <dd className="tabular-nums">{formatINR(s.tax.gst)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">TDS deducted by brands</dt>
              <dd className="tabular-nums">{formatINR(s.tax.tdsDeducted)}</dd>
            </div>
          </dl>
          <a href={`/api/reports/tax?fy=${s.tax.financialYear}`} className={buttonVariants({ variant: "outline", size: "sm", className: "justify-self-start" })}>
            Download CSV for your CA
          </a>
        </section>
      </div>
    </div>
  );
}
