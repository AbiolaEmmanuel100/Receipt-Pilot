import type { Metadata } from "next";
import Link from "next/link";
import { receiptHtml } from "@/lib/receipt";
import { buttonClass } from "@/components/ui/Button";
import { Pricing } from "@/components/marketing/Pricing";
import { IconLock, IconCloud, IconDownload, IconList, IconOffline, IconQr, IconReceipt, IconUsers, IconWhatsApp } from "@/components/ui/Icons";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// Visitors who arrive with an auth callback, an old deep link (#generator,
// ?edit=) or from the installed app go straight to the generator.
const REDIRECT = `(function(){try{var l=location,s=l.search,h=l.hash,q=s+h;
if(/access_token|error_code|token_hash|[?&#]type=|[?&]code=|[?&](edit|duplicate)=|#signin|#generator/.test(q)||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone){l.replace('/new'+s+(h==='#generator'?'':h));}}catch(e){}})();`;

const SAMPLE = receiptHtml({
  number: "RCT-000124", date: "2026-11-02", time: "10:42", payment: "Transfer", currency: "NGN", template: "classic",
  business: { name: "Example Foods", address: "12 Market Road, Ibadan", phone: "+234 800 000 0000" },
  customer: { name: "Customer name" },
  items: [
    { name: "Jollof rice (tray)", qty: 2, price: 12000, total: 24000 },
    { name: "Chapman (1L)", qty: 3, price: 2500, total: 7500 },
  ],
  subtotal: 31500, discount: 0, taxPct: 0, tax: 0, shipping: 0, grand: 31500, paid: 20000, balance: 11500, status: "PARTIALLY PAID",
});

const FEATURES = [
  { icon: IconReceipt, title: "Receipts in a few taps", body: "Add items with quantity and price. Totals, discount, tax and delivery are worked out for you." },
  { icon: IconWhatsApp, title: "Send on WhatsApp", body: "Share a receipt link, send it on WhatsApp or by email, or copy the link." },
  { icon: IconDownload, title: "PDF, image or print", body: "Download a PDF or PNG copy, or print just the receipt." },
  { icon: IconQr, title: "Scan to verify", body: "Shared receipts carry a QR code and link, so your customer can check the receipt is real." },
  { icon: IconList, title: "Every sale in one list", body: "Search receipts, filter by status, and see total sales, paid and outstanding." },
  { icon: IconUsers, title: "Customers and sales", body: "See your customers and a sales summary built from your saved receipts." },
  { icon: IconOffline, title: "Works on slow data", body: "Install it on your phone. Receipts save on the device, so you can keep working offline." },
  { icon: IconCloud, title: "Backed up with an account", body: "Sign in to sync receipts across your devices. Export CSV or a backup file any time." },
];

const FAQ = [
  ["Where are my receipt records stored?", "Receipts are stored in this browser on this device. If you log in, they also sync to your own cloud records. Other users cannot see them. Clearing browser data can still remove the local copy."],
  ["How much does it cost?", "Accounts start with a 14-day free trial. After that it is ₦1,500 a month, or a longer plan, paid in Naira through Paystack. Renewal is manual."],
  ["Can I download old receipts?", "Yes. Open Receipt Records, view a receipt, then download PDF or print."],
  ["Can I export my records?", "Yes. Export CSV for spreadsheets, or download a JSON backup you can restore later."],
  ["Can I add my business logo?", "Yes. Upload an image in Business Settings and save."],
  ["Can I use different currencies?", "Choose NGN, USD, GBP, EUR, GHS or KES. The currency you select appears on receipts and reports."],
];

export default function Home() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: REDIRECT }} />
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] bg-[radial-gradient(60%_60%_at_70%_30%,rgba(15,118,110,0.16),transparent_70%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-8 md:grid-cols-[1.05fr_1fr] md:pb-20 md:pt-16">
          <div className="rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-dark">Online receipt maker for small businesses</p>
            <h1 className="mt-4 text-[2.15rem] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl md:text-[3.4rem]">
              Professional receipts, <span className="text-brand">straight from your phone.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-600">Make a receipt, send it on WhatsApp or as a PDF, and keep every sale in one place. Built for phones and slow data.</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link href="/new" className={buttonClass("primary", "lg")}>Create a receipt</Link>
              <Link href="/signin?mode=signup" className={buttonClass("secondary", "lg")}>Start 14-day free trial</Link>
            </div>
            <p className="mt-3 text-sm text-muted">Then from ₦1,500 a month. Paid in Naira through Paystack.</p>
          </div>
          <div className="rise-2 relative mx-auto w-full max-w-[420px]">
            <div className="floaty">
              <div className="rotate-[1.5deg] rounded-2xl border border-line bg-white p-2 shadow-lift">
                <div className={SAMPLE.className + " pointer-events-none select-none"} aria-label="Example receipt" role="img" dangerouslySetInnerHTML={{ __html: SAMPLE.html }} />
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted">Example receipt (Classic style)</p>
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight">Everything a small shop needs to give receipts</h2>
          <p className="mt-2 max-w-2xl text-lg text-slate-600">No accounting jargon. Just receipts your customers trust, and a record of every sale.</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-2xl border border-line bg-bg p-5 transition-shadow hover:shadow-soft">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand"><f.icon className="size-6" /></span>
                <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
                <p className="mt-1 text-[15px] text-slate-600">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 md:py-20">
        <h2 className="text-3xl font-extrabold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["Add what you sold", "Type the items, quantity and price. Add the customer if you like."],
            ["Pick how they paid", "Cash, transfer or POS, and whether it is paid, part-paid or unpaid."],
            ["Save and send", "Send it on WhatsApp, download a PDF or image, or print it. It is saved in your receipts."],
          ].map(([t, b], i) => (
            <li key={t} className="flex gap-4 rounded-2xl border border-line bg-white p-5">
              <span className="tabular flex size-10 shrink-0 items-center justify-center rounded-full bg-navy text-lg font-extrabold text-white">{i + 1}</span>
              <div><h3 className="text-lg font-bold">{t}</h3><p className="mt-1 text-[15px] text-slate-600">{b}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section id="pricing" className="scroll-mt-20 border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight">Simple pricing in Naira</h2>
              <p className="mt-2 max-w-2xl text-lg text-slate-600">Every account starts with a <strong className="text-ink">14-day free trial</strong>. After that, choose a plan. Renewal is manual.</p>
            </div>
            <Link href="/signin?mode=signup" className={buttonClass("primary")}>Start free trial</Link>
          </div>
          <div className="mt-8"><Pricing /></div>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted"><IconLock className="size-4" />Payments by Paystack · charged in Naira</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 md:py-20">
        <h2 className="text-3xl font-extrabold tracking-tight">Questions</h2>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                {q}<span aria-hidden="true" className="text-xl text-brand transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="pb-4 text-[16px] text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 rounded-3xl bg-brand px-6 py-10 text-white sm:flex-row sm:items-center md:px-10">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Make your next receipt now</h2>
            <p className="mt-1 text-teal-50">It opens straight into the receipt form.</p>
          </div>
          <Link href="/new" className={buttonClass("secondary", "lg", "!text-brand-deep")}>Create a receipt</Link>
        </div>
      </section>
    </>
  );
}
