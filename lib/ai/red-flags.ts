// Red flags in a brand brief. Rules are plain code (predictable, testable); the AI only supplies the facts,
// plus up to three extra concerns it noticed, which are shown separately and labelled as AI suggestions.
import type { BriefExtraction } from "@/lib/ai/brief-schema";

export type FlagSeverity = "high" | "medium" | "low";

export interface RedFlag {
  code: string;
  severity: FlagSeverity;
  message: string;
  source: "rule" | "ai";
  evidence?: string;
}

const RANK: Record<FlagSeverity, number> = { high: 0, medium: 1, low: 2 };

export function redFlags(b: BriefExtraction): RedFlag[] {
  const flags: RedFlag[] = [];
  const add = (code: string, severity: FlagSeverity, message: string) =>
    flags.push({ code, severity, message, source: "rule" });

  const paid = b.dealType === "PAID" || b.dealType === "HYBRID" || (b.feeRupees ?? 0) > 0;
  const totalDeliverables = b.deliverables.reduce((s, d) => s + d.count, 0);

  if (b.ownershipTransfer) {
    add("OWNERSHIP_TRANSFER", "high", "The brand wants to own your content outright. Ask for a usage licence instead, or charge much more.");
  }
  if (b.usageRightsPerpetual) {
    add("PERPETUAL_USAGE", "high", "Lifetime usage rights. Most creators limit usage to 1–3 months and charge extra beyond that.");
  } else if (b.usageRightsMonths !== null && b.usageRightsMonths > 6) {
    add("LONG_USAGE", "medium", `${b.usageRightsMonths} months of usage rights is long. Charge extra, or negotiate 3 months.`);
  }
  if (b.paymentConditional) {
    add("CONDITIONAL_PAYMENT", "high", "Payment depends on views or sales, which you don't control. Ask for a fixed fee, with any bonus on top.");
  }
  if (b.paidAdsUsage) {
    add("PAID_ADS", "medium", "The brand plans to run your content as ads or on its own handles. That's usually charged separately.");
  }
  if (b.exclusivityDays !== null && b.exclusivityDays > 30) {
    add("LONG_EXCLUSIVITY", "medium", `${b.exclusivityDays} days of exclusivity blocks other brand deals. Charge for it, or shorten it.`);
  }
  if (b.paymentTermsDays !== null && b.paymentTermsDays > 90) {
    add("VERY_LONG_PAYMENT_TERMS", "high", `Payment ${b.paymentTermsDays} days later is very long. Ask for 30 days, or an advance.`);
  } else if (b.paymentTermsDays !== null && b.paymentTermsDays > 45) {
    add("LONG_PAYMENT_TERMS", "medium", `Payment ${b.paymentTermsDays} days later is long. 30 days, or 50% upfront, is a fair ask.`);
  } else if (paid && b.paymentTermsDays === null) {
    add("NO_PAYMENT_TERMS", "low", "No payment date is mentioned. Agree on one in writing before you post.");
  }
  if (b.revisionsUnlimited) {
    add("UNLIMITED_REVISIONS", "medium", "Unlimited revisions can eat your time. Offer 1–2 rounds included.");
  }
  if (b.dealType === "BARTER" && totalDeliverables >= 3) {
    add("HEAVY_BARTER", "medium", `${totalDeliverables} deliverables for products only is a lot of work unpaid. Ask for a fee, or cut the deliverables.`);
  }
  if (b.feeIncludesGst === true) {
    add("FEE_INCLUDES_GST", "low", "The fee includes GST, so your actual earning is lower than the headline number.");
  }

  for (const c of b.otherConcerns) {
    flags.push({ code: "AI_NOTE", severity: "low", message: c.message, evidence: c.evidence, source: "ai" });
  }
  return flags.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
