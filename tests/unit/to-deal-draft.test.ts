import { describe, expect, it } from "vitest";
import type { BriefExtraction } from "@/lib/ai/brief-schema";
import { toDealDraft } from "@/lib/ai/to-deal-draft";
import { dealInputSchema } from "@/lib/validation";

const base: BriefExtraction = {
  brandName: "Glow Co",
  campaignTitle: "Diwali reel",
  dealType: "PAID",
  feeRupees: 25000,
  feeIncludesGst: false,
  productValueRupees: null,
  deliverables: [
    { platform: "INSTAGRAM", format: "REEL", count: 1, dueDate: "2026-12-05" },
    { platform: "INSTAGRAM", format: "STORY", count: 2, dueDate: null },
  ],
  usageRightsMonths: 3,
  usageRightsPerpetual: false,
  paidAdsUsage: false,
  exclusivityDays: null,
  paymentTermsDays: 30,
  paymentConditional: false,
  revisionsUnlimited: false,
  ownershipTransfer: false,
  contactName: "Riya",
  contactEmail: "riya@glowco.example",
  contactPhone: "+91 98765 43210",
  otherConcerns: [],
};

describe("toDealDraft", () => {
  it("fills the deal form, expands deliverable counts and keeps the contact", () => {
    const d = toDealDraft(base);
    expect(d.form).toMatchObject({ title: "Diwali reel", brandName: "Glow Co", type: "PAID", amount: "25000", usageRightsMonths: "3", paymentTermsDays: "30" });
    expect(d.deliverables).toHaveLength(3);
    expect(d.deliverables[0]).toEqual({ platform: "INSTAGRAM", format: "REEL", dueDate: "2026-12-05" });
    expect(d.contact).toEqual({ name: "Riya", email: "riya@glowco.example", phone: "+91 98765 43210" });
  });

  it("produces values the deal form's own validation accepts", () => {
    const d = toDealDraft(base);
    const parsed = dealInputSchema.safeParse({ ...d.form, stage: "PITCHED" });
    expect(parsed.success).toBe(true);
  });

  it("infers the deal type when the brief doesn't say", () => {
    expect(toDealDraft({ ...base, dealType: null, feeRupees: null, productValueRupees: 5000 }).form.type).toBe("BARTER");
    expect(toDealDraft({ ...base, dealType: null, productValueRupees: 5000 }).form.type).toBe("HYBRID");
  });

  it("keeps terms without a form field in the notes", () => {
    const d = toDealDraft({ ...base, usageRightsPerpetual: true, usageRightsMonths: null, exclusivityDays: 90, paidAdsUsage: true });
    expect(d.form.usageRightsMonths).toBe("");
    expect(d.form.notes).toContain("perpetual");
    expect(d.form.notes).toContain("Exclusivity: 90 days");
    expect(d.form.notes).toContain("paid ads");
  });

  it("drops contact details that aren't valid", () => {
    const d = toDealDraft({ ...base, contactEmail: "not-an-email", contactPhone: "12345" });
    expect(d.contact).toMatchObject({ email: "", phone: "" });
  });

  it("defaults payment terms to 30 days and handles an empty brief", () => {
    const empty = toDealDraft({ ...base, brandName: null, campaignTitle: null, feeRupees: null, paymentTermsDays: null, deliverables: [], contactName: null, contactEmail: null, contactPhone: null });
    expect(empty.form).toMatchObject({ title: "", brandName: "", amount: "", paymentTermsDays: "30" });
    expect(empty.deliverables).toEqual([]);
  });
});
