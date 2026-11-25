"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signOut } from "@/lib/auth";
import {
  addDeliverable,
  createDeal,
  deleteDeal,
  moveDealStage,
  NotFoundError,
  setDeliverableStatus,
  updateDeal,
} from "@/lib/data/deals";
import { ForbiddenError, getWorkspaceContext } from "@/lib/tenancy";
import {
  DEAL_STAGES,
  DELIVERABLE_STATUSES,
  dealInputSchema,
  deliverableInputSchema,
  fieldErrors,
  formToObject,
} from "@/lib/validation";

/** On failure, `values` echoes what was submitted: React 19 resets forms after an action, so fields refill from it. */
export type FormState = { errors?: Record<string, string>; values?: Record<string, string> };

/** Turn expected errors into a message for the form; let anything unexpected surface. */
function toFormError(error: unknown): FormState {
  if (error instanceof ForbiddenError || error instanceof NotFoundError) {
    return { errors: { form: error.message } };
  }
  if (error instanceof Error && error.message.startsWith("This deal")) {
    return { errors: { form: error.message } };
  }
  throw error;
}

export async function createDealAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getWorkspaceContext();
  const parsed = dealInputSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formToObject(form) };
  let id: string;
  try {
    id = (await createDeal(ctx, parsed.data)).id;
  } catch (error) {
    return toFormError(error);
  }
  redirect(`/deals/${id}`);
}

export async function updateDealAction(dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getWorkspaceContext();
  const parsed = dealInputSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formToObject(form) };
  try {
    await updateDeal(ctx, dealId, parsed.data);
  } catch (error) {
    return toFormError(error);
  }
  redirect(`/deals/${dealId}`);
}

export async function moveStageAction(dealId: string, stage: string): Promise<FormState> {
  const ctx = await getWorkspaceContext();
  const parsed = z.enum(DEAL_STAGES).safeParse(stage);
  if (!parsed.success) return { errors: { form: "Unknown stage" } };
  try {
    await moveDealStage(ctx, dealId, parsed.data);
  } catch (error) {
    return toFormError(error);
  }
  refresh();
  return {};
}

export async function deleteDealAction(dealId: string): Promise<FormState> {
  const ctx = await getWorkspaceContext();
  try {
    await deleteDeal(ctx, dealId);
  } catch (error) {
    return toFormError(error);
  }
  redirect("/deals");
}

export async function addDeliverableAction(dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await getWorkspaceContext();
  const parsed = deliverableInputSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formToObject(form) };
  try {
    await addDeliverable(ctx, dealId, parsed.data);
  } catch (error) {
    return toFormError(error);
  }
  refresh();
  return {};
}

export async function setDeliverableStatusAction(deliverableId: string, status: string): Promise<FormState> {
  const ctx = await getWorkspaceContext();
  const parsed = z.enum(DELIVERABLE_STATUSES).safeParse(status);
  if (!parsed.success) return { errors: { form: "Unknown status" } };
  try {
    await setDeliverableStatus(ctx, deliverableId, parsed.data);
  } catch (error) {
    return toFormError(error);
  }
  refresh();
  return {};
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
