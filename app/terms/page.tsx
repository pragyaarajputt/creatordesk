import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="25 November 2026">
      <section className="grid gap-2">
        <h2>The pilot</h2>
        <p>CreatorDesk is free during the pilot. Features may change, and we&apos;ll tell you before any paid plan starts.</p>
      </section>
      <section className="grid gap-2">
        <h2>Not tax or legal advice</h2>
        <p>
          CreatorDesk records your deals and calculates GST and TDS amounts from the rates you choose. It does not decide
          whether you must register for GST, which TDS section applies, or what to file. Check those with a chartered accountant.
          You are responsible for the invoices you issue.
        </p>
      </section>
      <section className="grid gap-2">
        <h2>Your content</h2>
        <p>
          Your data stays yours. You can export or delete it at any time. Don&apos;t use CreatorDesk to store anything you
          don&apos;t have the right to store, such as other people&apos;s data without their consent.
        </p>
      </section>
      <section className="grid gap-2">
        <h2>Availability</h2>
        <p>We work to keep CreatorDesk available and your data safe, but during the pilot it is provided as is. Keep your own copies of issued invoices.</p>
      </section>
    </LegalPage>
  );
}
