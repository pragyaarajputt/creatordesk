"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, selectClass, TextField } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/action-result";
import {
  addCreatorAction,
  cancelInviteAction,
  changeRoleAction,
  deleteMyAccountAction,
  deleteWorkspaceAction,
  inviteAction,
  removeMemberAction,
  setAiEnabledAction,
  updateProfileAction,
} from "./actions";

function FormMessages({ state }: { state: ActionState }) {
  return (
    <>
      {state.errors?.form && <p role="alert" className="text-sm text-destructive">{state.errors.form}</p>}
      {state.ok && state.message && <p role="status" className="text-sm text-muted-foreground">{state.message}</p>}
    </>
  );
}

export interface ProfileDefaults {
  name: string;
  legalName: string;
  gstin: string;
  pan: string;
  address: string;
  stateCode: string;
  upiId: string;
  invoicePrefix: string;
}

export function ProfileForm({ defaults, canEdit }: { defaults: ProfileDefaults; canEdit: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProfileAction, {});
  const v = { ...defaults, ...state.values };
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessages state={state} />
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        <TextField label="Workspace name" name="name" defaultValue={v.name} error={e.name} />
        <TextField label="Legal name on invoices" name="legalName" defaultValue={v.legalName} placeholder="As on your PAN" error={e.legalName} />
        <TextField label="GSTIN (if registered)" name="gstin" defaultValue={v.gstin} placeholder="07ABCDE1234F1Z5" error={e.gstin} />
        <TextField label="PAN" name="pan" defaultValue={v.pan} placeholder="ABCDE1234F" error={e.pan} />
        <TextField
          label="GST state code"
          name="stateCode"
          inputMode="numeric"
          maxLength={2}
          defaultValue={v.stateCode}
          hint="Filled from your GSTIN if left blank."
          error={e.stateCode}
        />
        <TextField label="UPI ID for payments" name="upiId" defaultValue={v.upiId} placeholder="name@okaxis" error={e.upiId} />
        <TextField
          label="Invoice prefix"
          name="invoicePrefix"
          maxLength={3}
          defaultValue={v.invoicePrefix}
          hint="1 to 3 letters, e.g. PR gives PR/2026-27/001"
          error={e.invoicePrefix}
        />
        <Field label="Address" name="address" error={e.address} className="sm:col-span-2">
          <Textarea id="address" name="address" rows={2} defaultValue={v.address} />
        </Field>
      </fieldset>
      {canEdit ? (
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? "Saving…" : "Save invoice details"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Only owners can change these details.</p>
      )}
    </form>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteAction, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_auto]" noValidate>
      <TextField label="Email" name="email" type="email" defaultValue={state.values?.email} error={e.email} />
      <Field label="Role" name="role" error={e.role}>
        <select id="role" name="role" className={selectClass} defaultValue={state.values?.role ?? "MANAGER"}>
          <option value="MANAGER">Manager (can edit)</option>
          <option value="VIEWER">Viewer (read only)</option>
          <option value="OWNER">Owner (everything)</option>
        </select>
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      <div className="sm:col-span-3">
        <FormMessages state={state} />
      </div>
    </form>
  );
}

export function MemberControls({ memberId, role, isSelf }: { memberId: string; role: string; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Role"
        className={`${selectClass} h-7 w-32 text-xs`}
        defaultValue={role}
        disabled={pending}
        onChange={(ev) => {
          const next = ev.target.value;
          startTransition(async () => setError((await changeRoleAction(memberId, next)).errors?.form));
        }}
      >
        <option value="OWNER">Owner</option>
        <option value="MANAGER">Manager</option>
        <option value="VIEWER">Viewer</option>
      </select>
      {confirming ? (
        <>
          <Button
            size="xs"
            variant="destructive"
            disabled={pending}
            onClick={() => startTransition(async () => setError((await removeMemberAction(memberId)).errors?.form))}
          >
            {isSelf ? "Leave" : "Remove"}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button size="xs" variant="ghost" onClick={() => setConfirming(true)}>
          {isSelf ? "Leave" : "Remove"}
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

export function CancelInviteButton({ inviteId }: { inviteId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="xs" variant="ghost" disabled={pending} onClick={() => startTransition(async () => void (await cancelInviteAction(inviteId)))}>
      Cancel invite
    </Button>
  );
}

export function AddCreatorForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(addCreatorAction, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]" noValidate>
      <TextField label="Name" name="name" defaultValue={state.values?.name} error={e.name} />
      <TextField label="Handle" name="handle" placeholder="@handle" defaultValue={state.values?.handle} error={e.handle} />
      <Field label="Main platform" name="platform" error={e.platform}>
        <select id="platform" name="platform" className={selectClass} defaultValue={state.values?.platform ?? "INSTAGRAM"}>
          <option value="INSTAGRAM">Instagram</option>
          <option value="YOUTUBE">YouTube</option>
          <option value="LINKEDIN">LinkedIn</option>
          <option value="X">X</option>
          <option value="OTHER">Other</option>
        </select>
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Adding…" : "Add creator"}
      </Button>
      <div className="sm:col-span-4">
        <FormMessages state={state} />
      </div>
    </form>
  );
}

export function DeleteWorkspaceForm({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteWorkspaceAction, {});
  if (!open) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)} className="justify-self-start">
        Delete workspace
      </Button>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-destructive/40 p-4" noValidate>
      <p className="text-sm">
        This permanently deletes every deal, invoice, payment and brand in <strong>{name}</strong>. It can&apos;t be undone.
        Download your data first if you might need it.
      </p>
      <FormMessages state={state} />
      <TextField label={`Type "${name}" to confirm`} name="confirm" autoComplete="off" defaultValue={state.values?.confirm} />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Deleting…" : "Delete permanently"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AiToggle({ enabled, canEdit }: { enabled: boolean; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-2">
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={enabled}
          disabled={!canEdit || pending}
          onChange={(ev) => {
            const next = ev.target.checked;
            startTransition(async () => setError((await setAiEnabledAction(next)).errors?.form));
          }}
        />
        <span>
          Use AI to read pasted brand briefs <span className="text-muted-foreground">({enabled ? "on" : "off"})</span>
        </span>
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteMyAccountAction, {});
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="justify-self-start text-destructive">
        Delete my account
      </Button>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-destructive/40 p-4" noValidate>
      <p className="text-sm">
        This deletes your login and any workspace where you are the only member. Workspaces shared with others stay with them.
        It can&apos;t be undone.
      </p>
      <FormMessages state={state} />
      <TextField label={`Type "${email}" to confirm`} name="confirm" autoComplete="off" defaultValue={state.values?.confirm} />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
