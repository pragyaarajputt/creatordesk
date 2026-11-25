import { getInvoice } from "@/lib/data/invoices";
import { NotFoundError } from "@/lib/data/deals";
import { renderInvoicePdf, type InvoicePdfData } from "@/lib/invoice-pdf";
import { getWorkspaceContext } from "@/lib/tenancy";
import { decryptField } from "@/lib/security/crypto";

export async function GET(_request: Request, { params }: RouteContext<"/invoices/[id]/pdf">) {
  const { id } = await params;
  const ctx = await getWorkspaceContext();
  let invoice;
  try {
    invoice = await getInvoice(ctx, id);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("Not found", { status: 404 });
    throw error;
  }

  const bytes = await renderInvoicePdf({
    number: invoice.number,
    kind: invoice.kind,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    supplier: {
      ...(invoice.supplier as InvoicePdfData["supplier"]),
      pan: decryptField((invoice.supplier as InvoicePdfData["supplier"]).pan),
    },
    recipient: invoice.recipient as InvoicePdfData["recipient"],
    lineItems: invoice.lineItems as InvoicePdfData["lineItems"],
    subtotalPaise: invoice.subtotalPaise,
    gstRateBps: invoice.gstRateBps,
    cgstPaise: invoice.cgstPaise,
    sgstPaise: invoice.sgstPaise,
    igstPaise: invoice.igstPaise,
    totalPaise: invoice.totalPaise,
    tdsRateBps: invoice.tdsRateBps,
  });

  const filename = `invoice-${invoice.number.replaceAll("/", "-")}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
