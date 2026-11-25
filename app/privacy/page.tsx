import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="25 November 2026">
      <p>
        CreatorDesk helps creators and agencies keep track of brand deals, invoices and payments. This page explains what we
        store and why, in line with India&apos;s Digital Personal Data Protection Act, 2023.
      </p>
      <section className="grid gap-2">
        <h2>What we store</h2>
        <ul>
          <li>Your account: email address and name, from Google sign-in or the email you sign in with.</li>
          <li>What you enter: deals, deliverables, brands and their contacts, invoices, payments and reminders.</li>
          <li>Invoice details you add: legal name, address, GSTIN, PAN and UPI ID.</li>
          <li>An audit log of changes in your workspace, so you can see who changed what.</li>
          <li>Pilot waitlist: email, handle, role and the optional amount you said brands owe you.</li>
        </ul>
      </section>
      <section className="grid gap-2">
        <h2>What we don&apos;t do</h2>
        <ul>
          <li>We don&apos;t sell or rent your data, and we don&apos;t show ads.</li>
          <li>We don&apos;t message brands for you. Reminders open in your own WhatsApp or email app, and you press send.</li>
          <li>We don&apos;t connect to your bank or social media accounts.</li>
        </ul>
      </section>
      <section className="grid gap-2">
        <h2>Who processes it</h2>
        <p>
          Your data is stored with our hosting and database providers, and daily summary emails are sent through our email
          provider. They process it only to run CreatorDesk.
        </p>
      </section>
      <section className="grid gap-2">
        <h2>Your rights</h2>
        <ul>
          <li>Access: workspace owners can download all workspace data as JSON from Settings.</li>
          <li>Correction: edit any record at any time.</li>
          <li>Erasure: owners can delete a workspace and everything in it from Settings.</li>
        </ul>
        <p>For anything else, contact us at the email shown on the pilot invitation.</p>
      </section>
    </LegalPage>
  );
}
