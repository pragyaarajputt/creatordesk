// Indian date helpers. India has no daylight saving, so IST is always UTC+05:30.

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Calendar parts of a moment, as seen in India. */
export function istParts(date: Date): { year: number; month: number; day: number } {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Indian financial year (1 April to 31 March) for a moment: 2026-11-25 -> "2026-27". */
export function financialYear(date: Date): string {
  const { year, month } = istParts(date);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" for a moment, in IST. */
export function istDateKey(date: Date): string {
  const { year, month, day } = istParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Midnight IST of the given "YYYY-MM-DD", as a Date. */
export function istMidnight(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new RangeError(`invalid date key: ${dateKey}`);
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(utc - IST_OFFSET_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Whole IST calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
  const a = istMidnight(istDateKey(from)).getTime();
  const b = istMidnight(istDateKey(to)).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export const INVOICE_PREFIX_PATTERN = /^[A-Z0-9]{1,3}$/;

/**
 * Invoice number, e.g. "CD/2026-27/007".
 * GST rules allow at most 16 characters (letters, digits, "-" and "/"), unique within a financial year.
 */
export function formatInvoiceNumber(prefix: string, fy: string, seq: number): string {
  if (!INVOICE_PREFIX_PATTERN.test(prefix)) {
    throw new RangeError("invoice prefix must be 1-3 capital letters or digits");
  }
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError("sequence must be a positive integer");
  const number = `${prefix}/${fy}/${String(seq).padStart(3, "0")}`;
  if (number.length > 16) throw new RangeError("invoice number exceeds 16 characters");
  return number;
}
