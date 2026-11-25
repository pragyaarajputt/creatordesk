import { describe, expect, it } from "vitest";
import {
  computeInvoiceTotals,
  expectedTds,
  formatINR,
  outstandingPaise,
  percentOf,
  rupeesToPaise,
} from "@/lib/money";

describe("rupeesToPaise", () => {
  it.each([
    ["1499.50", 149950],
    ["1,49,950", 14995000],
    ["₹ 2000", 200000],
    ["0.5", 50],
    ["7", 700],
    [25000, 2500000],
  ])("parses %s", (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it.each(["", "abc", "-100", "1.234", "1e5", "20000001"])("rejects %s", (input) => {
    expect(rupeesToPaise(input)).toBeNull();
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(14995000)).toBe("₹1,49,950");
  });
  it("shows paise only when present", () => {
    expect(formatINR(149950)).toBe("₹1,499.50");
  });
});

describe("percentOf", () => {
  it("rounds half up to the nearest paisa", () => {
    expect(percentOf(333, 1800)).toBe(60); // 59.94 -> 60
    expect(percentOf(25, 1000)).toBe(3); // 2.5 -> 3
  });
  it("rejects negative input", () => {
    expect(() => percentOf(-1, 1800)).toThrow();
  });
});

describe("computeInvoiceTotals", () => {
  it("splits GST into CGST + SGST within one state", () => {
    const t = computeInvoiceTotals({
      subtotalPaise: 2500000,
      kind: "TAX_INVOICE",
      gstRateBps: 1800,
      supplierStateCode: "07",
      recipientStateCode: "07",
    });
    expect(t).toMatchObject({ cgstPaise: 225000, sgstPaise: 225000, igstPaise: 0, totalPaise: 2950000 });
    expect(t.interState).toBe(false);
  });

  it("charges IGST across states", () => {
    const t = computeInvoiceTotals({
      subtotalPaise: 2500000,
      kind: "TAX_INVOICE",
      gstRateBps: 1800,
      supplierStateCode: "07",
      recipientStateCode: "27",
    });
    expect(t).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 450000, totalPaise: 2950000 });
    expect(t.interState).toBe(true);
  });

  it("charges no GST on a bill of supply", () => {
    const t = computeInvoiceTotals({ subtotalPaise: 1000000, kind: "BILL_OF_SUPPLY", gstRateBps: 1800 });
    expect(t.totalPaise).toBe(1000000);
    expect(t.gstRateBps).toBe(0);
  });
});

describe("expectedTds and outstandingPaise", () => {
  it("calculates TDS on the value before GST", () => {
    expect(expectedTds(2500000, 1000)).toBe(250000);
  });
  it("treats TDS deducted by the brand as settled", () => {
    expect(outstandingPaise(2950000, [{ amountPaise: 2700000, tdsPaise: 250000 }])).toBe(0);
    expect(outstandingPaise(2950000, [{ amountPaise: 1000000, tdsPaise: 0 }])).toBe(1950000);
  });
  it("never goes negative on overpayment", () => {
    expect(outstandingPaise(100, [{ amountPaise: 500, tdsPaise: 0 }])).toBe(0);
  });
});
