import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { WaitlistForm } from "@/components/marketing/waitlist-form";

const steps = [
  {
    title: "Every deal on one board",
    body: "Paid, barter or hybrid. Deliverables, posting dates and usage rights, from the first DM to paid.",
  },
  {
    title: "Invoices the brand's finance team accepts",
    body: "GST invoice or bill of supply, numbered right for the financial year, with the TDS they'll deduct.",
  },
  {
    title: "Paid on time, without the awkward chase",
    body: "See who owes you and for how long. A polite, then firm reminder opens in WhatsApp. You press send.",
  },
];

const facts = [
  { value: "18%", label: "GST split for you" },
  { value: "3", label: "reminder tones" },
  { value: "₹0", label: "during the pilot" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="hero-wash">
          <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 pb-14 pt-16 sm:px-6 sm:pt-24">
            <p className="eyebrow">For Indian creators &amp; talent managers</p>
            <h1 className="display text-[3.1rem] sm:text-7xl">
              Every brand collab,
              <br />
              <em>paid on time.</em>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Paste a brand&apos;s brief and CreatorDesk sets up the deal, flags the risky terms, makes the invoice and
              reminds you, kindly, who still owes you money.
            </p>
            <div className="max-w-xl">
              <WaitlistForm />
            </div>
          </div>
        </section>

        <section aria-label="At a glance" className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <dl className="grid grid-cols-3 gap-4 border-y py-8">
            {facts.map((f) => (
              <div key={f.label} className="grid gap-1">
                <dt className="order-2 text-sm text-muted-foreground">{f.label}</dt>
                <dd className="display order-1 text-4xl sm:text-5xl">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-label="How it works" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
          <ol className="divide-y">
            {steps.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[3.25rem_1fr] gap-x-4 py-8 sm:grid-cols-[5rem_1fr]">
                <span className="display text-2xl italic text-muted-foreground" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="grid gap-2">
                  <h2 className="text-xl font-medium">{s.title}</h2>
                  <p className="text-lg leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-x-8 gap-y-3 py-8 text-lg">
            <Link href="/login" className="inline-flex items-center gap-1.5 hover:text-primary">
              Try it with your deals <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/privacy" className="inline-flex items-center gap-1.5 hover:text-primary">
              How we protect your data <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-12 pt-4 text-sm leading-relaxed text-muted-foreground sm:px-6">
        CreatorDesk keeps records and calculates amounts. It isn&apos;t tax advice: check GST and TDS with your CA.{" "}
        <Link href="/privacy" className="underline decoration-muted-foreground/40 underline-offset-4 hover:text-foreground">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline decoration-muted-foreground/40 underline-offset-4 hover:text-foreground">
          Terms
        </Link>
      </footer>
    </div>
  );
}
