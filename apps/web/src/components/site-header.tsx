import Link from "next/link";
import { logoutAction } from "@/app/actions";
import type { Session } from "@/lib/auth";
import { BrandRoundel, BrandWordmark } from "@/components/brand-mark";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#trust", label: "Trust & QA" },
  { href: "/help", label: "Help" },
  { href: "/status", label: "Status" },
];

export function SiteHeader({ session }: { session: Session | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <BrandRoundel className="h-8 w-8 shrink-0" />
          <BrandWordmark />
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted hover:text-paper">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm md:gap-4">
          {session ? (
            <>
              <Link href="/dashboard" className="hidden text-paper sm:inline">
                @{session.handle}
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="hidden text-muted hover:text-paper sm:inline">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/sign-in" className="hidden text-muted hover:text-paper sm:inline">
              Sign in
            </Link>
          )}
          <Link
            href={session ? "/dashboard/campaigns/new" : "/sign-up"}
            className="bg-accent px-4 py-2 font-display text-sm uppercase tracking-wide text-ink no-underline hover:bg-accent-dim"
          >
            Start a campaign
          </Link>
          <details className="group relative md:hidden">
            <summary className="flex h-8 w-8 cursor-pointer list-none flex-col items-center justify-center gap-1 border border-line [&::-webkit-details-marker]:hidden">
              <span className="h-px w-4 bg-paper" />
              <span className="h-px w-4 bg-paper" />
              <span className="h-px w-4 bg-paper" />
            </summary>
            <nav className="absolute right-0 top-[calc(100%+1px)] flex w-48 flex-col border border-line bg-ink text-sm">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="border-b border-line px-4 py-3 text-muted hover:text-paper">
                  {link.label}
                </Link>
              ))}
              {session ? (
                <form action={logoutAction}>
                  <button type="submit" className="w-full px-4 py-3 text-left text-muted hover:text-paper">
                    Sign out
                  </button>
                </form>
              ) : (
                <Link href="/sign-in" className="px-4 py-3 text-muted hover:text-paper">
                  Sign in
                </Link>
              )}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
