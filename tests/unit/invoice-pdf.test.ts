import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderInvoicePdf, type InvoicePdfData } from "@/lib/invoice-pdf";

const base: InvoicePdfData = {
  number: "CD/2026-27/001",
  kind: "TAX_INVOICE",
  status: "ISSUED",
  issueDate: new Date("2026-11-01T06:00:00Z"),
  dueDate: new Date("2026-12-01T06:00:00Z"),
  supplier: { name: "Pragya Rajput", gstin: "07ABCDE1234F1Z5", pan: "ABCDE1234F", address: "New Delhi ₹ test", stateCode: "07", upiId: "pragya@okaxis" },
  recipient: { name: "Glow Co — Beauty", gstin: "27ABCDE1234F1Z5", address: "Mumbai, Maharashtra", stateCode: "27" },
  lineItems: [{ description: "Instagram reel ×1 for Diwali campaign, with 3 months of usage rights", amountPaise: 2500000 }],
  subtotalPaise: 2500000,
  gstRateBps: 1800,
  cgstPaise: 0,
  sgstPaise: 0,
  igstPaise: 450000,
  totalPaise: 2950000,
  tdsRateBps: 1000,
};

describe("renderInvoicePdf", () => {
  it("renders a one-page A4 PDF, even with characters the PDF fonts can't draw", async () => {
    const bytes = await renderInvoicePdf(base);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Invoice CD/2026-27/001");
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("renders a bill of supply and a void invoice", async () => {
    const bytes = await renderInvoicePdf({ ...base, kind: "BILL_OF_SUPPLY", status: "VOID", igstPaise: 0, totalPaise: 2500000, tdsRateBps: 0 });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
