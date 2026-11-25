import { NotFoundError } from "@/lib/data/deals";
import { InvoiceRuleError } from "@/lib/data/invoices";
import { ForbiddenError } from "@/lib/roles";

/** What a form action returns. `values` refills the form: React 19 resets forms after an action. */
export type ActionState = { ok?: boolean; message?: string; errors?: Record<string, string>; values?: Record<string, string> };

/** Expected failures become a form message; anything unexpected is rethrown so it's logged, not hidden. */
export function toActionError(error: unknown, values?: Record<string, string>): ActionState {
  if (error instanceof ForbiddenError || error instanceof NotFoundError || error instanceof InvoiceRuleError) {
    return { errors: { form: error.message }, values };
  }
  throw error;
}
