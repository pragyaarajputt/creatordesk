import { Suspense } from "react";
import { DesktopNav, MobileTabBar } from "@/components/app/app-nav";
import { Logo } from "@/components/brand/logo";
import { getWorkspaceContext } from "@/lib/tenancy";
import { signOutAction } from "./deals/actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-3.5 sm:px-6">
          <Logo href="/dashboard" />
          <DesktopNav />
          <div className="ml-auto flex items-center gap-3">
            <Suspense fallback={null}>
              <WorkspaceName />
            </Suspense>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-[10px] border px-3.5 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="hero-wash mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 sm:px-6 md:pb-12">{children}</main>
      <MobileTabBar />
    </div>
  );
}

async function WorkspaceName() {
  const ctx = await getWorkspaceContext();
  return (
    <span className="hidden max-w-48 truncate text-sm text-muted-foreground lg:inline">
      {ctx.workspaceName} · {ctx.role.toLowerCase()}
    </span>
  );
}
