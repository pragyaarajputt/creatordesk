import "server-only";
import { writeAudit } from "@/lib/audit";
import { prisma, type Tx } from "@/lib/db";
import { addDays, financialYear, formatInvoiceNumber } from "@/lib/fy";
import { computeInvoiceTotals, outstandingPaise } from "@/lib/money";
import { daysOverdue } from "@/lib/reminders";
import type {
  InvoiceKind,
  InvoiceStatus,
  PaymentMethod,
  ReminderChannel,
  ReminderKind,
} from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { assertRole, type WorkspaceContext } from "@/lib/roles";
import { NotFoundError } from "@/lib/data/deals";
import { decryptField, encryptOptional } from "@/lib/security/crypto";

type Ctx = Pick<WorkspaceContext, "workspaceId" | "userId" | "role">;

/** A business-rule violation with a message safe to show the user. */
export class InvoiceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceRuleError";
  }
}

export interface IssueInvoiceInput {
  kind: InvoiceKind;
  gstRateBps: number;
  tdsRateBps: number;
  /** Amount to invoice before GST. Defaults to the deal fee not yet invoiced (supports advance + balance). */
  amountPaise?: number;
  issueDate?: Date;
  description?: string;
}

/**
 * Take the next invoice number for a workspace and financial year.
 * The upsert locks the counter row until the surrounding transaction ends, so concurrent
 * requests queue up instead of colliding, and a rolled-back invoice also rolls back its number.
 * Result: numbers are unique and have no gaps.
 */
async function nextInvoiceSeq(tx: Tx, workspaceId: string, fy: string): Promise<number> {
  const rows = await tx.$queryRaw<{ lastSeq: number }[]>`
    INSERT INTO "InvoiceCounter" ("workspaceId", "financialYear", "lastSeq")
    VALUES (${workspaceId}, ${fy}, 1)
    ON CONFLICT ("workspaceId", "financialYear")
    DO UPDATE SET "lastSeq" = "InvoiceCounter"."lastSeq" + 1
    RETURNING "lastSeq"`;
  return rows[0].lastSeq;
}

export async function issueInvoice(ctx: Ctx, dealId: string, input: IssueInvoiceInput) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findFirst({
      where: { id: dealId, workspaceId: ctx.workspaceId },
      include: { brand: true, workspace: true, invoices: { where: { status: { not: "VOID" } } } },
    });
    if (!deal) throw new NotFoundError("Deal");
    if (deal.amountPaise <= 0) throw new InvoiceRuleError("This deal has no fee to invoice.");

    const alreadyInvoiced = deal.invoices.reduce((sum, i) => sum + i.subtotalPaise, 0);
    const remaining = deal.amountPaise - alreadyInvoiced;
    if (remaining <= 0) throw new InvoiceRuleError("This deal's fee is already fully invoiced.");
    const amount = input.amountPaise ?? remaining;
    if (amount > remaining) {
      throw new InvoiceRuleError("That's more than the fee left to invoice on this deal.");
    }
    if (input.kind === "TAX_INVOICE" && !deal.workspace.gstin) {
      throw new InvoiceRuleError("Add your GSTIN in Settings before issuing a tax invoice, or issue a bill of supply.");
    }

    const issueDate = input.issueDate ?? new Date();
    const fy = financialYear(issueDate);
    const seq = await nextInvoiceSeq(tx, ctx.workspaceId, fy);
    const number = formatInvoiceNumber(deal.workspace.invoicePrefix, fy, seq);

    const totals = computeInvoiceTotals({
      subtotalPaise: amount,
      kind: input.kind,
      gstRateBps: input.gstRateBps,
      supplierStateCode: deal.workspace.stateCode,
      recipientStateCode: deal.brand.stateCode,
    });

    const invoice = await tx.invoice.create({
      data: {
        workspaceId: ctx.workspaceId,
        dealId: deal.id,
        financialYear: fy,
        seq,
        number,
        kind: input.kind,
        issueDate,
        dueDate: addDays(issueDate, deal.paymentTermsDays),
        lineItems: [{ description: input.description ?? deal.title, amountPaise: amount }],
        subtotalPaise: totals.subtotalPaise,
        gstRateBps: totals.gstRateBps,
        cgstPaise: totals.cgstPaise,
        sgstPaise: totals.sgstPaise,
        igstPaise: totals.igstPaise,
        totalPaise: totals.totalPaise,
        tdsRateBps: input.tdsRateBps,
        supplier: {
          name: deal.workspace.legalName ?? deal.workspace.name,
          gstin: deal.workspace.gstin,
          // Re-encrypted with a fresh IV for the invoice snapshot; decrypted only to print the PDF.
          pan: encryptOptional(decryptField(deal.workspace.pan)),
          address: deal.workspace.address,
          stateCode: deal.workspace.stateCode,
          upiId: deal.workspace.upiId,
        },
        recipient: {
          name: deal.brand.name,
          gstin: deal.brand.gstin,
          address: deal.brand.address,
          stateCode: deal.brand.stateCode,
        },
      },
    });

    if (deal.stage !== "PAID") {
      await tx.deal.update({ where: { id: deal.id }, data: { stage: "INVOICED" } });
    }
    await writeAudit(tx, ctx, { action: "invoice.issue", entity: "Invoice", entityId: invoice.id, after: invoice });
    return invoice;
  });
}

const invoiceListInclude = {
  payments: { select: { amountPaise: true, tdsPaise: true, receivedAt: true } },
  deal: { select: { id: true, title: true, brand: { select: { id: true, name: true } } } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceFilter = "all" | "outstanding" | "overdue" | "paid" | "void";

export async function listInvoices(ctx: Ctx, filter: InvoiceFilter = "all", now = new Date()) {
  const where: Prisma.InvoiceWhereInput = { workspaceId: ctx.workspaceId };
  if (filter === "paid") where.status = "PAID";
  else if (filter === "void") where.status = "VOID";
  else if (filter === "outstanding" || filter === "overdue") where.status = { in: ["ISSUED", "PARTIALLY_PAID"] };

  const invoices = await prisma.invoice.findMany({
    where,
    include: invoiceListInclude,
    orderBy: [{ issueDate: "desc" }, { seq: "desc" }],
  });
  const rows = invoices.map((inv) => withMoney(inv, now));
  return filter === "overdue" ? rows.filter((r) => r.overdueDays > 0) : rows;
}

/** Add outstanding amount and days overdue to an invoice row. */
export function withMoney<
  T extends { status: InvoiceStatus; totalPaise: number; dueDate: Date; payments: { amountPaise: number; tdsPaise: number }[] },
>(inv: T, now: Date) {
  const outstanding = inv.status === "VOID" ? 0 : outstandingPaise(inv.totalPaise, inv.payments);
  const overdueDays = outstanding > 0 ? Math.max(0, daysOverdue(inv.dueDate, now)) : 0;
  return { ...inv, outstandingPaise: outstanding, overdueDays };
}

export async function getInvoice(ctx: Ctx, invoiceId: string, now = new Date()) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId: ctx.workspaceId },
    include: {
      payments: { orderBy: { receivedAt: "asc" } },
      reminders: { orderBy: { createdAt: "asc" } },
      deal: { include: { brand: true } },
      workspace: { select: { name: true, legalName: true, upiId: true } },
    },
  });
  if (!invoice) throw new NotFoundError("Invoice");
  return withMoney(invoice, now);
}

/** Recalculate an invoice's status from its payments, and keep the deal stage in step. */
async function syncStatus(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
  if (inv.status === "VOID") return inv;
  const outstanding = outstandingPaise(inv.totalPaise, inv.payments);
  const status: InvoiceStatus = outstanding === 0 ? "PAID" : inv.payments.length > 0 ? "PARTIALLY_PAID" : "ISSUED";
  const updated = status === inv.status ? inv : await tx.invoice.update({ where: { id: inv.id }, data: { status } });

  const siblings = await tx.invoice.findMany({ where: { dealId: inv.dealId, status: { not: "VOID" } } });
  const deal = await tx.deal.findUniqueOrThrow({ where: { id: inv.dealId } });
  const allPaid = siblings.length > 0 && siblings.every((s) => s.status === "PAID");
  if (allPaid && deal.stage !== "PAID") {
    await tx.deal.update({ where: { id: deal.id }, data: { stage: "PAID" } });
  } else if (!allPaid && deal.stage === "PAID") {
    await tx.deal.update({ where: { id: deal.id }, data: { stage: "INVOICED" } });
  }
  return updated;
}

export interface PaymentInput {
  amountPaise: number;
  tdsPaise: number;
  receivedAt: Date;
  method: PaymentMethod;
  reference?: string;
}

export async function recordPayment(ctx: Ctx, invoiceId: string, input: PaymentInput) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, workspaceId: ctx.workspaceId },
      include: { payments: true },
    });
    if (!inv) throw new NotFoundError("Invoice");
    if (inv.status === "VOID") throw new InvoiceRuleError("This invoice is void.");
    const outstanding = outstandingPaise(inv.totalPaise, inv.payments);
    if (input.amountPaise + input.tdsPaise > outstanding) {
      throw new InvoiceRuleError("That's more than what's outstanding on this invoice.");
    }
    const payment = await tx.payment.create({
      data: {
        workspaceId: ctx.workspaceId,
        invoiceId: inv.id,
        amountPaise: input.amountPaise,
        tdsPaise: input.tdsPaise,
        receivedAt: input.receivedAt,
        method: input.method,
        reference: input.reference,
      },
    });
    await writeAudit(tx, ctx, { action: "payment.record", entity: "Payment", entityId: payment.id, after: payment });
    await syncStatus(tx, inv.id);
    return payment;
  });
}

export async function deletePayment(ctx: Ctx, paymentId: string) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: paymentId, workspaceId: ctx.workspaceId } });
    if (!payment) throw new NotFoundError("Payment");
    await tx.payment.delete({ where: { id: payment.id } });
    await writeAudit(tx, ctx, { action: "payment.delete", entity: "Payment", entityId: payment.id, before: payment });
    await syncStatus(tx, payment.invoiceId);
  });
}

/** Void keeps the number (so numbering stays gap-free) but takes the invoice out of every total. */
export async function voidInvoice(ctx: Ctx, invoiceId: string, reason: string) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, workspaceId: ctx.workspaceId },
      include: { _count: { select: { payments: true } } },
    });
    if (!inv) throw new NotFoundError("Invoice");
    if (inv.status === "VOID") return inv;
    if (inv._count.payments > 0) {
      throw new InvoiceRuleError("Remove the payments recorded on this invoice before voiding it.");
    }
    const voided = await tx.invoice.update({
      where: { id: inv.id },
      data: { status: "VOID", voidedAt: new Date(), voidReason: reason },
    });
    const active = await tx.invoice.count({ where: { dealId: inv.dealId, status: { not: "VOID" } } });
    if (active === 0) {
      await tx.deal.update({ where: { id: inv.dealId }, data: { stage: "POSTED" } });
    }
    await writeAudit(tx, ctx, {
      action: "invoice.void",
      entity: "Invoice",
      entityId: inv.id,
      before: { status: inv.status },
      after: { status: "VOID", reason },
    });
    return voided;
  });
}

/** Log that a reminder was sent. Idempotent per invoice + kind + channel. */
export async function logReminder(ctx: Ctx, invoiceId: string, kind: ReminderKind, channel: ReminderChannel) {
  assertRole(ctx, "MANAGER");
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, workspaceId: ctx.workspaceId } });
  if (!inv) throw new NotFoundError("Invoice");
  const idempotencyKey = `${inv.id}:${kind}:${channel}`;
  try {
    return await prisma.$transaction(async (tx) => {
      const reminder = await tx.reminder.create({
        data: {
          workspaceId: ctx.workspaceId,
          dealId: inv.dealId,
          invoiceId: inv.id,
          kind,
          channel,
          scheduledFor: new Date(),
          sentAt: new Date(),
          idempotencyKey,
        },
      });
      await writeAudit(tx, ctx, { action: "reminder.sent", entity: "Reminder", entityId: reminder.id, after: reminder });
      return reminder;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.reminder.findUniqueOrThrow({ where: { idempotencyKey } });
    }
    throw error;
  }
}

