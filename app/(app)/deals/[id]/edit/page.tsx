import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDeal, NotFoundError } from "@/lib/data/deals";
import { getWorkspaceContext } from "@/lib/tenancy";
import { creatorsForDealForm } from "@/lib/data/creators-for-form";
import { updateDealAction } from "../../actions";
import { DealForm } from "../../deal-form";

export const metadata: Metadata = { title: "Edit deal" };

const rupees = (paise: number) => (paise ? String(paise / 100) : "");

export default function EditDealPage({ params }: PageProps<"/deals/[id]/edit">) {
  return (
    <div className="grid gap-6">
      <h1 className="display text-4xl sm:text-5xl">Edit deal</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <EditForm params={params} />
      </Suspense>
    </div>
  );
}

async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  const deal = await getDeal(ctx, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const creators = await creatorsForDealForm(ctx);
  return (
    <DealForm
      creators={creators}
      action={updateDealAction.bind(null, deal.id)}
      submitLabel="Save changes"
      cancelHref={`/deals/${deal.id}`}
      defaults={{
        title: deal.title,
        brandName: deal.brand.name,
        type: deal.type,
        stage: deal.stage,
        amount: rupees(deal.amountPaise),
        productValue: rupees(deal.productValuePaise),
        usageRightsMonths: deal.usageRightsMonths?.toString() ?? "",
        paymentTermsDays: String(deal.paymentTermsDays),
        notes: deal.notes ?? "",
        creatorId: deal.creatorId ?? "",
      }}
    />
  );
}
