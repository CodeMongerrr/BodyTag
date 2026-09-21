import Link from "next/link";
import { prisma } from "@/lib/db";
import { appConfig } from "@/lib/config";
import { formatMoney, livePath } from "@bodytag/shared";
import { MarketplaceGrid } from "@/components/marketplace-grid";
import { HeroLiveryDiagram, HeroLiverySheet } from "@/components/hero-livery-diagram";

const STEPS = [
  {
    p: "P1",
    title: "Map your slots",
    body: "Outline sellable zones on a photo — front, back, or both — or drop them onto a 3D model of your event's gear. Name each one, order them, set a price.",
  },
  {
    p: "P2",
    title: "Publish one live link",
    body: "/@you/your-event goes live with the rate card built in. No separate landing page, no PDF prospectus to keep re-sending.",
  },
  {
    p: "P3",
    title: "Brands buy or take over",
    body: "A brand pays the listed price, or a set multiple to take a sold zone from the current sponsor. The outbid sponsor is credited to a wallet — not left chasing a refund.",
  },
  {
    p: "P4",
    title: "You get paid, they get proof",
    body: "Funds settle on your own payment processor. After the event, download a print pack — every logo plus a placement diagram — for each sponsor's records.",
  },
];

const SLAS = [
  { label: "Impersonation / scam report", time: "1 hr to pause" },
  { label: "Payment stuck or double-charged", time: "4 business hrs" },
  { label: "Outbid wallet credit missing", time: "4 hrs" },
  { label: "Creator KYC review", time: "1–2 business days" },
];

export default async function HomePage() {
  const live = appConfig.marketplaceGrid
    ? await prisma.campaign.findMany({
        where: { status: { in: ["live", "paused"] } },
        include: { creator: true, slots: true },
        orderBy: { closeAt: "asc" },
        take: 12,
      })
    : [];

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-[1.05fr_0.95fr] md:py-24">
          <div>
            <h1 className="max-w-xl text-5xl md:text-6xl">Sell every sellable inch of your event.</h1>
            <p className="mt-6 max-w-lg text-lg text-muted">
              Map numbered sponsor slots onto a photo or a 3D model of the gear your event already puts in front of a
              crowd. Publish one live link. Brands buy a slot outright, or take it over at a set multiple — the
              previous sponsor gets credited, not ghosted. Every campaign clears content review before a logo goes
              live.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className="bg-accent px-6 py-3 font-display uppercase tracking-wide text-ink no-underline hover:bg-accent-dim"
              >
                Start a campaign
              </Link>
              <Link href="#how-it-works" className="border border-line px-6 py-3 no-underline hover:border-paper/40">
                See how it works
              </Link>
            </div>
            <dl className="figures mt-14 grid max-w-lg grid-cols-1 divide-y divide-line border-y border-line py-1 text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:py-5">
              <div className="py-3 sm:py-0 sm:px-4 sm:first:pl-0">
                <dt className="pit-label text-muted">Hosted fee</dt>
                <dd className="mt-1.5 text-2xl text-paper" suppressHydrationWarning>
                  {appConfig.hostedFeeBps / 100}%
                </dd>
              </div>
              <div className="py-3 sm:py-0 sm:px-4">
                <dt className="pit-label text-muted">Arena + images</dt>
                <dd className="mt-1.5 text-2xl text-paper">$0</dd>
              </div>
              <div className="py-3 sm:py-0 sm:px-4">
                <dt className="pit-label text-muted">Reviewed before launch</dt>
                <dd className="mt-1.5 text-2xl text-paper">Every campaign</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-col items-center gap-6 md:items-end">
            <HeroLiveryDiagram />
            <div className="w-full max-w-md">
              <p className="pit-label mb-2 text-muted">Sample slot map — illustrative</p>
              <HeroLiverySheet />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="max-w-xl text-4xl md:text-5xl">From empty gear to a paid-out grid.</h2>
        <ol className="mt-12 divide-y divide-line border-y border-line">
          {STEPS.map((step) => (
            <li key={step.p} className="grid gap-4 py-8 md:grid-cols-[100px_1fr_2fr] md:items-start">
              <span className="figures text-3xl text-accent">{step.p}</span>
              <h3 className="text-2xl leading-tight md:text-3xl">{step.title}</h3>
              <p className="max-w-xl text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Trust & QA */}
      <section id="trust" className="border-y border-line bg-panel">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 md:grid-cols-[1fr_1fr]">
          <div>
            <h2 className="max-w-md text-4xl md:text-5xl">Vetted before a brand&apos;s logo touches your event.</h2>
            <p className="mt-6 max-w-md text-muted">
              BodyTag treats a sold slot as a purchase and a takeover — never as a bet. Every campaign runs through
              content review before it can take a brand&apos;s money, every creator clears a KYC ladder before
              payouts unlock, and anyone can report a campaign for impersonation or misuse.
            </p>
            <p className="mt-4 max-w-md text-muted">
              An outbid sponsor is credited to a wallet the moment they&apos;re outbid — not routed into a
              card-refund queue.
            </p>
          </div>
          <div>
            <p className="pit-label mb-3 text-muted">Response times</p>
            <ul className="figures divide-y divide-line border border-line text-sm">
              {SLAS.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-sans text-paper">{row.label}</span>
                  <span className="text-accent">{row.time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="max-w-xl text-4xl md:text-5xl">Free to start. We only get paid when you do.</h2>
        <div className="mt-12 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-2">
          <div className="bg-ink p-8">
            <p className="pit-label text-muted">Self-host</p>
            <p className="figures mt-3 text-4xl text-paper">$0</p>
            <p className="mt-4 max-w-sm text-muted">
              Run BodyTag on your own infrastructure at a 0% platform fee. You cover your own Postgres, storage, and
              workers.
            </p>
          </div>
          <div className="bg-ink p-8">
            <p className="pit-label text-muted">Hosted</p>
            <p className="figures mt-3 text-4xl text-paper" suppressHydrationWarning>
              {appConfig.hostedFeeBps / 100}%
              <span className="text-lg text-muted"> of winning volume</span>
            </p>
            <p className="mt-4 max-w-sm text-muted">
              Captured from your prepaid Stake only after the event closes; any leftover is refunded. Arena hosting
              and image generation are included at no extra charge.
            </p>
          </div>
        </div>
      </section>

      {/* Live grid */}
      {appConfig.marketplaceGrid && (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-4xl md:text-5xl">On the grid right now</h2>
            <p className="text-sm text-muted">Ranked by time left, not by who shouts loudest.</p>
          </div>
          <MarketplaceGrid
            items={live.map((c) => ({
              href: livePath(c.creator.handle, c.slug),
              title: c.title,
              handle: c.creator.handle,
              theme: c.theme,
              eventDate: c.eventDate.toISOString(),
              raised: formatMoney(c.raisedCents, c.currency),
              spots: `${c.slots.filter((s) => s.status === "sold").length}/${c.slots.length} sold`,
              status: c.status,
              thumb: `/api/images/${c.id}/og?v=${c.updatedAt.getTime()}`,
            }))}
          />
          {live.length === 0 && (
            <p className="border border-dashed border-line p-10 text-muted">
              Nothing live yet. Seed with <code className="figures">pnpm db:seed</code>, then publish from the
              dashboard.
            </p>
          )}
        </section>
      )}

      {/* Closing CTA */}
      <section className="border-t border-line">
        <div className="pit-stripe" />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="text-4xl md:text-6xl">Your event is already inventory.</h2>
          <p className="mx-auto mt-4 max-w-md text-muted">Map the slots, set the prices, and put a rate card on it.</p>
          <Link
            href="/sign-up"
            className="mt-8 inline-block bg-accent px-8 py-4 font-display uppercase tracking-wide text-ink no-underline hover:bg-accent-dim"
          >
            Start a campaign
          </Link>
        </div>
      </section>
    </main>
  );
}
