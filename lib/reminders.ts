// Overdue logic and payment-reminder messages. Pure functions: no database, easy to test.
import { daysBetween } from "@/lib/fy";
import { formatINR } from "@/lib/money";

export type ReminderKind = "POLITE" | "FIRM" | "FINAL";

/** Days after the due date at which each reminder becomes appropriate. */
export const REMINDER_SCHEDULE: ReadonlyArray<{ kind: ReminderKind; afterDays: number }> = [
  { kind: "POLITE", afterDays: 1 },
  { kind: "FIRM", afterDays: 7 },
  { kind: "FINAL", afterDays: 15 },
];

/** Whole IST days past the due date (0 or less means not overdue yet). */
export function daysOverdue(dueDate: Date, now: Date): number {
  return daysBetween(dueDate, now);
}

/**
 * The reminder to send now: the most serious one that is due and not yet sent.
 * Returns null when the invoice isn't overdue or every due reminder has gone out.
 */
export function nextReminder(dueDate: Date, now: Date, sent: ReadonlySet<ReminderKind>): ReminderKind | null {
  const overdue = daysOverdue(dueDate, now);
  const due = REMINDER_SCHEDULE.filter((r) => overdue >= r.afterDays && !sent.has(r.kind));
  return due.length ? due[due.length - 1].kind : null;
}

export interface ReminderMessageInput {
  kind: ReminderKind;
  brandName: string;
  contactName?: string | null;
  invoiceNumber: string;
  outstandingPaise: number;
  dueDate: Date;
  senderName: string;
  upiId?: string | null;
  /** Used to word a reminder sent before the due date ("is due" instead of "was due"). */
  now?: Date;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function reminderMessage(m: ReminderMessageInput): { subject: string; body: string } {
  const hi = m.contactName ? `Hi ${m.contactName}` : `Hi ${m.brandName} team`;
  const amount = formatINR(m.outstandingPaise);
  const due = dateFmt.format(m.dueDate);
  const pay = m.upiId ? `\n\nYou can pay by UPI to ${m.upiId}.` : "";
  const sign = `\n\nThanks,\n${m.senderName}`;

  switch (m.kind) {
    case "POLITE": {
      const notDueYet = m.now !== undefined && daysOverdue(m.dueDate, m.now) <= 0;
      return {
        subject: `Gentle reminder: invoice ${m.invoiceNumber}`,
        body: notDueYet
          ? `${hi},\n\nHope you're doing well! Just a note that invoice ${m.invoiceNumber} for ${amount} is due on ${due}. Could you confirm it's scheduled for payment?${pay}${sign}`
          : `${hi},\n\nHope you're doing well! A gentle reminder that invoice ${m.invoiceNumber} for ${amount} was due on ${due}. Could you let me know when the payment is scheduled?${pay}${sign}`,
      };
    }
    case "FIRM":
      return {
        subject: `Payment overdue: invoice ${m.invoiceNumber}`,
        body: `${hi},\n\nFollowing up on invoice ${m.invoiceNumber} for ${amount}, which was due on ${due} and is now overdue. Please share the payment date, or let me know if anything is holding it up.${pay}${sign}`,
      };
    case "FINAL":
      return {
        subject: `Final reminder: invoice ${m.invoiceNumber} overdue`,
        body: `${hi},\n\nThis is a final reminder that invoice ${m.invoiceNumber} for ${amount} has been outstanding since ${due}. Please clear the payment within 7 days. I'd like to resolve this smoothly and keep working together.${pay}${sign}`,
      };
  }
}

/** Normalise an Indian phone number for wa.me: digits only, with the 91 country code. */
export function normaliseIndianPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return /^91[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** WhatsApp click-to-chat: free, and the creator presses send themselves. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const number = normaliseIndianPhone(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

export function mailtoLink(email: string | null | undefined, subject: string, body: string): string | null {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
