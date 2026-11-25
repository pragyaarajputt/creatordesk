import { prisma } from "@/lib/db";
import type { MemberRole } from "@/lib/generated/prisma/client";
import { createWorkspace } from "@/lib/data/workspaces";
import type { WorkspaceContext } from "@/lib/roles";
import type { DealInput } from "@/lib/validation";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

/** A user who owns a fresh workspace, plus their request context. */
export async function makeOwner(email: string, stateCode = "07"): Promise<WorkspaceContext> {
  const user = await prisma.user.create({ data: { email } });
  const ws = await createWorkspace(user.id, { name: email.split("@")[0], type: "CREATOR", stateCode });
  // Registered for GST by default so tests can issue tax invoices.
  await prisma.workspace.update({ where: { id: ws.id }, data: { gstin: `${stateCode}ABCDE1234F1Z5` } });
  return { userId: user.id, workspaceId: ws.id, workspaceName: ws.name, role: "OWNER" };
}

export async function addMember(ctx: WorkspaceContext, email: string, role: MemberRole): Promise<WorkspaceContext> {
  const user = await prisma.user.create({ data: { email } });
  await prisma.member.create({ data: { workspaceId: ctx.workspaceId, userId: user.id, role } });
  return { ...ctx, userId: user.id, role };
}

export const sampleDeal = (overrides: Partial<DealInput> = {}): DealInput => ({
  title: "Diwali reel",
  brandName: "Glow Co",
  type: "PAID",
  stage: "AGREED",
  amount: 2500000,
  productValue: 0,
  usageRightsMonths: 3,
  paymentTermsDays: 30,
  notes: undefined,
  deliverablesJson: [],
  ...overrides,
});
