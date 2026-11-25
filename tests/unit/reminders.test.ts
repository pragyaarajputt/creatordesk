import { describe, expect, it } from "vitest";
import {
  daysOverdue,
  mailtoLink,
  nextReminder,
  normaliseIndianPhone,
  reminderMessage,
  whatsappLink,
  type ReminderKind,
} from "@/lib/reminders";
import { numberToIndianWords, paiseToWords } from "@/lib/words";

const due = new Date("2026-12-01T00:00:00+05:30");
const at = (iso: string) => new Date(iso);
const none = new Set<ReminderKind>();

describe("nextReminder", () => {
  it("is quiet until the invoice is overdue", () => {
    expect(nextReminder(due, at("2026-12-01T20:00:00+05:30"), none)).toBeNull();
    expect(daysOverdue(due, at("2026-12-01T20:00:00+05:30"))).toBe(0);
  });
  it("starts polite, then firm, then final", () => {
    expect(nextReminder(due, at("2026-12-02T09:00:00+05:30"), none)).toBe("POLITE");
    expect(nextReminder(due, at("2026-12-08T09:00:00+05:30"), new Set(["POLITE"]))).toBe("FIRM");
    expect(nextReminder(due, at("2026-12-16T09:00:00+05:30"), new Set(["POLITE", "FIRM"]))).toBe("FINAL");
  });
  it("skips straight to the most serious due reminder", () => {
    expect(nextReminder(due, at("2026-12-20T09:00:00+05:30"), none)).toBe("FINAL");
  });
  it("returns null once everything due has been sent", () => {
    expect(nextReminder(due, at("2026-12-08T09:00:00+05:30"), new Set(["POLITE", "FIRM"]))).toBeNull();
  });
});

describe("reminderMessage", () => {
  const base = {
    brandName: "Glow Co",
    contactName: "Riya",
    invoiceNumber: "CD/2026-27/004",
    outstandingPaise: 2950000,
    dueDate: due,
    senderName: "Pragya",
    upiId: "pragya@okaxis",
  };
  it("includes the amount, invoice number, due date and UPI", () => {
    const { subject, body } = reminderMessage({ ...base, kind: "POLITE" });
    expect(subject).toContain("CD/2026-27/004");
    expect(body).toContain("Hi Riya");
    expect(body).toContain("₹29,500");
    expect(body).toContain("1 Dec 2026");
    expect(body).toContain("pragya@okaxis");
  });
  it("escalates tone", () => {
    expect(reminderMessage({ ...base, kind: "FIRM" }).body).toContain("overdue");
    expect(reminderMessage({ ...base, kind: "FINAL" }).subject).toMatch(/^Final reminder/);
  });
  it("says 'is due' before the due date", () => {
    const early = reminderMessage({ ...base, kind: "POLITE", now: at("2026-11-25T09:00:00+05:30") });
    expect(early.body).toContain("is due on 1 Dec 2026");
    const late = reminderMessage({ ...base, kind: "POLITE", now: at("2026-12-03T09:00:00+05:30") });
    expect(late.body).toContain("was due on 1 Dec 2026");
  });
  it("falls back to the brand name without a contact", () => {
    expect(reminderMessage({ ...base, kind: "POLITE", contactName: null }).body).toContain("Hi Glow Co team");
  });
});

describe("links", () => {
  it.each([
    ["98765 43210", "919876543210"],
    ["+91-98765-43210", "919876543210"],
    ["09876543210", "919876543210"],
    ["12345", null],
    ["5876543210", null],
  ])("normalises %s", (input, expected) => {
    expect(normaliseIndianPhone(input)).toBe(expected);
  });
  it("builds an encoded wa.me link", () => {
    expect(whatsappLink("9876543210", "Hi & thanks")).toBe("https://wa.me/919876543210?text=Hi%20%26%20thanks");
    expect(whatsappLink(null, "x")).toBeNull();
  });
  it("builds a mailto link only for valid emails", () => {
    expect(mailtoLink("a@b.co", "S", "B")).toBe("mailto:a@b.co?subject=S&body=B");
    expect(mailtoLink("nope", "S", "B")).toBeNull();
  });
});

describe("amount in words", () => {
  it.each([
    [0, "Zero"],
    [7, "Seven"],
    [115, "One Hundred Fifteen"],
    [29500, "Twenty Nine Thousand Five Hundred"],
    [150000, "One Lakh Fifty Thousand"],
    [12345678, "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight"],
  ])("%i", (n, words) => {
    expect(numberToIndianWords(n)).toBe(words);
  });
  it("adds paise", () => {
    expect(paiseToWords(2950050)).toBe("Rupees Twenty Nine Thousand Five Hundred and Fifty Paise Only");
    expect(paiseToWords(2950000)).toBe("Rupees Twenty Nine Thousand Five Hundred Only");
  });
});
