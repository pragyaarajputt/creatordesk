import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { WorkspaceContext } from "@/lib/roles";

export { assertRole, ForbiddenError, hasRole, type WorkspaceContext } from "@/lib/roles";

export const ACTIVE_WORKSPACE_COOKIE = "cd_ws";

/** The signed-in user id, or a redirect to the login page. */
export async function requireUserId(): Promise<string> {
  // The session is request data. Mark it so before Auth.js touches crypto,
  // otherwise Cache Components treats the call as an unstable prerender value.
  await connection();
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  // A deleted account's token may still be unexpired; treat it as signed out.
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) redirect("/login?error=SessionEnded");
  return userId;
}

/**
 * Resolve who is asking and which workspace they are acting in.
 * Every data function takes this context and filters by ctx.workspaceId,
 * so a user can only ever reach rows of a workspace they are a member of.
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const userId = await requireUserId();
  const preferred = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;

  const memberships = await prisma.member.findMany({
    where: { userId },
    include: { workspace: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) redirect("/onboarding");

  const active = memberships.find((m) => m.workspaceId === preferred) ?? memberships[0];
  return {
    userId,
    workspaceId: active.workspaceId,
    workspaceName: active.workspace.name,
    role: active.role,
  };
}
