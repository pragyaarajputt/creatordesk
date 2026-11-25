import "server-only";
import { prisma } from "@/lib/db";
import type { WorkspaceContext } from "@/lib/roles";

/** Creators to offer in the deal form: only for agencies (a solo creator's deals are all theirs). */
export async function creatorsForDealForm(ctx: Pick<WorkspaceContext, "workspaceId">) {
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { type: true, creators: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
  });
  return ws.type === "AGENCY" || ws.creators.length > 1 ? ws.creators : [];
}
