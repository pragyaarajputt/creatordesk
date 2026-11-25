import { describe, expect, it } from "vitest";
import { dealInputSchema, fieldErrors, waitlistInputSchema, workspaceInputSchema } from "@/lib/validation";

const base = {
  title: "Diwali reel",
  brandName: "Glow Co",
  type: "PAID",
  stage: "AGREED",
  amount: "25,000",
  productValue: "",
  usageRightsMonths: "3",
  paymentTermsDays: "",
  notes: "",
};

describe("dealInputSchema", () => {
  it("parses rupees to paise and applies defaults", () => {
    const deal = dealInputSchema.parse(base);
    expect(deal).toMatchObject({ amount: 2500000, productValue: 0, usageRightsMonths: 3, paymentTermsDays: 30 });
    expect(deal.notes).toBeUndefined();
  });

  it("gives friendly messages for bad numbers", () => {
    const result = dealInputSchema.safeParse({ ...base, usageRightsMonths: "3 months", amount: "abc" });
    expect(result.success).toBe(false);
    const errors = fieldErrors(result.error!);
    expect(errors.usageRightsMonths).toMatch(/whole number/);
    expect(errors.amount).toMatch(/rupees/);
  });

  it("requires a fee for paid deals and a product value for barter", () => {
    expect(fieldErrors(dealInputSchema.safeParse({ ...base, amount: "" }).error!).amount).toMatch(/need a fee/);
    const barter = dealInputSchema.safeParse({ ...base, type: "BARTER", amount: "", productValue: "" });
    expect(fieldErrors(barter.error!).productValue).toMatch(/product's value/);
  });

  it("rejects unknown stages", () => {
    expect(dealInputSchema.safeParse({ ...base, stage: "WON" }).success).toBe(false);
  });
});

describe("workspaceInputSchema", () => {
  it.each(["07", "27", "38", "97", ""])("accepts state code %j", (stateCode) => {
    expect(workspaceInputSchema.safeParse({ name: "Me", type: "CREATOR", stateCode }).success).toBe(true);
  });
  it.each(["99", "7", "00", "39"])("rejects state code %j", (stateCode) => {
    expect(workspaceInputSchema.safeParse({ name: "Me", type: "CREATOR", stateCode }).success).toBe(false);
  });
});

describe("waitlistInputSchema", () => {
  it("normalises email and the owed amount", () => {
    expect(waitlistInputSchema.parse({ email: "A@B.co", handle: "", role: "creator", owed: "40,000" })).toMatchObject({
      email: "a@b.co",
      owed: 40000,
    });
  });
});
