import Link from "next/link";
import { CampaignThumb } from "@/components/campaign-thumb";

export function MarketplaceGrid({
  items,
}: {
  items: {
    href: string;
    title: string;
    handle: string;
    theme: string;
    eventDate: string;
    raised: string;
    spots: string;
    status: string;
    thumb: string;
  }[];
}) {
  if (!items.length) return null;
  return (
    <ul className="grid gap-6 md:grid-cols-3">
      {items.map((item, i) => (
        <li key={item.href} className="border border-line bg-ink">
          <Link href={item.href} className="group block no-underline">
            <div className="relative aspect-[16/10] overflow-hidden bg-panel">
              <CampaignThumb src={item.thumb} theme={item.theme} />
              <span className="figures absolute left-0 top-0 flex h-8 w-8 items-center justify-center border-b border-r border-line bg-ink/90 text-xs text-accent">
                P{i + 1}
              </span>
              <span
                className={`pit-label absolute right-0 top-0 px-2 py-1.5 ${
                  item.status === "live" ? "bg-signal text-paper" : "bg-ink/90 text-muted"
                }`}
              >
                {item.status}
              </span>
            </div>
            <div className="border-t border-line p-4">
              <p className="pit-label text-muted">{item.theme}</p>
              <h3 className="mt-1 text-xl leading-none">{item.title}</h3>
              <p className="figures mt-2 text-sm text-muted">
                @{item.handle} · {item.raised} · {item.spots}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
