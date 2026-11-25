// Invoice PDF with pdf-lib (pure JavaScript, works on Node and edge runtimes).
// The standard PDF fonts can't draw "₹", so amounts are printed as "Rs. 29,500.00", as many Indian invoices do.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { paiseToWords } from "@/lib/words";

export interface InvoicePdfData {
  number: string;
  kind: "TAX_INVOICE" | "BILL_OF_SUPPLY";
  status: string;
  issueDate: Date;
  dueDate: Date;
  supplier: { name: string; gstin?: string | null; pan?: string | null; address?: string | null; stateCode?: string | null; upiId?: string | null };
  recipient: { name: string; gstin?: string | null; address?: string | null; stateCode?: string | null };
  lineItems: { description: string; amountPaise: number }[];
  subtotalPaise: number;
  gstRateBps: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  tdsRateBps: number;
}

const rs = (paise: number) =>
  `Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(paise / 100)}`;
const pct = (bps: number) => `${bps / 100}%`;
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** Keep only characters the standard fonts can encode. */
const safe = (text: string) => text.replace(/₹/g, "Rs.").replace(/[^\x20-\x7E\n]/g, "");

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderInvoicePdf(inv: InvoicePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${inv.number}`);
  pdf.setCreator("CreatorDesk");
  const page: PDFPage = pdf.addPage([595.28, 841.89]); // A4
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.42, 0.42, 0.42);
  const line = rgb(0.85, 0.85, 0.85);
  const left = 48;
  const right = 547;
  let y = 790;

  const text = (t: string, x: number, yy: number, opts: { font?: PDFFont; size?: number; color?: typeof ink } = {}) =>
    page.drawText(safe(t), { x, y: yy, font: opts.font ?? regular, size: opts.size ?? 10, color: opts.color ?? ink });
  const textRight = (t: string, xRight: number, yy: number, font = regular, size = 10) =>
    text(t, xRight - font.widthOfTextAtSize(safe(t), size), yy, { font, size });
  const block = (lines: string[], x: number, yy: number, width: number) => {
    let cy = yy;
    for (const l of lines.flatMap((l) => wrap(l, regular, 9.5, width))) {
      text(l, x, cy, { size: 9.5 });
      cy -= 13;
    }
    return cy;
  };

  // Title and number
  text(inv.kind === "TAX_INVOICE" ? "TAX INVOICE" : "BILL OF SUPPLY", left, y, { font: bold, size: 18 });
  textRight(inv.number, right, y + 2, bold, 12);
  if (inv.status === "VOID") textRight("VOID", right, y - 16, bold, 12);
  y -= 34;

  // Supplier
  text("From", left, y, { size: 8.5, color: muted });
  text("Bill to", 310, y, { size: 8.5, color: muted });
  y -= 15;
  text(inv.supplier.name, left, y, { font: bold, size: 11 });
  text(inv.recipient.name, 310, y, { font: bold, size: 11 });
  y -= 15;
  const supplierLines = [
    inv.supplier.address ?? "",
    inv.supplier.gstin ? `GSTIN: ${inv.supplier.gstin}` : "",
    inv.supplier.pan ? `PAN: ${inv.supplier.pan}` : "",
    inv.supplier.stateCode ? `State code: ${inv.supplier.stateCode}` : "",
  ].filter(Boolean);
  const recipientLines = [
    inv.recipient.address ?? "",
    inv.recipient.gstin ? `GSTIN: ${inv.recipient.gstin}` : "",
    inv.recipient.stateCode ? `Place of supply (state code): ${inv.recipient.stateCode}` : "",
  ].filter(Boolean);
  y = Math.min(block(supplierLines, left, y, 230), block(recipientLines, 310, y, 237)) - 10;

  // Dates
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: line });
  y -= 18;
  text(`Invoice date: ${dateFmt.format(inv.issueDate)}`, left, y);
  text(`Due date: ${dateFmt.format(inv.dueDate)}`, 310, y);
  y -= 26;

  // Line items
  text("Description", left, y, { font: bold, size: 9.5 });
  textRight("Amount", right, y, bold, 9.5);
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: line });
  y -= 16;
  for (const item of inv.lineItems) {
    const lines = wrap(item.description, regular, 10, 360);
    lines.forEach((l, i) => text(l, left, y - i * 13));
    textRight(rs(item.amountPaise), right, y);
    y -= lines.length * 13 + 8;
  }
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: line });
  y -= 18;

  // Totals
  const total = (label: string, value: string, strong = false) => {
    textRight(label, 430, y, strong ? bold : regular, strong ? 11 : 10);
    textRight(value, right, y, strong ? bold : regular, strong ? 11 : 10);
    y -= strong ? 20 : 16;
  };
  total("Taxable value", rs(inv.subtotalPaise));
  if (inv.kind === "TAX_INVOICE") {
    if (inv.igstPaise > 0) total(`IGST @ ${pct(inv.gstRateBps)}`, rs(inv.igstPaise));
    else {
      total(`CGST @ ${pct(inv.gstRateBps / 2)}`, rs(inv.cgstPaise));
      total(`SGST @ ${pct(inv.gstRateBps / 2)}`, rs(inv.sgstPaise));
    }
  }
  total("Total", rs(inv.totalPaise), true);
  y -= 4;
  y = block([`Amount in words: ${paiseToWords(inv.totalPaise)}`], left, y, right - left) - 8;

  // Notes
  const notes: string[] = [];
  if (inv.kind === "BILL_OF_SUPPLY") notes.push("GST not charged: the supplier is not registered under GST.");
  if (inv.tdsRateBps > 0) {
    const tds = Math.floor((inv.subtotalPaise * inv.tdsRateBps + 5000) / 10000);
    notes.push(`TDS, if applicable: ${pct(inv.tdsRateBps)} of taxable value = ${rs(tds)}. Please share the TDS certificate.`);
  }
  if (inv.supplier.upiId) notes.push(`Pay by UPI: ${inv.supplier.upiId}`);
  if (notes.length) {
    text("Notes", left, y, { font: bold, size: 9.5 });
    y = block(notes, left, y - 14, right - left);
  }

  text("Generated with CreatorDesk. This is a computer-generated invoice.", left, 40, { size: 8, color: muted });
  return pdf.save();
}
