// Turn an AI brief extraction into values for the deal form. Pure, so it's unit-tested.
import type { BriefExtraction } from "@/lib/ai/brief-schema";
import { normaliseIndianPhone } from "@/lib/reminders";

export interface DealDraft {
  form: {
    title: string;
    brandName: string;
    type: "PAID" | "BARTER" | "HYBRID";
    amount: string;
    productValue: string;
    usageRightsMonths: string;
    paymentTermsDays: string;
    notes: string;
  };
  deliverables: { platform: string; format: string; dueDate: string | null }[];
  contact: { name: string; email: string; phone: string };
}

const rupees = (n: number | null) => (n === null || n === 0 ? "" : String(Math.round(n * 100) / 100));

export function toDealDraft(b: BriefExtraction): DealDraft {
  const fee = b.feeRupees ?? 0;
  const product = b.productValueRupees ?? 0;
  const type = b.dealType ?? (fee > 0 && product > 0 ? "HYBRID" : product > 0 && fee === 0 ? "BARTER" : "PAID");

  // Terms the form has no field for go into the notes, so nothing from the brief is lost.
  const notes = [
    b.usageRightsPerpetual ? "Usage rights: perpetual (lifetime)." : null,
    b.paidAdsUsage ? "Brand will use the content in paid ads / on its own handles." : null,
    b.exclusivityDays ? `Exclusivity: ${b.exclusivityDays} days.` : null,
    b.feeIncludesGst === true ? "Quoted fee includes GST." : null,
    b.feeIncludesGst === false ? "Fee is plus GST." : null,
    b.paymentConditional ? "Payment depends on performance (views/sales)." : null,
    b.revisionsUnlimited ? "Brief asks for unlimited revisions." : null,
    b.ownershipTransfer ? "Brand wants to own the content." : null,
  ].filter(Boolean);

  const deliverables = b.deliverables.flatMap((d) =>
    Array.from({ length: Math.min(d.count, 10) }, () => ({ platform: d.platform, format: d.format, dueDate: d.dueDate })),
  );

  const email = b.contactEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.contactEmail) ? b.contactEmail : "";
  const phone = normaliseIndianPhone(b.contactPhone) ? (b.contactPhone ?? "") : "";

  return {
    form: {
      title: b.campaignTitle ?? (b.brandName ? `${b.brandName} collab` : ""),
      brandName: b.brandName ?? "",
      type,
      amount: type === "BARTER" ? "" : rupees(b.feeRupees),
      productValue: type === "PAID" ? "" : rupees(b.productValueRupees),
      usageRightsMonths: b.usageRightsPerpetual || b.usageRightsMonths === null ? "" : String(b.usageRightsMonths),
      paymentTermsDays: b.paymentTermsDays === null ? "30" : String(b.paymentTermsDays),
      notes: notes.length ? `From the brief:\n${notes.join("\n")}` : "",
    },
    deliverables: deliverables.slice(0, 20),
    contact: { name: b.contactName ?? "", email, phone },
  };
}
