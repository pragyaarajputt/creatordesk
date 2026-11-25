// Money helpers. All amounts are integer paise (₹1 = 100 paise); rates are basis points (18% = 1800).

export const MAX_PAISE = 2_000_000_000; // ₹2 crore: safely inside a 32-bit Postgres int

/** Parse a user-typed rupee amount ("1,499.50", "₹ 2000") into paise. Returns null when invalid. */
export function rupeesToPaise(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const text = String(input).replace(/[₹,\s]/g, "");
  if (text === "") return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise > MAX_PAISE) return null;
  return paise;
}

/** Format paise as Indian rupees: 14995000 -> "₹1,49,950". Shows paise only when present. */
export function formatINR(paise: number): string {
  const hasPaise = paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

/** Percentage of an amount in basis points, rounded half-up to the nearest paisa. Integer maths only. */
export function percentOf(paise: number, bps: number): number {
  if (paise < 0 || bps < 0) throw new RangeError("amount and rate must be non-negative");
  return Math.floor((paise * bps + 5_000) / 10_000);
}

export type InvoiceKind = "TAX_INVOICE" | "BILL_OF_SUPPLY";

export interface InvoiceTotalsInput {
  subtotalPaise: number;
  kind: InvoiceKind;
  gstRateBps: number;
  supplierStateCode?: string | null;
  recipientStateCode?: string | null;
}

export interface InvoiceTotals {
  subtotalPaise: number;
  gstRateBps: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  interState: boolean;
}

/**
 * GST split: same state -> CGST + SGST (half rate each); different states -> IGST (full rate).
 * When either state is unknown we assume intra-state; the UI asks for both states before issuing.
 * A bill of supply (supplier not registered for GST) carries no GST.
 */
export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const { subtotalPaise, kind } = input;
  const gstRateBps = kind === "BILL_OF_SUPPLY" ? 0 : input.gstRateBps;
  const interState =
    !!input.supplierStateCode &&
    !!input.recipientStateCode &&
    input.supplierStateCode !== input.recipientStateCode;

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (gstRateBps > 0) {
    if (interState) {
      igstPaise = percentOf(subtotalPaise, gstRateBps);
    } else {
      cgstPaise = percentOf(subtotalPaise, gstRateBps / 2);
      sgstPaise = percentOf(subtotalPaise, gstRateBps / 2);
    }
  }
  return {
    subtotalPaise,
    gstRateBps,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalPaise: subtotalPaise + cgstPaise + sgstPaise + igstPaise,
    interState,
  };
}

/** TDS the brand is expected to deduct. Calculated on the value before GST. */
export function expectedTds(subtotalPaise: number, tdsRateBps: number): number {
  return percentOf(subtotalPaise, tdsRateBps);
}

/** What is still owed on an invoice. TDS deducted by the brand counts as settled. */
export function outstandingPaise(
  totalPaise: number,
  payments: ReadonlyArray<{ amountPaise: number; tdsPaise: number }>,
): number {
  const settled = payments.reduce((sum, p) => sum + p.amountPaise + p.tdsPaise, 0);
  return Math.max(0, totalPaise - settled);
}
