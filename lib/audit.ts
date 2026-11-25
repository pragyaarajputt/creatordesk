import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Tx } from "@/lib/db";
import type { WorkspaceContext } from "@/lib/roles";

/** Record a change to business data. Call inside the same transaction as the change itself. */
export async function writeAudit(
  tx: Tx,
  ctx: Pick<WorkspaceContext, "workspaceId" | "userId">,
  entry: {
    action: string;
    entity: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
