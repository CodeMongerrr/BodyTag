import Link from "next/link";
import { appConfig } from "@/lib/config";
import { BrandRoundel } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="pit-stripe" />
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <BrandRoundel className="h-6 w-6" />
              <span className="font-display text-lg uppercase tracking-tight">BodyTag</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">
              The rate card for the walking billboard at your event — numbered, priced, and vetted before a brand ever
              buys.
            </p>
            <p className="pit-label mt-4 text-muted" suppressHydrationWarning>
              Hosted fee {appConfig.hostedFeeBps / 100}% of winning volume · paid only when you get paid
            </p>
          </div>
          <div className="text-sm">
            <p className="pit-label mb-3 text-paper">Platform</p>
            <ul className="space-y-2 text-muted">
              <li>
                <Link href="/#how-it-works" className="hover:text-paper">
                  How it works
                </Link>
              </li>
              <li>
                <Link href="/#trust" className="hover:text-paper">
                  Trust &amp; QA
                </Link>
              </li>
              <li>
                <Link href="/status" className="hover:text-paper">
                  System status
                </Link>
              </li>
              <li>
                <Link href="/help" className="hover:text-paper">
                  Help center
                </Link>
              </li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="pit-label mb-3 text-paper">Legal</p>
            <ul className="space-y-2 text-muted">
              <li>
                <Link href="/terms" className="hover:text-paper">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-paper">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="hover:text-paper">
                  Refunds
                </Link>
              </li>
              <li>
                <Link href="/content-policy" className="hover:text-paper">
                  Content policy
                </Link>
              </li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="pit-label mb-3 text-paper">Contact</p>
            <ul className="space-y-2 text-muted">
              <li>
                <a href={`mailto:${appConfig.supportEmail}`} className="hover:text-paper">
                  {appConfig.supportEmail}
                </a>
              </li>
              <li>
                <a href="mailto:creators@bodytag.app" className="hover:text-paper">
                  creators@bodytag.app
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-line pb-16 pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:pb-0">
          <p>© {new Date().getFullYear()} BodyTag. All slots reserved.</p>
          <p>Source available under AGPL-3.0 · self-host runs at 0% platform fee — see the README for the guide.</p>
        </div>
      </div>
    </footer>
  );
}
