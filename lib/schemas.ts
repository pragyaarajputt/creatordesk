// Validation for invoices, payments, brands and settings. Kept separate from lib/validation.ts (deals) for size.
import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";
import { normaliseIndianPhone } from "@/lib/reminders";
import { INVOICE_PREFIX_PATTERN } from "@/lib/fy";
import { stateCode } from "@/lib/validation";

const blankToUndefined = (v: string) => (v.trim() === "" ? undefined : v.trim());
const optional = <T extends z.ZodType<unknown, string>>(schema: T) => z.string().transform(blankToUndefined).pipe(schema.optional());

export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;
export const UPI_PATTERN = /^[\w.-]{2,256}@[a-zA-Z]{2,64}$/;

const gstin = z
  .string()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(GSTIN_PATTERN, "GSTIN should look like 07ABCDE1234F1Z5"));

const paiseField = (message: string, allowZero = false) =>
  z.string().transform((value, ctx) => {
    if (value.trim() === "" && allowZero) return 0;
    const paise = rupeesToPaise(value);
    if (paise === null || (!allowZero && paise === 0)) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return paise;
  });

/** The state code on a GSTIN is its first two digits; use it when the state wasn't typed. */
function withStateFromGstin<T extends { gstin?: string; stateCode?: string }>(v: T): T {
  if (v.gstin && !v.stateCode) return { ...v, stateCode: v.gstin.slice(0, 2) };
  return v;
}

export const RATE_OPTIONS = {
  gst: [0, 500, 1200, 1800, 2800],
  tds: [0, 100, 200, 1000],
} as const;

export const issueInvoiceSchema = z.object({
  kind: z.enum(["TAX_INVOICE", "BILL_OF_SUPPLY"]),
  gstRateBps: z.coerce.number().pipe(z.union(RATE_OPTIONS.gst.map((r) => z.literal(r)))),
  tdsRateBps: z.coerce.number().pipe(z.union(RATE_OPTIONS.tds.map((r) => z.literal(r)))),
  amount: z.string().transform((value, ctx) => {
    if (value.trim() === "") return undefined;
    const paise = rupeesToPaise(value);
    if (!paise) {
      ctx.addIssue({ code: "custom", message: "Enter the amount to invoice in rupees" });
      return z.NEVER;
    }
    return paise;
  }),
  description: optional(z.string().max(200)),
  issueDate: optional(z.iso.date("Pick a valid date")),
});

export const paymentSchema = z
  .object({
    amount: paiseField("Enter the amount received", true),
    tds: paiseField("Enter the TDS amount", true),
    receivedAt: z.iso.date("Pick the date you received it"),
    method: z.enum(["UPI", "BANK_TRANSFER", "CHEQUE", "CASH", "OTHER"]),
    reference: optional(z.string().max(80)),
  })
  .refine((p) => p.amount + p.tds > 0, { path: ["amount"], message: "Enter the amount received" });

export const voidSchema = z.object({ reason: z.string().trim().min(3, "Say why you're voiding it").max(200) });

export const brandSchema = z
  .object({
    name: z.string().trim().min(1, "Brand name is required").max(80),
    gstin: optional(gstin),
    stateCode: optional(stateCode),
    address: optional(z.string().max(300)),
    contactName: optional(z.string().max(80)),
    contactEmail: optional(z.email("Enter a valid email").max(120)),
    contactPhone: optional(
      z.string().refine((v) => normaliseIndianPhone(v) !== null, "Enter a 10-digit Indian mobile number"),
    ),
    notes: optional(z.string().max(1000)),
  })
  .transform(withStateFromGstin);

export const workspaceProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    legalName: optional(z.string().max(120)),
    gstin: optional(gstin),
    pan: optional(z.string().transform((v) => v.toUpperCase()).pipe(z.string().regex(PAN_PATTERN, "PAN should look like ABCDE1234F"))),
    address: optional(z.string().max(300)),
    stateCode: optional(stateCode),
    upiId: optional(z.string().regex(UPI_PATTERN, "UPI ID should look like name@bank")),
    invoicePrefix: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(INVOICE_PREFIX_PATTERN, "Use 1 to 3 capital letters or digits")),
  })
  .transform(withStateFromGstin);

export const inviteSchema = z.object({
  email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
  role: z.enum(["OWNER", "MANAGER", "VIEWER"]),
});

export const creatorSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  handle: optional(z.string().max(60)),
  platform: z.enum(["INSTAGRAM", "YOUTUBE", "LINKEDIN", "X", "OTHER"]),
});
