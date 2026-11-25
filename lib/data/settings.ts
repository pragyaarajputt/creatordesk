import "server-only";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import type { MemberRole, Platform } from "@/lib/generated/prisma/client";
import { assertRole, ForbiddenError, type WorkspaceContext } from "@/lib/roles";
import { NotFoundError } from "@/lib/data/deals";
import { decryptField, encryptOptional } from "@/lib/security/crypto";

type Ctx = Pick<WorkspaceContext, "workspaceId" | "userId" | "role">;

// ─── Brands ──────────────────────────────────────────────────────────────────

export async function listBrands(ctx: Ctx) {
  return prisma.brand.findMany({
    where: { workspaceId: ctx.workspaceId },
    include: { _count: { select: { deals: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getBrand(ctx: Ctx, brandId: string) {
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, workspaceId: ctx.workspaceId },
    include: { deals: { select: { id: true, title: true, stage: true, amountPaise: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!brand) throw new NotFoundError("Brand");
  return brand;
}

export interface BrandInput {
  name: string;
  gstin?: string;
  stateCode?: string;
  address?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

export async function updateBrand(ctx: Ctx, brandId: string, input: BrandInput) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const before = await tx.brand.findFirst({ where: { id: brandId, workspaceId: ctx.workspaceId } });
    if (!before) throw new NotFoundError("Brand");
    const clash = await tx.brand.findFirst({
      where: { workspaceId: ctx.workspaceId, name: input.name, id: { not: before.id } },
    });
    if (clash) throw new ForbiddenError(`You already have a brand called ${input.name}.`);
    const after = await tx.brand.update({
      where: { id: before.id },
      data: {
        name: input.name,
        gstin: input.gstin ?? null,
        stateCode: input.stateCode ?? null,
        address: input.address ?? null,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        notes: input.notes ?? null,
      },
    });
    await writeAudit(tx, ctx, { action: "brand.update", entity: "Brand", entityId: after.id, before, after });
    return after;
  });
}

// ─── Workspace profile (printed on invoices) ─────────────────────────────────

/** The workspace with its PAN decrypted. Callers decide who may see it (see maskPan). */
export async function getWorkspace(ctx: Ctx) {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
  return { ...ws, pan: decryptField(ws.pan) };
}

export interface WorkspaceProfileInput {
  name: string;
  legalName?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  stateCode?: string;
  upiId?: string;
  invoicePrefix: string;
}

export async function updateWorkspaceProfile(ctx: Ctx, input: WorkspaceProfileInput) {
  assertRole(ctx, "OWNER");
  return prisma.$transaction(async (tx) => {
    const before = await tx.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    const after = await tx.workspace.update({
      where: { id: ctx.workspaceId },
      data: {
        name: input.name,
        legalName: input.legalName ?? null,
        gstin: input.gstin ?? null,
        pan: encryptOptional(input.pan),
        address: input.address ?? null,
        stateCode: input.stateCode ?? null,
        upiId: input.upiId ?? null,
        invoicePrefix: input.invoicePrefix,
      },
    });
    // PAN stays out of the audit log in any form.
    const redact = <T extends { pan: string | null }>(w: T) => ({ ...w, pan: w.pan ? "[encrypted]" : null });
    await writeAudit(tx, ctx, { action: "workspace.update", entity: "Workspace", entityId: after.id, before: redact(before), after: redact(after) });
    return after;
  });
}

// ─── Members and invites ─────────────────────────────────────────────────────

export async function listTeam(ctx: Ctx) {
  const [members, invites] = await Promise.all([
    prisma.member.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({ where: { workspaceId: ctx.workspaceId, acceptedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  return { members, invites };
}

/** Add someone by email. Existing users join immediately; others get access at their first sign-in. */
export async function inviteMember(ctx: Ctx, email: string, role: MemberRole) {
  assertRole(ctx, "OWNER");
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email } });
    if (user) {
      const member = await tx.member.upsert({
        where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: user.id } },
        update: {},
        create: { workspaceId: ctx.workspaceId, userId: user.id, role },
      });
      await writeAudit(tx, ctx, { action: "member.add", entity: "Member", entityId: member.id, after: { email, role } });
      return { joined: true as const };
    }
    const invite = await tx.invite.upsert({
      where: { workspaceId_email: { workspaceId: ctx.workspaceId, email } },
      update: { role },
      create: { workspaceId: ctx.workspaceId, email, role, invitedById: ctx.userId },
    });
    await writeAudit(tx, ctx, { action: "invite.create", entity: "Invite", entityId: invite.id, after: { email, role } });
    return { joined: false as const };
  });
}

export async function cancelInvite(ctx: Ctx, inviteId: string) {
  assertRole(ctx, "OWNER");
  const invite = await prisma.invite.findFirst({ where: { id: inviteId, workspaceId: ctx.workspaceId } });
  if (!invite) throw new NotFoundError("Invite");
  await prisma.invite.delete({ where: { id: invite.id } });
}

/** Called at sign-in: turn pending invites for this email into memberships. */
export async function acceptInvites(userId: string, email: string) {
  const invites = await prisma.invite.findMany({ where: { email: email.toLowerCase(), acceptedAt: null } });
  for (const invite of invites) {
    await prisma.$transaction(async (tx) => {
      await tx.member.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
        update: {},
        create: { workspaceId: invite.workspaceId, userId, role: invite.role },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      await writeAudit(tx, { workspaceId: invite.workspaceId, userId }, {
        action: "invite.accept",
        entity: "Invite",
        entityId: invite.id,
      });
    });
  }
  return invites.length;
}

async function ownerCount(workspaceId: string) {
  return prisma.member.count({ where: { workspaceId, role: "OWNER" } });
}

export async function changeRole(ctx: Ctx, memberId: string, role: MemberRole) {
  assertRole(ctx, "OWNER");
  const member = await prisma.member.findFirst({ where: { id: memberId, workspaceId: ctx.workspaceId } });
  if (!member) throw new NotFoundError("Member");
  if (member.role === "OWNER" && role !== "OWNER" && (await ownerCount(ctx.workspaceId)) === 1) {
    throw new ForbiddenError("A workspace needs at least one owner.");
  }
  return prisma.$transaction(async (tx) => {
    const after = await tx.member.update({ where: { id: member.id }, data: { role } });
    await writeAudit(tx, ctx, {
      action: "member.role",
      entity: "Member",
      entityId: member.id,
      before: { role: member.role },
      after: { role },
    });
    return after;
  });
}

export async function removeMember(ctx: Ctx, memberId: string) {
  assertRole(ctx, "OWNER");
  const member = await prisma.member.findFirst({ where: { id: memberId, workspaceId: ctx.workspaceId } });
  if (!member) throw new NotFoundError("Member");
  if (member.role === "OWNER" && (await ownerCount(ctx.workspaceId)) === 1) {
    throw new ForbiddenError("A workspace needs at least one owner.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.member.delete({ where: { id: member.id } });
    await writeAudit(tx, ctx, { action: "member.remove", entity: "Member", entityId: member.id, before: member });
  });
}

// ─── Creators (agency mode) ──────────────────────────────────────────────────

export async function listCreators(ctx: Ctx) {
  return prisma.creator.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { name: "asc" } });
}

export async function addCreator(ctx: Ctx, input: { name: string; handle?: string; platform: Platform }) {
  assertRole(ctx, "MANAGER");
  return prisma.$transaction(async (tx) => {
    const creator = await tx.creator.create({ data: { workspaceId: ctx.workspaceId, ...input } });
    await writeAudit(tx, ctx, { action: "creator.create", entity: "Creator", entityId: creator.id, after: creator });
    return creator;
  });
}

// ─── Data export and deletion (DPDP Act: access and erasure) ─────────────────

export async function exportWorkspace(ctx: Ctx) {
  assertRole(ctx, "OWNER");
  const id = ctx.workspaceId;
  const [workspace, members, creators, brands, deals, deliverables, invoices, payments, reminders, auditLogs] =
    await Promise.all([
      prisma.workspace.findUniqueOrThrow({ where: { id } }),
      prisma.member.findMany({ where: { workspaceId: id }, include: { user: { select: { email: true, name: true } } } }),
      prisma.creator.findMany({ where: { workspaceId: id } }),
      prisma.brand.findMany({ where: { workspaceId: id } }),
      prisma.deal.findMany({ where: { workspaceId: id } }),
      prisma.deliverable.findMany({ where: { workspaceId: id } }),
      prisma.invoice.findMany({ where: { workspaceId: id } }),
      prisma.payment.findMany({ where: { workspaceId: id } }),
      prisma.reminder.findMany({ where: { workspaceId: id } }),
      prisma.auditLog.findMany({ where: { workspaceId: id }, orderBy: { createdAt: "asc" } }),
    ]);
  const withPan = <T extends { supplier: unknown }>(inv: T) => {
    const s = inv.supplier as { pan?: string | null };
    return { ...inv, supplier: { ...s, pan: decryptField(s?.pan) } };
  };
  return {
    exportedAt: new Date().toISOString(),
    note: "Money is in paise (100 paise = ₹1). Rates are in basis points (1800 = 18%).",
    workspace: { ...workspace, pan: decryptField(workspace.pan) },
    members: members.map((m) => ({ role: m.role, email: m.user.email, name: m.user.name })),
    creators,
    brands,
    deals,
    deliverables,
    invoices: invoices.map(withPan),
    payments,
    reminders,
    auditLogs,
  };
}

/** Delete a workspace and everything in it, children first (some relations restrict deletes). */
export async function deleteWorkspace(ctx: Ctx, confirmName: string) {
  assertRole(ctx, "OWNER");
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
  if (confirmName.trim() !== ws.name) throw new ForbiddenError("Type the workspace name exactly to confirm.");
  const where = { workspaceId: ws.id };
  await prisma.$transaction([
    prisma.reminder.deleteMany({ where }),
    prisma.payment.deleteMany({ where }),
    prisma.invoice.deleteMany({ where }),
    prisma.deliverable.deleteMany({ where }),
    prisma.deal.deleteMany({ where }),
    prisma.brand.deleteMany({ where }),
    prisma.workspace.delete({ where: { id: ws.id } }),
  ]);
}

/**
 * Delete the signed-in user's account (DPDP Act: erasure). Workspaces they own alone are deleted with it.
 * Refuses if they're the only owner of a workspace that still has other members, so nobody's data is orphaned.
 */
export async function deleteMyAccount(userId: string, confirmEmail: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new ForbiddenError("Type your email address exactly to confirm.");
  }
  const owned = await prisma.member.findMany({
    where: { userId, role: "OWNER" },
    include: { workspace: { select: { id: true, name: true, members: { select: { userId: true, role: true } } } } },
  });
  const toDelete: { id: string; name: string }[] = [];
  for (const m of owned) {
    const others = m.workspace.members.filter((x) => x.userId !== userId);
    const otherOwners = others.filter((x) => x.role === "OWNER");
    if (others.length > 0 && otherOwners.length === 0) {
      throw new ForbiddenError(`Make someone else an owner of "${m.workspace.name}" first, or remove its other members.`);
    }
    if (others.length === 0) toDelete.push(m.workspace);
  }
  for (const ws of toDelete) {
    await deleteWorkspace({ workspaceId: ws.id, userId, role: "OWNER" }, ws.name);
  }
  // Memberships, sessions and linked accounts cascade; audit entries keep the action but lose the actor.
  await prisma.user.delete({ where: { id: userId } });
  return { deletedWorkspaces: toDelete.length };
}
