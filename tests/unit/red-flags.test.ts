import { describe, expect, it } from "vitest";
import type { BriefExtraction } from "@/lib/ai/brief-schema";
import { briefJsonSchema } from "@/lib/ai/brief-schema";
import { redFlags } from "@/lib/ai/red-flags";
import { deliverablesMatch, fieldMatches, scoreCase, summarise } from "../evals/score";
import { BRIEF_CASES } from "../evals/briefs";

const blank: BriefExtraction = {
  brandName: "X",
  campaignTitle: null,
  dealType: "PAID",
  feeRupees: 20000,
  feeIncludesGst: false,
  productValueRupees: null,
  deliverables: [{ platform: "INSTAGRAM", format: "REEL", count: 1, dueDate: null }],
  usageRightsMonths: 3,
  usageRightsPerpetual: false,
  paidAdsUsage: false,
  exclusivityDays: null,
  paymentTermsDays: 30,
  paymentConditional: false,
  revisionsUnlimited: false,
  ownershipTransfer: false,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  otherConcerns: [],
};
const codes = (b: Partial<BriefExtraction>) => redFlags({ ...blank, ...b }).map((f) => f.code);

describe("redFlags", () => {
  it("finds nothing in a fair brief", () => {
    expect(codes({})).toEqual([]);
  });
  it.each([
    [{ ownershipTransfer: true }, "OWNERSHIP_TRANSFER"],
    [{ usageRightsPerpetual: true, usageRightsMonths: null }, "PERPETUAL_USAGE"],
    [{ usageRightsMonths: 12 }, "LONG_USAGE"],
    [{ paymentConditional: true }, "CONDITIONAL_PAYMENT"],
    [{ paidAdsUsage: true }, "PAID_ADS"],
    [{ exclusivityDays: 45 }, "LONG_EXCLUSIVITY"],
    [{ paymentTermsDays: 60 }, "LONG_PAYMENT_TERMS"],
    [{ paymentTermsDays: 120 }, "VERY_LONG_PAYMENT_TERMS"],
    [{ paymentTermsDays: null }, "NO_PAYMENT_TERMS"],
    [{ revisionsUnlimited: true }, "UNLIMITED_REVISIONS"],
    [{ feeIncludesGst: true }, "FEE_INCLUDES_GST"],
  ] as const)("%j raises %s", (b, code) => {
    expect(codes(b as Partial<BriefExtraction>)).toContain(code);
  });
  it("uses thresholds, not any value", () => {
    expect(codes({ usageRightsMonths: 6, exclusivityDays: 30, paymentTermsDays: 45 })).toEqual([]);
  });
  it("flags heavy barter but not a single gifted story", () => {
    const barter = { dealType: "BARTER" as const, feeRupees: null, paymentTermsDays: null };
    expect(codes({ ...barter, deliverables: [{ platform: "INSTAGRAM", format: "REEL", count: 3, dueDate: null }] })).toContain("HEAVY_BARTER");
    expect(codes({ ...barter, deliverables: [{ platform: "INSTAGRAM", format: "STORY", count: 1, dueDate: null }] })).toEqual([]);
  });
  it("lists high-severity flags first and keeps AI notes separate", () => {
    const flags = redFlags({
      ...blank,
      paidAdsUsage: true,
      ownershipTransfer: true,
      otherConcerns: [{ message: "Penalty clause", evidence: "₹5,000 per day" }],
    });
    expect(flags[0].code).toBe("OWNERSHIP_TRANSFER");
    expect(flags.at(-1)).toMatchObject({ code: "AI_NOTE", source: "ai", evidence: "₹5,000 per day" });
  });
});

describe("JSON schema sent to Gemini", () => {
  it("requires every field so the model can't silently skip one", () => {
    const schema = briefJsonSchema as { required?: string[]; properties?: Record<string, unknown> };
    expect([...(schema.required ?? [])].sort()).toEqual(Object.keys(schema.properties ?? {}).sort());
  });
});

describe("eval scoring", () => {
  it("matches text loosely, numbers exactly and phones by last 10 digits", () => {
    expect(fieldMatches("brandName", "Glow Co", "Glow Co Beauty")).toBe(true);
    expect(fieldMatches("brandName", "Glow Co", "Bloom")).toBe(false);
    expect(fieldMatches("feeRupees", 25000, 25000)).toBe(true);
    expect(fieldMatches("feeRupees", 25000, 2500)).toBe(false);
    expect(fieldMatches("contactPhone", "9988776655", "+91 99887 76655")).toBe(true);
    expect(fieldMatches("brandName", null, null)).toBe(true);
  });
  it("matches deliverables as a set, checking dates only when labelled", () => {
    const got: BriefExtraction["deliverables"] = [
      { platform: "INSTAGRAM", format: "STORY", count: 2, dueDate: "2026-12-05" },
      { platform: "INSTAGRAM", format: "REEL", count: 1, dueDate: "2026-12-05" },
    ];
    expect(
      deliverablesMatch(
        [
          { platform: "INSTAGRAM", format: "REEL", count: 1 },
          { platform: "INSTAGRAM", format: "STORY", count: 2 },
        ],
        got,
      ),
    ).toBe(true);
    expect(
      deliverablesMatch(
        [
          { platform: "INSTAGRAM", format: "REEL", count: 1, dueDate: "2026-12-06" },
          { platform: "INSTAGRAM", format: "STORY", count: 2 },
        ],
        got,
      ),
    ).toBe(false);
  });
  it("scores a perfect answer as perfect", () => {
    const c = BRIEF_CASES[0];
    const perfect = { ...blank, ...c.expect, deliverables: c.expect.deliverables } as BriefExtraction;
    const s = scoreCase(c, perfect, []);
    expect(s.misses).toEqual([]);
    expect(summarise([s])).toMatchObject({ fieldAccuracy: 100, perfectCases: 1 });
  });
  it("has 40 labelled briefs with unique ids", () => {
    expect(BRIEF_CASES).toHaveLength(40);
    expect(new Set(BRIEF_CASES.map((c) => c.id)).size).toBe(40);
  });
});
