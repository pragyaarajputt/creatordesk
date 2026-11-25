import { describe, expect, it } from "vitest";
import { daysBetween, financialYear, formatInvoiceNumber, istDateKey, istMidnight } from "@/lib/fy";

describe("financialYear", () => {
  it.each([
    ["2026-11-25T10:00:00Z", "2026-27"],
    ["2027-03-31T12:00:00Z", "2026-27"],
    ["2027-04-01T00:00:00+05:30", "2027-28"],
    // 31 Mar 19:00 UTC is already 1 April 00:30 in India
    ["2027-03-31T19:00:00Z", "2027-28"],
    ["2099-06-01T00:00:00Z", "2099-00"],
  ])("%s is in FY %s", (iso, fy) => {
    expect(financialYear(new Date(iso))).toBe(fy);
  });
});

describe("IST day helpers", () => {
  it("uses the Indian calendar date", () => {
    expect(istDateKey(new Date("2026-11-25T20:00:00Z"))).toBe("2026-11-26");
  });
  it("round-trips midnight", () => {
    expect(istDateKey(istMidnight("2026-12-01"))).toBe("2026-12-01");
  });
  it("counts calendar days, not 24-hour blocks", () => {
    expect(daysBetween(new Date("2026-11-25T18:00:00Z"), new Date("2026-11-25T19:00:00Z"))).toBe(1);
  });
});

describe("formatInvoiceNumber", () => {
  it("pads the sequence", () => {
    expect(formatInvoiceNumber("CD", "2026-27", 7)).toBe("CD/2026-27/007");
  });
  it("stays within the 16-character GST limit", () => {
    expect(formatInvoiceNumber("ABC", "2026-27", 9999)).toHaveLength(16);
  });
  it.each([
    ["cd", 1],
    ["ABCD", 1],
    ["CD", 0],
  ])("rejects prefix %s / seq %s", (prefix, seq) => {
    expect(() => formatInvoiceNumber(prefix, "2026-27", seq)).toThrow();
  });
});
