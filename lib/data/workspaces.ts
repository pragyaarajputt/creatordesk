import "server-only";
import { prisma } from "@/lib/db";
import type { WorkspaceType } from "@/lib/generated/prisma/client";
import { writeAudit } from "@/lib/audit";

/** Create a workspace and make the user its owner. */
export async function createWorkspace(
  userId: string,
  input: { name: string; type: WorkspaceType; stateCode?: string },
) {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: { name: input.name, type: input.type, stateCode: input.stateCode },
    });
    await tx.member.create({ data: { workspaceId: workspace.id, userId, role: "OWNER" } });
    if (input.type === "CREATOR") {
      await tx.creator.create({ data: { workspaceId: workspace.id, name: input.name } });
    }
    await writeAudit(tx, { workspaceId: workspace.id, userId }, {
      action: "workspace.create",
      entity: "Workspace",
      entityId: workspace.id,
      after: workspace,
    });
    return workspace;
  });
}
