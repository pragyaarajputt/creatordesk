"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signOut } from "@/lib/auth";
import { toActionError, type ActionState } from "@/lib/action-result";
import {
  addCreator,
  cancelInvite,
  deleteMyAccount,
  changeRole,
  deleteWorkspace,
  inviteMember,
  removeMember,
  updateBrand,
  updateWorkspaceProfile,
} from "@/lib/data/settings";
import { setAiEnabled } from "@/lib/data/ai";
import { brandSchema, creatorSchema, inviteSchema, workspaceProfileSchema } from "@/lib/schemas";
import { ACTIVE_WORKSPACE_COOKIE, getWorkspaceContext, requireUserId } from "@/lib/tenancy";
import { fieldErrors, formToObject } from "@/lib/validation";

export async function updateProfileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  const values = formToObject(form);
  const parsed = workspaceProfileSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await updateWorkspaceProfile(ctx, parsed.data);
  } catch (error) {
    return toActionError(error, values);
  }
  refresh();
  // No `values` on success: the form refills from the saved (normalised) record.
  return { ok: true, message: "Saved. New invoices will use these details." };
}

export async function updateBrandAction(brandId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  const values = formToObject(form);
  const parsed = brandSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await updateBrand(ctx, brandId, parsed.data);
  } catch (error) {
    return toActionError(error, values);
  }
  refresh();
  return { ok: true, message: "Brand saved." };
}

export async function inviteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  const values = formToObject(form);
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  let joined: boolean;
  try {
    joined = (await inviteMember(ctx, parsed.data.email, parsed.data.role)).joined;
  } catch (error) {
    return toActionError(error, values);
  }
  refresh();
  return {
    ok: true,
    message: joined
      ? `${parsed.data.email} now has access.`
      : `Invite saved. ${parsed.data.email} gets access the first time they sign in with that email.`,
  };
}

const roleSchema = z.enum(["OWNER", "MANAGER", "VIEWER"]);

export async function changeRoleAction(memberId: string, role: string): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { errors: { form: "Unknown role" } };
  try {
    await changeRole(ctx, memberId, parsed.data);
  } catch (error) {
    return toActionError(error);
  }
  refresh();
  return { ok: true };
}

export async function removeMemberAction(memberId: string): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  try {
    await removeMember(ctx, memberId);
  } catch (error) {
    return toActionError(error);
  }
  refresh();
  return { ok: true };
}

export async function cancelInviteAction(inviteId: string): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  try {
    await cancelInvite(ctx, inviteId);
  } catch (error) {
    return toActionError(error);
  }
  refresh();
  return { ok: true };
}

export async function addCreatorAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  const values = formToObject(form);
  const parsed = creatorSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await addCreator(ctx, parsed.data);
  } catch (error) {
    return toActionError(error, values);
  }
  refresh();
  return { ok: true, message: `${parsed.data.name} added.` };
}

export async function deleteWorkspaceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  const values = formToObject(form);
  try {
    await deleteWorkspace(ctx, values.confirm ?? "");
  } catch (error) {
    return toActionError(error, values);
  }
  (await cookies()).delete(ACTIVE_WORKSPACE_COOKIE);
  await signOut({ redirectTo: "/" });
  redirect("/");
}

export async function setAiEnabledAction(enabled: boolean): Promise<ActionState> {
  const ctx = await getWorkspaceContext();
  try {
    await setAiEnabled(ctx, enabled === true);
  } catch (error) {
    return toActionError(error);
  }
  refresh();
  return { ok: true };
}

export async function deleteMyAccountAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const values = formToObject(form);
  try {
    await deleteMyAccount(userId, values.confirm ?? "");
  } catch (error) {
    return toActionError(error, values);
  }
  (await cookies()).delete(ACTIVE_WORKSPACE_COOKIE);
  await signOut({ redirectTo: "/" });
  redirect("/");
}
