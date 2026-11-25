import Link from "next/link";
import { cn } from "@/lib/utils";

/** CreatorDesk mark: a deal card with a paid tick. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className={cn("size-7", className)}>
      <rect x="3" y="5" width="22" height="18" rx="4.5" stroke="currentColor" strokeWidth="2.2" className="text-primary" />
      <path d="M3 10.5h22" stroke="currentColor" strokeWidth="2.2" className="text-primary" />
      <path d="m10 16.2 2.6 2.5 5.4-5.2" stroke="currentColor" className="text-foreground" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 text-[1.35rem] leading-none", className)} aria-label="CreatorDesk home">
      <LogoMark />
      <span className="text-primary">
        Creator<span className="font-semibold">Desk</span>
      </span>
    </Link>
  );
}
