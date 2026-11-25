import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";

export const DEAL_STAGES = [
  "PITCHED",
  "NEGOTIATING",
  "AGREED",
  "IN_PRODUCTION",
  "POSTED",
  "INVOICED",
  "PAID",
  "LOST",
  "CANCELLED",
] as const;

export const OPEN_STAGES = DEAL_STAGES.filter((s) => s !== "LOST" && s !== "CANCELLED");

export const STAGE_LABEL: Record<(typeof DEAL_STAGES)[number], string> = {
  PITCHED: "Pitched",
  NEGOTIATING: "Negotiating",
  AGREED: "Agreed",
  IN_PRODUCTION: "In production",
  POSTED: "Posted",
  INVOICED: "Invoiced",
  PAID: "Paid",
  LOST: "Lost",
  CANCELLED: "Cancelled",
};

export const DEAL_TYPES = ["PAID", "BARTER", "HYBRID"] as const;
export const PLATFORMS = ["INSTAGRAM", "YOUTUBE", "LINKEDIN", "X", "OTHER"] as const;
export const DELIVERABLE_FORMATS = ["REEL", "STORY", "POST", "CAROUSEL", "VIDEO", "SHORT", "LIVE", "OTHER"] as const;
export const DELIVERABLE_STATUSES = ["TODO", "DRAFT_SENT", "APPROVED", "POSTED"] as const;

/** Indian GST state codes 01-38 plus 97 (other territory). */
export const stateCode = z
  .string()
  .trim()
  .regex(/^(0[1-9]|[12]\d|3[0-8]|97)$/, "Use the 2-digit GST state code, e.g. 07 for Delhi");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

const rupees = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return 0;
    const paise = rupeesToPaise(value);
    if (paise === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in rupees, e.g. 25000 or 1499.50" });
      return z.NEVER;
    }
    return paise;
  });

const optionalInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return undefined;
      const n = Number(value.replace(/,/g, ""));
      if (!/^\d[\d,]*$/.test(value) || !Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `Enter a whole number from ${min} to ${max.toLocaleString("en-IN")}` });
        return z.NEVER;
      }
      return n;
    });

const briefDeliverables = z
  .array(
    z.object({
      platform: z.enum(PLATFORMS),
      format: z.enum(DELIVERABLE_FORMATS),
      dueDate: z.iso.date().nullable(),
    }),
  )
  .max(20);

export const dealInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give the deal a name").max(120),
    brandName: z.string().trim().min(1, "Which brand is this with?").max(80),
    type: z.enum(DEAL_TYPES),
    stage: z.enum(DEAL_STAGES).default("PITCHED"),
    amount: rupees,
    productValue: rupees,
    usageRightsMonths: optionalInt(0, 120),
    paymentTermsDays: optionalInt(0, 180).transform((v) => v ?? 30),
    notes: optionalText(2000),
    creatorId: optionalText(40),
    // Filled from an AI-read brief (hidden fields). Optional for the normal form.
    deliverablesJson: z
      .string()
      .optional()
      .transform((value, ctx) => {
        if (!value) return [];
        try {
          return briefDeliverables.parse(JSON.parse(value));
        } catch {
          ctx.addIssue({ code: "custom", message: "The deliverables from the brief couldn't be read. Remove them and add by hand." });
          return z.NEVER;
        }
      }),
    contactName: optionalText(80),
    contactEmail: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.email("Enter a valid email").optional()),
    contactPhone: optionalText(20),
  })
  .superRefine((deal, ctx) => {
    if (deal.type !== "BARTER" && deal.amount <= 0) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Paid and hybrid deals need a fee" });
    }
    if (deal.type !== "PAID" && deal.productValue <= 0) {
      ctx.addIssue({ code: "custom", path: ["productValue"], message: "Add the product's value for barter deals" });
    }
  });

export type DealInput = z.output<typeof dealInputSchema>;

export const deliverableInputSchema = z.object({
  platform: z.enum(PLATFORMS),
  format: z.enum(DELIVERABLE_FORMATS),
  dueDate: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.iso.date().optional()),
});

export type DeliverableInput = z.output<typeof deliverableInputSchema>;

export const workspaceInputSchema = z.object({
  name: z.string().trim().min(1, "Name your workspace").max(80),
  type: z.enum(["CREATOR", "AGENCY"]),
  stateCode: stateCode.optional().or(z.literal("").transform(() => undefined)),
});

export const waitlistInputSchema = z.object({
  email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
  handle: optionalText(60),
  role: z.enum(["creator", "agency", "other"]),
  owed: optionalInt(0, 100_000_000),
});

/** Turn a FormData into a plain object of strings for zod. */
export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    // Skip React's internal "$ACTION_…" fields.
    if (typeof value === "string" && !key.startsWith("$")) out[key] = value;
  }
  return out;
}

/** Flatten zod issues into { field: firstMessage }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
