"use server";

import { AiError } from "@/lib/ai/gemini";
import type { RedFlag } from "@/lib/ai/red-flags";
import { toDealDraft, type DealDraft } from "@/lib/ai/to-deal-draft";
import { readBrief } from "@/lib/data/ai";
import { ForbiddenError, getWorkspaceContext } from "@/lib/tenancy";

export type BriefActionResult =
  | { ok: true; draft: DealDraft; flags: RedFlag[] }
  | { ok: false; message: string };

export async function readBriefAction(brief: string): Promise<BriefActionResult> {
  const ctx = await getWorkspaceContext();
  try {
    const result = await readBrief(ctx, typeof brief === "string" ? brief : "");
    return { ok: true, draft: toDealDraft(result.extraction), flags: result.flags };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, message: error.message };
    if (error instanceof AiError) {
      console.warn(`[ai] brief read failed: ${error.kind} ${error.detail ?? ""}`);
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
