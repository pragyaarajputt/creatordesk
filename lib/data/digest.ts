import "server-only";
import { prisma } from "@/lib/db";
import { addDays, istDateKey } from "@/lib/fy";
import { formatINR, outstandingPaise } from "@/lib/money";
import { daysOverdue, nextReminder, type ReminderKind } from "@/lib/reminders";
import { Prisma } from "@/lib/generated/prisma/client";

export interface DigestEmail {
  to: string[];
  subject: string;
  text: string;
}

export type SendEmail = (email: DigestEmail) => Promise<void>;

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/**
 * Daily summary per workspace: overdue invoices (with the reminder that's due) and deliverables due soon.
 * Safe to run more than once a day: a DigestRun row per workspace per IST day is claimed before sending.
 */
export async function runDailyDigest(now: Date, send: SendEmail, appUrl: string) {
  const dateKey = istDateKey(now);
  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      name: true,
      members: { where: { role: { in: ["OWNER", "MANAGER"] } }, select: { user: { select: { email: true } } } },
    },
  });

  const result = { dateKey, sent: 0, skippedAlreadySent: 0, skippedNothingToSay: 0 };

  for (const ws of workspaces) {
    const [invoices, deliverables] = await Promise.all([
      prisma.invoice.findMany({
        where: { workspaceId: ws.id, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } },
        include: { payments: true, reminders: true, deal: { select: { brand: { select: { name: true } } } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.deliverable.findMany({
        where: { workspaceId: ws.id, status: { not: "POSTED" }, dueDate: { gte: addDays(now, -1), lte: addDays(now, 2) } },
        include: { deal: { select: { title: true, brand: { select: { name: true } } } } },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    const overdue = invoices
      .map((inv) => ({ inv, due: outstandingPaise(inv.totalPaise, inv.payments), days: daysOverdue(inv.dueDate, now) }))
      .filter((r) => r.due > 0 && r.days > 0);

    if (overdue.length === 0 && deliverables.length === 0) {
      result.skippedNothingToSay += 1;
      continue;
    }
    const to = ws.members.map((m) => m.user.email);
    if (to.length === 0) continue;

    // Claim today's run first; a unique violation means another run already sent it.
    try {
      await prisma.digestRun.create({ data: { workspaceId: ws.id, dateKey, sentTo: to } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        result.skippedAlreadySent += 1;
        continue;
      }
      throw error;
    }

    const lines: string[] = [`Good morning! Here's your CreatorDesk summary for ${ws.name}.`, ""];
    if (overdue.length) {
      const total = overdue.reduce((s, r) => s + r.due, 0);
      lines.push(`OVERDUE: ${formatINR(total)} across ${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`);
      for (const { inv, due, days } of overdue) {
        const sent = new Set(inv.reminders.map((r) => r.kind as ReminderKind));
        const next = nextReminder(inv.dueDate, now, sent);
        const hint = next ? ` → send a ${next.toLowerCase()} reminder` : "";
        lines.push(`- ${inv.number} · ${inv.deal.brand.name} · ${formatINR(due)} · ${days} days overdue${hint}`);
        lines.push(`  ${appUrl}/invoices/${inv.id}`);
      }
      lines.push("");
    }
    if (deliverables.length) {
      lines.push("DUE SOON:");
      for (const d of deliverables) {
        lines.push(`- ${d.format.toLowerCase()} for ${d.deal.brand.name} (${d.deal.title}) · due ${d.dueDate ? dateFmt.format(d.dueDate) : "soon"}`);
      }
      lines.push("");
    }
    lines.push("Reminders are never sent to brands automatically. You choose what to send.");

    await send({
      to,
      subject: overdue.length
        ? `${overdue.length} overdue payment${overdue.length === 1 ? "" : "s"} · CreatorDesk`
        : "Deliverables due soon · CreatorDesk",
      text: lines.join("\n"),
    });
    result.sent += 1;
  }
  return result;
}

/** Send through Resend's HTTP API when configured; otherwise log (dry run). */
export function emailSender(): { send: SendEmail; mode: "resend" | "dry-run" } {
  const key = process.env.RESEND_API_KEY || process.env.AUTH_RESEND_KEY;
  if (!key) {
    return {
      mode: "dry-run",
      send: async (email) => {
        console.info(`[digest dry-run] to=${email.to.length} recipient(s) subject="${email.subject}"`);
      },
    };
  }
  const from = process.env.RESEND_FROM ?? "CreatorDesk <onboarding@resend.dev>";
  return {
    mode: "resend",
    send: async (email) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.text }),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    },
  };
}
