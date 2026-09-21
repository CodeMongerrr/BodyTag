"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicCampaign } from "@/lib/campaigns";
import { formatMoney } from "@bodytag/shared";
import { publicFileUrl } from "@/lib/public-url";
import { BidOverlay } from "@/components/bid-overlay";
import { ArenaCanvas } from "@/components/arena-canvas";
import { defaultArenaConfig, type ArenaConfig } from "@bodytag/shared";
import { reportCampaignAction } from "@/app/actions";

function isSafeHttpsUrl(urlString: string | null | undefined): boolean {
  if (!urlString || typeof urlString !== "string") return false;
  const trimmed = urlString.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function CampaignStorefront({ campaign, preview }: { campaign: PublicCampaign; preview?: boolean }) {
  const [local, setLocal] = useState<PublicCampaign>(campaign);
  const [surfaceId, setSurfaceId] = useState(campaign.surfaces[0]?.id ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [viewers, setViewers] = useState(1);
  const [openBid, setOpenBid] = useState(false);
  const [rewind, setRewind] = useState(false);

  useEffect(() => {
    setLocal(campaign);
  }, [campaign]);

  const refreshCampaign = async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, { cache: "no-store" });
      if (res.ok) {
        const updated = (await res.json()) as PublicCampaign;
        setLocal(updated);
      }
    } catch (err) {
      console.warn("Failed to fetch campaign update", err);
    }
  };

  const config = useMemo(
    () => ({ ...defaultArenaConfig, ...(local.arenaConfig as Partial<ArenaConfig>) }),
    [local.arenaConfig],
  );
  const surface = local.surfaces.find((s) => s.id === surfaceId) ?? local.surfaces[0];
  const slot = local.slots.find((s) => s.id === selected);
  const raised = local.slots.reduce((s, sl) => s + (sl.owner ? sl.currentPriceCents / 2 : 0), 0);
  const sold = local.slots.filter((s) => s.owner).length;

  useEffect(() => {
    const es = new EventSource(`/api/campaigns/${campaign.id}/events`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "presence" && typeof data.viewers === "number") {
          setViewers(data.viewers);
        }
        if (data.type === "bid") {
          refreshCampaign();
        }
        if (data.type === "paused") {
          setLocal((prev) => ({
            ...prev,
            status: "paused",
            pausedReason: typeof data.reason === "string" ? data.reason : prev.pausedReason,
          }));
          refreshCampaign();
        }
        if (data.type === "live") {
          setLocal((prev) => ({ ...prev, status: "live", pausedReason: null }));
          refreshCampaign();
        }
        if (data.type === "creative" || data.type === "update") {
          refreshCampaign();
        }
      } catch (err) {
        console.error("Error handling SSE event", err);
      }
    };
    return () => es.close();
  }, [campaign.id]);

  useEffect(() => {
    if (!selected) return;
    fetch("/api/views", { method: "POST", body: JSON.stringify({ slotId: selected }), headers: { "content-type": "application/json" } });
  }, [selected]);

  const live = local.status === "live" && !preview;

  return (
    <main>
      {(local.status === "paused" || preview) && (
        <div className="bg-signal px-4 py-2 text-center text-sm text-paper">
          {preview ? "Preview — noindex, not live." : local.pausedReason ?? "Bidding paused. The page stays up as evidence."}
        </div>
      )}
      {!local.creator.verified && (
        <div className="bg-panel px-4 py-2 text-center text-sm text-muted">
          New creator. BodyTag does not hold brand bid money. Hosted Stake is a prepaid software margin until the event is
          proven.
        </div>
      )}
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1.3fr_0.7fr]">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent">
            @{local.creator.handle} · {local.eventCity} · {viewers} watching
          </p>
          <h1 className="mt-2 text-4xl md:text-5xl">{local.title}</h1>
          <p className="mt-2 text-sm text-muted">{local.affiliationNote}</p>
          {local.theme === "photo" ? (
            <>
              <div className="mt-4 flex gap-2">
                {local.surfaces.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSurfaceId(s.id)}
                    className={`border px-3 py-1 text-sm ${surfaceId === s.id ? "border-accent text-accent" : "border-line"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="relative mt-3 border border-line bg-panel">
                {surface && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicFileUrl(surface.objectKey)} alt={surface.label} className="block w-full" />
                    {local.slots
                      .filter((s) => s.surfaceId === surface.id && s.rect)
                      .map((s) => {
                        const r = s.rect as { x: number; y: number; w: number; h: number };
                        return (
                          <button
                            key={s.id}
                            type="button"
                            aria-label={`${s.name}, ${formatMoney(s.currentPriceCents)}, ${s.owner ? "owned by " + s.owner.brandName : "available"}`}
                            onClick={() => setSelected(s.id)}
                            className={`absolute border-2 focus:outline focus:outline-accent ${s.id === selected ? "border-accent" : s.owner ? "border-paper/80" : "border-accent/70"}`}
                            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                          >
                            {s.owner?.logoKey && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={publicFileUrl(s.owner.logoKey)} alt="" className="h-full w-full object-contain bg-ink/40" />
                            )}
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="mt-4">
              <ArenaCanvas campaign={local} config={config} selectedId={selected} onSelect={setSelected} rewind={rewind} />
              <p className="mt-2 text-xs text-muted">
                Mobile screenshot fallback is the OG image. The slot list on the right is the accessible UI.
              </p>
            </div>
          )}
        </div>
        <aside className="space-y-6">
          <div className="border border-line p-4">
            <p className="font-mono text-xs uppercase tracking-widest text-muted">Raised (winning slots)</p>
            <p className="display text-4xl">{formatMoney(local.gmvCents || raised)}</p>
            {local.targetTotalCents && (
              <div className="mt-2 h-2 bg-ink">
                <div
                  className="h-2 bg-accent"
                  style={{ width: `${Math.min(100, ((local.gmvCents || raised) / local.targetTotalCents) * 100)}%` }}
                />
              </div>
            )}
            <p className="mt-2 text-sm text-muted">
              {sold}/{local.slots.length} sold · closes {new Date(local.closeAt).toUTCString()}
            </p>
            <Countdown to={local.closeAt} />
          </div>
          {config.showTicker && <Ticker viewers={viewers} />}
          <div>
            <h2 className="text-xl">View sponsors</h2>
            <ul className="mt-3 divide-y divide-line border border-line">
              {local.slots.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.id)}
                    className="flex w-full items-center justify-between p-3 text-left"
                    aria-label={`${s.name}, ${formatMoney(s.currentPriceCents)}, ${s.owner ? "sold" : "available"}`}
                  >
                    <span>
                      <span className="block">{s.name}</span>
                      <span className="text-xs text-muted">
                        {s.owner ? s.owner.brandName : "Available"} · {s.viewCount} views
                      </span>
                    </span>
                    <span className="font-mono text-sm">{formatMoney(s.takeoverCents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {slot && (
            <div className="border border-accent p-4">
              <h3 className="text-2xl">{slot.name}</h3>
              <p className="text-sm text-muted">
                {slot.sizeNote} {slot.hyroxCm ? `· HYROX ${slot.hyroxCm} cm²` : ""}
              </p>
              {slot.owner ? (
                <p className="mt-2">
                  {slot.owner.brandName}
                  {slot.owner.tagline ? ` — ${slot.owner.tagline}` : ""}{" "}
                  {slot.owner.url && isSafeHttpsUrl(slot.owner.url) && (
                    <a
                      href={slot.owner.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      site
                    </a>
                  )}
                </p>
              ) : (
                <p className="mt-2 text-muted">No owner yet. First purchase owns until a 2× takeover.</p>
              )}
              <p className="mt-2 font-mono">{formatMoney(slot.currentPriceCents)} to own</p>
              {live && (
                <button type="button" className="mt-3 w-full bg-accent py-3 font-medium text-ink" onClick={() => setOpenBid(true)}>
                  Purchase this slot
                </button>
              )}
            </div>
          )}
          <details className="border border-line p-4 text-sm">
            <summary className="cursor-pointer">Auction rules</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
              <li>You are buying a numbered advertising placement, not placing a bet.</li>
              <li>Pay the listed price. Someone else may take over at 2×. You are credited to wallet (not a card refund loop).</li>
              <li>Logo goes live on this URL when payment succeeds.</li>
              <li>No mind-change refunds. Event cancelled → creator refunds on their processor.</li>
              <li>Content policy violations are forfeit.</li>
            </ul>
          </details>
          <div className="flex flex-wrap gap-3 text-sm">
            <a href={`/api/images/${local.id}/og`}>OG</a>
            <a href={`/api/images/${local.id}/square`}>Square</a>
            <a href={`/api/images/${local.id}/story`}>Story</a>
            <a href={`/manage`}>Sponsor portal</a>
            {config.rewindEnabled && (
              <button type="button" onClick={() => setRewind((v) => !v)}>
                Rewind
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const reason = prompt("Why are you reporting this campaign?");
                if (reason) reportCampaignAction(local.id, reason);
              }}
            >
              Report
            </button>
          </div>
          {rewind && (
            <p className="text-xs text-muted">
              Rewind is playing settled bid history on the body. Under load we shed this first so the billboard stays up.
            </p>
          )}
        </aside>
      </div>
      {openBid && slot && (
        <BidOverlay
          campaign={local}
          slot={slot}
          onClose={() => setOpenBid(false)}
          onSettled={() => {
            setOpenBid(false);
            refreshCampaign();
          }}
        />
      )}
    </main>
  );
}

function Countdown({ to }: { to: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const tick = () => {
      const ms = new Date(to).getTime() - Date.now();
      if (ms <= 0) setLabel("Closed");
      else {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        setLabel(`${h}h ${m}m`);
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [to]);
  return <p className="font-mono text-accent">{label}</p>;
}

function Ticker({ viewers }: { viewers: number }) {
  const countries = useMemo(() => ["IN", "US", "SG", "DE", "BR"], []);
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => x + 1), 2800);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="font-mono text-xs uppercase tracking-widest text-muted">
      Visitor from {countries[i % countries.length]} · {viewers} on the floor
    </p>
  );
}
