"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createWorkspace } from "@/lib/data/workspaces";
import { ACTIVE_WORKSPACE_COOKIE, requireUserId } from "@/lib/tenancy";
import { fieldErrors, formToObject, workspaceInputSchema } from "@/lib/validation";

export type OnboardingState = { errors?: Record<string, string>; values?: Record<string, string> };

export async function createWorkspaceAction(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const userId = await requireUserId();
  const parsed = workspaceInputSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formToObject(form) };

  const workspace = await createWorkspace(userId, parsed.data);
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspace.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // The router may hold a stale "/deals -> /onboarding" redirect from before the workspace existed.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
