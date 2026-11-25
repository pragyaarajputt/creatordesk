import { Badge } from "@/components/ui/badge";

const LABEL: Record<string, string> = {
  ISSUED: "Unpaid",
  PARTIALLY_PAID: "Part paid",
  PAID: "Paid",
  VOID: "Void",
};

export function InvoiceStatusBadge({ status, overdueDays }: { status: string; overdueDays: number }) {
  if (overdueDays > 0 && status !== "PAID" && status !== "VOID") {
    return <Badge variant="destructive">{overdueDays} {overdueDays === 1 ? "day" : "days"} overdue</Badge>;
  }
  return <Badge variant={status === "PAID" ? "secondary" : "outline"}>{LABEL[status] ?? status}</Badge>;
}
