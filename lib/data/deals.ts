import "server-only";
import { writeAudit } from "@/lib/audit";
import { prisma, type Tx } from "@/lib/db";
import type { DealStage, DeliverableStatus } from "@/lib/generated/prisma/client";
import { assertRole, type WorkspaceContext } from "@/lib/roles";
import type { DealInput, DeliverableInput } from "@/lib/validation";
import { istMidnight } from "@/lib/fy";

type Ctx = Pick<WorkspaceContext, "workspaceId" | "userId" | "role">;

export class NotFoundError extends Error {
  constructor(what = "Record") {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export async function listDeals(ctx: Ctx, filter: { creatorId?: string } = {}) {
  return prisma.deal.findMany({
    where: { workspaceId: ctx.workspaceId, ...(filter.creatorId ? { creatorId: filter.creatorId } : {}) },
    include: {
      brand: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { deliverables: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getDeal(ctx: Ctx, dealId: string) {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, workspaceId: ctx.workspaceId },
    include: {
      brand: true,
      creator: { select: { id: true, name: true } },
      deliverables: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
      invoices: { orderBy: { issueDate: "desc" }, include: { payments: { select: { amountPaise: true, tdsPaise: true } } } },
    },
  });
  if (!deal) throw new NotFoundError("Deal");
  return deal;
}

/** A deal can only point at a creator in the same workspace. */
async function checkCreator(tx: Tx, ctx: Ctx, creatorId: string | undefined) {
  if (!creatorId) return null;
  const creator = await tx.creator.findFirst({ where: { id: creatorId, workspaceId: ctx.workspaceId } });
  if (!creator) throw new NotFoundError("Creator");
  return creator.id;
}

export async function createDeal(ctx: Ctx, input: DealInput) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const creatorId = await checkCreator(tx, ctx, input.creatorId);
    const contact = {
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
    };
    const brand = await tx.brand.upsert({
      where: { workspaceId_name: { workspaceId: ctx.workspaceId, name: input.brandName } },
      update: {},
      create: { workspaceId: ctx.workspaceId, name: input.brandName, ...contact },
    });
    // An existing brand only gets contact details it doesn't have yet; nothing is overwritten.
    const missing = Object.fromEntries(
      Object.entries(contact).filter(([key, value]) => value && !brand[key as keyof typeof contact]),
    );
    if (Object.keys(missing).length) await tx.brand.update({ where: { id: brand.id }, data: missing });

    const deal = await tx.deal.create({
      data: {
        workspaceId: ctx.workspaceId,
        brandId: brand.id,
        creatorId,
        title: input.title,
        stage: input.stage,
        type: input.type,
        amountPaise: input.amount,
        productValuePaise: input.productValue,
        usageRightsMonths: input.usageRightsMonths,
        paymentTermsDays: input.paymentTermsDays,
        notes: input.notes,
      },
    });
    if (input.deliverablesJson?.length) {
      await tx.deliverable.createMany({
        data: input.deliverablesJson.map((d) => ({
          workspaceId: ctx.workspaceId,
          dealId: deal.id,
          platform: d.platform,
          format: d.format,
          dueDate: d.dueDate ? istMidnight(d.dueDate) : null,
        })),
      });
    }
    await writeAudit(tx, ctx, {
      action: "deal.create",
      entity: "Deal",
      entityId: deal.id,
      after: { ...deal, deliverables: input.deliverablesJson?.length ?? 0 },
    });
    return deal;
  });
}

export async function updateDeal(ctx: Ctx, dealId: string, input: DealInput) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const before = await tx.deal.findFirst({ where: { id: dealId, workspaceId: ctx.workspaceId } });
    if (!before) throw new NotFoundError("Deal");
    const creatorId = await checkCreator(tx, ctx, input.creatorId);
    const brand = await tx.brand.upsert({
      where: { workspaceId_name: { workspaceId: ctx.workspaceId, name: input.brandName } },
      update: {},
      create: { workspaceId: ctx.workspaceId, name: input.brandName },
    });
    const after = await tx.deal.update({
      where: { id: before.id },
      data: {
        brandId: brand.id,
        creatorId,
        title: input.title,
        stage: input.stage,
        type: input.type,
        amountPaise: input.amount,
        productValuePaise: input.productValue,
        usageRightsMonths: input.usageRightsMonths ?? null,
        paymentTermsDays: input.paymentTermsDays,
        notes: input.notes ?? null,
      },
    });
    await writeAudit(tx, ctx, { action: "deal.update", entity: "Deal", entityId: after.id, before, after });
    return after;
  });
}

export async function moveDealStage(ctx: Ctx, dealId: string, stage: DealStage) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const before = await tx.deal.findFirst({ where: { id: dealId, workspaceId: ctx.workspaceId } });
    if (!before) throw new NotFoundError("Deal");
    if (before.stage === stage) return before;
    const after = await tx.deal.update({ where: { id: before.id }, data: { stage } });
    await writeAudit(tx, ctx, {
      action: "deal.stage",
      entity: "Deal",
      entityId: after.id,
      before: { stage: before.stage },
      after: { stage: after.stage },
    });
    return after;
  });
}

export async function deleteDeal(ctx: Ctx, dealId: string) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findFirst({
      where: { id: dealId, workspaceId: ctx.workspaceId },
      include: { _count: { select: { invoices: true } } },
    });
    if (!deal) throw new NotFoundError("Deal");
    if (deal._count.invoices > 0) {
      throw new Error("This deal has invoices. Mark it cancelled instead of deleting it.");
    }
    await tx.deal.delete({ where: { id: deal.id } });
    await writeAudit(tx, ctx, { action: "deal.delete", entity: "Deal", entityId: deal.id, before: deal });
  });
}

export async function addDeliverable(ctx: Ctx, dealId: string, input: DeliverableInput) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findFirst({ where: { id: dealId, workspaceId: ctx.workspaceId } });
    if (!deal) throw new NotFoundError("Deal");
    const deliverable = await tx.deliverable.create({
      data: {
        workspaceId: ctx.workspaceId,
        dealId: deal.id,
        platform: input.platform,
        format: input.format,
        dueDate: input.dueDate ? istMidnight(input.dueDate) : null,
      },
    });
    await writeAudit(tx, ctx, {
      action: "deliverable.create",
      entity: "Deliverable",
      entityId: deliverable.id,
      after: deliverable,
    });
    return deliverable;
  });
}

export async function setDeliverableStatus(
  ctx: Ctx,
  deliverableId: string,
  status: DeliverableStatus,
  postedUrl?: string,
) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const before = await tx.deliverable.findFirst({
      where: { id: deliverableId, workspaceId: ctx.workspaceId },
    });
    if (!before) throw new NotFoundError("Deliverable");
    const after = await tx.deliverable.update({
      where: { id: before.id },
      data: { status, postedUrl: postedUrl ?? before.postedUrl },
    });
    await writeAudit(tx, ctx, {
      action: "deliverable.status",
      entity: "Deliverable",
      entityId: after.id,
      before: { status: before.status },
      after: { status: after.status, postedUrl: after.postedUrl },
    });
    return after;
  });
}
