import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NotFoundError } from "@/lib/data/deals";
import { getBrand } from "@/lib/data/settings";
import { formatINR } from "@/lib/money";
import { getWorkspaceContext, hasRole } from "@/lib/tenancy";
import { STAGE_LABEL } from "@/lib/validation";
import { BrandForm } from "./brand-form";

export const metadata: Metadata = { title: "Brand" };

export default function BrandPage({ params }: PageProps<"/brands/[id]">) {
  return (
    <div className="grid gap-6">
      <Link href="/brands" className="text-sm text-muted-foreground hover:text-foreground">
        ← All brands
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading brand…</p>}>
        <BrandDetail params={params} />
      </Suspense>
    </div>
  );
}

async function BrandDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  const brand = await getBrand(ctx, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  return (
    <div className="grid gap-8">
      <h1 className="display text-4xl sm:text-5xl">{brand.name}</h1>
      <BrandForm
        brandId={brand.id}
        canEdit={hasRole(ctx.role, "MANAGER")}
        defaults={{
          name: brand.name,
          gstin: brand.gstin ?? "",
          stateCode: brand.stateCode ?? "",
          address: brand.address ?? "",
          contactName: brand.contactName ?? "",
          contactEmail: brand.contactEmail ?? "",
          contactPhone: brand.contactPhone ?? "",
          notes: brand.notes ?? "",
        }}
      />
      <section className="grid gap-2">
        <h2 className="font-medium">Deals with {brand.name}</h2>
        <ul className="grid gap-1 text-sm">
          {brand.deals.map((d) => (
            <li key={d.id}>
              <Link href={`/deals/${d.id}`} className="hover:underline">
                {d.title}
              </Link>{" "}
              <span className="text-muted-foreground">
                · {STAGE_LABEL[d.stage]}
                {d.amountPaise ? ` · ${formatINR(d.amountPaise)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
