import type { MemberRole } from "@/lib/generated/prisma/client";

export interface WorkspaceContext {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  role: MemberRole;
}

const ROLE_RANK: Record<MemberRole, number> = { VIEWER: 1, MANAGER: 2, OWNER: 3 };

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function hasRole(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function assertRole(ctx: Pick<WorkspaceContext, "role">, minimum: MemberRole): void {
  if (!hasRole(ctx.role, minimum)) throw new ForbiddenError();
}
