"use client";

import { ArrowRight } from "lucide-react";
import { useActionState, useState } from "react";
import { joinWaitlist, type WaitlistState } from "@/app/actions/waitlist";
import { cn } from "@/lib/utils";

const ROLES = [
  { value: "creator", label: "I'm a creator" },
  { value: "agency", label: "I manage creators" },
  { value: "other", label: "Something else" },
] as const;

export function WaitlistForm() {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, {});
  const [role, setRole] = useState<string>(state.values?.role ?? "creator");

  if (state.ok) {
    return (
      <p role="status" className="rounded-2xl border bg-background/80 p-5 text-base">
        You&apos;re on the list. We&apos;ll email you when the pilot opens.
      </p>
    );
  }

  const e = state.errors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border bg-background/80 p-1.5 pl-6 shadow-[0_8px_30px_-12px_oklch(0.48_0.19_25/0.25)] backdrop-blur",
          "focus-within:border-primary/40 focus-within:ring-3 focus-within:ring-ring/30",
          e.email && "border-destructive/60",
        )}
      >
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Your email"
          defaultValue={state.values?.email}
          aria-invalid={e.email ? true : undefined}
          aria-describedby={e.email ? "email-error" : undefined}
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-base font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Joining…" : "Join the pilot"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      {e.email && (
        <p id="email-error" className="px-6 text-sm text-destructive">
          {e.email}
        </p>
      )}

      <input type="hidden" name="role" value={role} />
      <div role="radiogroup" aria-label="Who are you?" className="flex flex-wrap gap-x-6 gap-y-2 px-1 text-[0.95rem]">
        {ROLES.map((r) => (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={role === r.value}
            onClick={() => setRole(r.value)}
            className={cn(
              "transition-colors",
              role === r.value ? "text-primary underline decoration-primary/40 underline-offset-[6px]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-1 text-sm text-muted-foreground">
        <label htmlFor="handle">Instagram</label>
        <input
          id="handle"
          name="handle"
          placeholder="@handle"
          defaultValue={state.values?.handle}
          className="h-8 w-32 rounded-full border bg-background/70 px-3 outline-none focus:border-primary/40"
        />
        <label htmlFor="owed" className="ml-2">
          Brands owe me ₹
        </label>
        <input
          id="owed"
          name="owed"
          inputMode="numeric"
          placeholder="optional"
          defaultValue={state.values?.owed}
          aria-invalid={e.owed ? true : undefined}
          className="h-8 w-28 rounded-full border bg-background/70 px-3 outline-none focus:border-primary/40"
        />
      </div>
      {(e.owed || e.handle) && <p className="px-1 text-sm text-destructive">{e.owed ?? e.handle}</p>}
    </form>
  );
}
