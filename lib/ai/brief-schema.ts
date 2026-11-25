// What the AI extracts from a pasted brand brief. Every field is nullable: briefs are messy and
// leaving a field empty is always better than guessing.
import { z } from "zod";
import { DELIVERABLE_FORMATS, PLATFORMS } from "@/lib/validation";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const briefExtractionSchema = z.object({
  brandName: z.string().max(80).nullable().describe("The brand's name, as written. Null if not stated."),
  campaignTitle: z
    .string()
    .max(80)
    .nullable()
    .describe("A short name for this collaboration, e.g. 'Diwali skincare reel'. Null if unclear."),
  dealType: z
    .enum(["PAID", "BARTER", "HYBRID"])
    .nullable()
    .describe("PAID = money only, BARTER = products only, HYBRID = money plus products. Null if unclear."),
  feeRupees: z.number().min(0).max(20_000_000).nullable().describe("Cash fee in rupees. Null if not stated."),
  feeIncludesGst: z
    .boolean()
    .nullable()
    .describe("True if the brief says the fee includes GST, false if it says plus GST, null if not mentioned."),
  productValueRupees: z.number().min(0).max(20_000_000).nullable().describe("Value of products given, in rupees. Null if not stated."),
  deliverables: z
    .array(
      z.object({
        platform: z.enum(PLATFORMS),
        format: z.enum(DELIVERABLE_FORMATS),
        count: z.number().int().min(1).max(20),
        dueDate: isoDate.nullable().describe("YYYY-MM-DD. Resolve relative dates against today's date. Null if none."),
      }),
    )
    .max(12),
  usageRightsMonths: z
    .number()
    .int()
    .min(0)
    .max(120)
    .nullable()
    .describe("How long the brand may reuse the content, in months. Null if not stated or if perpetual."),
  usageRightsPerpetual: z.boolean().describe("True if usage is forever, lifetime, perpetual or 'in perpetuity'."),
  paidAdsUsage: z
    .boolean()
    .describe("True if the brand will run the content as paid ads, boost it, whitelist it or use it on its own handles."),
  exclusivityDays: z
    .number()
    .int()
    .min(0)
    .max(3650)
    .nullable()
    .describe("Days the creator can't work with competing brands. Null if not stated."),
  paymentTermsDays: z
    .number()
    .int()
    .min(0)
    .max(365)
    .nullable()
    .describe("Days after posting or invoicing until payment. Null if not stated."),
  paymentConditional: z
    .boolean()
    .describe("True if payment depends on views, reach, sales or performance targets."),
  revisionsUnlimited: z.boolean().describe("True if the brief asks for unlimited or open-ended revisions."),
  ownershipTransfer: z
    .boolean()
    .describe("True if the brand will own the content or its copyright outright."),
  contactName: z.string().max(80).nullable(),
  contactEmail: z.string().max(120).nullable(),
  contactPhone: z.string().max(20).nullable(),
  otherConcerns: z
    .array(
      z.object({
        message: z.string().max(200).describe("Plain-English concern for the creator, one sentence."),
        evidence: z.string().max(200).describe("The exact words from the brief that raise it."),
      }),
    )
    .max(3)
    .describe("Up to 3 other terms a creator should question that the fields above don't cover. Empty if none."),
});

export type BriefExtraction = z.infer<typeof briefExtractionSchema>;

/** JSON Schema sent to Gemini so it can only answer in this shape. */
export const briefJsonSchema = z.toJSONSchema(briefExtractionSchema, { target: "draft-7" });
