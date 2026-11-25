import { taxRows } from "@/lib/data/dashboard";
import { financialYear } from "@/lib/fy";
import { getWorkspaceContext } from "@/lib/tenancy";

const rupees = (paise: number) => (paise / 100).toFixed(2);
const date = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Quote a CSV cell, and stop spreadsheet apps from running formulas typed into a field. */
function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const ctx = await getWorkspaceContext();
  const fyParam = new URL(request.url).searchParams.get("fy") ?? "";
  const fy = /^\d{4}-\d{2}$/.test(fyParam) ? fyParam : financialYear(new Date());
  const invoices = await taxRows(ctx, fy);

  const header = [
    "Invoice number", "Status", "Invoice date", "Due date", "Brand", "Brand GSTIN", "Deal", "Type",
    "Taxable value", "GST rate %", "CGST", "SGST", "IGST", "Total", "Received", "TDS deducted",
  ];
  const lines = invoices.map((i) => {
    const received = i.payments.reduce((s, p) => s + p.amountPaise, 0);
    const tds = i.payments.reduce((s, p) => s + p.tdsPaise, 0);
    return [
      i.number, i.status, date(i.issueDate), date(i.dueDate), i.deal.brand.name, i.deal.brand.gstin, i.deal.title,
      i.kind === "TAX_INVOICE" ? "Tax invoice" : "Bill of supply",
      rupees(i.subtotalPaise), i.gstRateBps / 100, rupees(i.cgstPaise), rupees(i.sgstPaise), rupees(i.igstPaise),
      rupees(i.totalPaise), rupees(received), rupees(tds),
    ].map(cell).join(",");
  });
  // BOM so Excel opens UTF-8 correctly.
  const csv = "\uFEFF" + [header.map(cell).join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="creatordesk-invoices-FY${fy}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
