import "server-only";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { extractBrief, MAX_BRIEF_CHARS, type BriefResult } from "@/lib/ai/extract-brief";
import { istDateKey, istMidnight } from "@/lib/fy";
import { assertRole, ForbiddenError, type WorkspaceContext } from "@/lib/roles";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";

type Ctx = Pick<WorkspaceContext, "workspaceId" | "userId" | "role">;

/** Free-tier friendly cap per workspace per IST day. */
export const DAILY_AI_LIMIT = 30;

export async function aiSettings(ctx: Ctx) {
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: ctx.workspaceId },
    select: { aiEnabled: true, aiEnabledAt: true },
  });
  return { ...ws, configured: Boolean(process.env.GEMINI_API_KEY) };
}

export async function setAiEnabled(ctx: Ctx, enabled: boolean) {
  assertRole(ctx, "OWNER");
  await prisma.$transaction(async (tx) => {
    const before = await tx.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId }, select: { aiEnabled: true } });
    await tx.workspace.update({
      where: { id: ctx.workspaceId },
      data: { aiEnabled: enabled, aiEnabledAt: enabled ? new Date() : null },
    });
    await writeAudit(tx, ctx, {
      action: enabled ? "ai.enable" : "ai.disable",
      entity: "Workspace",
      entityId: ctx.workspaceId,
      before,
      after: { aiEnabled: enabled },
    });
  });
}

/**
 * Read a pasted brief with AI. Checks permission, the workspace's AI switch and the daily cap.
 * The audit log records that it happened (model, size, flags), never the brief's text.
 */
export async function readBrief(ctx: Ctx, brief: string, now = new Date()): Promise<BriefResult> {
  assertRole(ctx, "MANAGER");
  const { aiEnabled } = await aiSettings(ctx);
  if (!aiEnabled) throw new ForbiddenError("AI is turned off for this workspace. An owner can turn it on in Settings.");

  const text = brief.trim();
  if (text.length < 20) throw new ForbiddenError("Paste the full brief: it's too short to read.");
  if (text.length > MAX_BRIEF_CHARS) throw new ForbiddenError(`That's too long. Paste up to ${MAX_BRIEF_CHARS.toLocaleString("en-IN")} characters.`);

  const today = istDateKey(now);
  const used = await prisma.auditLog.count({
    where: { workspaceId: ctx.workspaceId, action: "ai.brief", createdAt: { gte: istMidnight(today) } },
  });
  if (used >= DAILY_AI_LIMIT) {
    throw new ForbiddenError(`You've used today's ${DAILY_AI_LIMIT} AI reads. It resets at midnight.`);
  }

  // Short burst limit per person on top of the daily workspace cap.
  const burst = await rateLimit("ai-user", ctx.userId, LIMITS.aiPerUserPerMinute.limit, LIMITS.aiPerUserPerMinute.windowMs);
  if (!burst.allowed) throw new ForbiddenError("That's a lot of AI reads in a minute. Wait a moment and try again.");

  const result = await extractBrief(text, today);
  await prisma.$transaction((tx) =>
    writeAudit(tx, ctx, {
      action: "ai.brief",
      entity: "Workspace",
      entityId: ctx.workspaceId,
      after: { model: result.model, attempts: result.attempts, chars: text.length, flags: result.flags.map((f) => f.code) },
    }),
  );
  return result;
}
