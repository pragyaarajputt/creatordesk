"use client";

import { Handshake, LayoutDashboard, ReceiptText, Settings, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/deals", label: "Deals", icon: Handshake },
  { href: "/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/brands", label: "Brands", icon: Store },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

// The current URL is request data, so with Cache Components it must be read inside <Suspense>.
// The fallback is the same nav with nothing highlighted, so nothing shifts while it resolves.

/** Text links in the header on larger screens. */
export function DesktopNav() {
  return (
    <Suspense fallback={<DesktopNavView pathname="" />}>
      <DesktopNavLive />
    </Suspense>
  );
}

function DesktopNavLive() {
  return <DesktopNavView pathname={usePathname()} />;
}

function DesktopNavView({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm transition-colors",
            isActive(pathname, href) ? "bg-secondary text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label === "Home" ? "Dashboard" : label}
        </Link>
      ))}
    </nav>
  );
}

/** Bottom tab bar on phones, where creators will mostly use the app. */
export function MobileTabBar() {
  return (
    <Suspense fallback={<MobileTabBarView pathname="" />}>
      <MobileTabBarLive />
    </Suspense>
  );
}

function MobileTabBarLive() {
  return <MobileTabBarView pathname={usePathname()} />;
}

function MobileTabBarView({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[0.72rem] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
