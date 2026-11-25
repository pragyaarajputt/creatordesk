import { describe, expect, it } from "vitest";
import { summarise, type InvoiceRow } from "@/lib/analytics";

const d = (iso: string) => new Date(`${iso}T06:00:00Z`);
const inv = (over: Partial<InvoiceRow>): InvoiceRow => ({
  id: Math.random().toString(36),
  status: "ISSUED",
  financialYear: "2026-27",
  issueDate: d("2026-10-01"),
  dueDate: d("2026-10-31"),
  subtotalPaise: 1000000,
  cgstPaise: 90000,
  sgstPaise: 90000,
  igstPaise: 0,
  totalPaise: 1180000,
  brandName: "Glow Co",
  payments: [],
  ...over,
});

const now = d("2026-11-25");

describe("summarise", () => {
  const invoices = [
    // Paid in full in November, including TDS, 20 days after issue.
    inv({ status: "PAID", issueDate: d("2026-11-01"), payments: [{ amountPaise: 1080000, tdsPaise: 100000, receivedAt: d("2026-11-21") }] }),
    // Unpaid, overdue since 31 Oct.
    inv({ brandName: "Fizz", subtotalPaise: 2000000, cgstPaise: 180000, sgstPaise: 180000, totalPaise: 2360000 }),
    // Void: ignored everywhere.
    inv({ status: "VOID", brandName: "Ghost", totalPaise: 9999999 }),
  ];
  const deals = [
    { stage: "AGREED", amountPaise: 500000 },
    { stage: "POSTED", amountPaise: 300000 },
    { stage: "PITCHED", amountPaise: 999900 },
  ];
  const s = summarise(invoices, deals, now);

  it("counts money received including TDS", () => {
    expect(s.receivedThisMonth).toBe(1180000);
    expect(s.receivedThisFY).toBe(1180000);
  });
  it("totals outstanding and overdue, ignoring void invoices", () => {
    expect(s.outstanding).toBe(2360000);
    expect(s.overdue).toBe(2360000);
    expect(s.overdueCount).toBe(1);
  });
  it("averages days to get paid", () => {
    expect(s.avgDaysToPaid).toBe(20);
  });
  it("sums the agreed pipeline only", () => {
    expect(s.pipeline).toBe(800000);
  });
  it("builds six months ending this month", () => {
    expect(s.months.map((m) => m.key)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(s.months.at(-1)?.paise).toBe(1180000);
  });
  it("ranks brands and summarises tax for the CA", () => {
    expect(s.topBrands).toEqual([{ name: "Glow Co", paise: 1180000 }]);
    expect(s.tax).toEqual({ financialYear: "2026-27", invoiced: 3000000, gst: 540000, tdsDeducted: 100000 });
  });
});
