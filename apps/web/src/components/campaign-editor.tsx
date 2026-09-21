"use client";

import { useState, useTransition } from "react";
import { PhotoEditor, type DraftSlot } from "@/components/photo-editor";
import { StakePanel } from "@/components/stake-panel";
import { AvaturnEmbed, type ExportAvatarResult } from "@/components/avaturn-embed";
import { attachBodySurface, avatarExportToFile, avatarMetaFromExport, uploadAvatarFile } from "@/lib/avatar-ingest";
import {
  pauseCampaignAction,
  publishCampaignAction,
  resumeCampaignAction,
  saveArenaConfigAction,
  saveSlotsAction,
  saveSoundtrackAction,
  saveVetoAction,
} from "@/app/actions";
import { defaultArenaConfig, formatMoney, isAvatarMeta, livePath, type ArenaConfig } from "@bodytag/shared";
import Link from "next/link";

type Surface = { id: string; objectKey: string; label: string; kind: string; meta?: unknown };
type Slot = {
  id?: string;
  surfaceId: string;
  name: string;
  startPriceCents: number;
  rect?: unknown;
  marker?: unknown;
  hyroxCm?: number | null;
  sizeNote?: string | null;
  currentPriceCents?: number;
};

export function CampaignEditor({
  campaign,
  handle,
  minStake,
}: {
  handle: string;
  minStake: number;
  campaign: {
    id: string;
    title: string;
    slug: string;
    theme: string;
    status: string;
    previewSecret: string;
    shortCode: string;
    gmvCents: number;
    accruedFeeCents: number;
    vetoList: unknown;
    arenaConfig: unknown;
    surfaces: Surface[];
    slots: Slot[];
    stakeHeld: number;
  };
}) {
  const [pending, start] = useTransition();
  const config = { ...defaultArenaConfig, ...(campaign.arenaConfig as Partial<ArenaConfig>) };
  const veto = Array.isArray(campaign.vetoList) ? (campaign.vetoList as string[]).join(", ") : "";

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">{campaign.theme} · {campaign.status}</p>
          <h1 className="text-4xl">{campaign.title}</h1>
          <p className="text-sm text-muted">
            Live URL {livePath(handle, campaign.slug)} · short /s/{campaign.shortCode} · preview /preview/{campaign.previewSecret}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/preview/${campaign.previewSecret}`} className="border border-line px-3 py-2 no-underline">
            Preview
          </Link>
          <a href={`/api/campaigns/${campaign.id}/print`} className="border border-line px-3 py-2">
            Print pack
          </a>
          {campaign.status === "live" ? (
            <button
              className="border border-line px-3 py-2"
              onClick={() => start(async () => { await pauseCampaignAction(campaign.id, "Paused by creator without unpublishing"); })}
            >
              Pause bidding
            </button>
          ) : campaign.status === "paused" ? (
            <button
              className="border border-line px-3 py-2"
              onClick={() =>
                start(async () => {
                  const res = await resumeCampaignAction(campaign.id);
                  if (res && "error" in res && res.error) alert(res.error);
                })
              }
            >
              Resume
            </button>
          ) : null}
          {campaign.status === "draft" || campaign.status === "paused" ? (
            <button
              disabled={pending}
              className="bg-accent px-4 py-2 font-medium text-ink"
              onClick={() =>
                start(async () => {
                  const res = await publishCampaignAction(campaign.id);
                  if (res && "error" in res && res.error) alert(res.error);
                })
              }
            >
              Publish live URL
            </button>
          ) : null}
        </div>
      </div>

      <StakePanel
        campaignId={campaign.id}
        held={campaign.stakeHeld}
        min={minStake}
        gmv={campaign.gmvCents}
        fee={campaign.accruedFeeCents}
        status={campaign.status}
      />

      {campaign.theme === "photo" ? (
        <PhotoEditor
          campaignId={campaign.id}
          surfaces={campaign.surfaces}
          slots={campaign.slots as unknown as DraftSlot[]}
          onSave={async (slots) => {
            const res = await saveSlotsAction(campaign.id, JSON.stringify(slots));
            if (res && "error" in res && res.error) {
              return { error: res.error };
            }
            if (res && "slots" in res && Array.isArray(res.slots)) {
              return { ok: true, slots: res.slots as unknown as DraftSlot[] };
            }
            return { ok: true };
          }}
        />
      ) : (
        <ArenaKnobs
          campaignId={campaign.id}
          config={config}
          slots={campaign.slots}
          surfaces={campaign.surfaces}
        />
      )}

      <form
        className="border border-line p-4"
        action={async (fd) => {
          await saveVetoAction(campaign.id, String(fd.get("veto") ?? ""));
        }}
      >
        <h2 className="text-xl">Brand veto list</h2>
        <p className="text-sm text-muted">Comma-separated names to auto-block (competitors, NSFW, politics).</p>
        <input name="veto" defaultValue={veto} className="mt-2 w-full bg-ink p-2" />
        <button className="mt-3 border border-line px-3 py-2">Save veto</button>
      </form>
    </main>
  );
}

function ArenaKnobs({
  campaignId,
  config,
  slots,
  surfaces,
}: {
  campaignId: string;
  config: ArenaConfig;
  slots: Slot[];
  surfaces: Surface[];
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        className="space-y-3 border border-line p-4"
        action={async (fd) => {
          const next: ArenaConfig = {
            ...config,
            theme: String(fd.get("theme")) as ArenaConfig["theme"],
            soundtrack: fd.get("soundtrack") === "on",
            reducedMotion: fd.get("reducedMotion") === "on",
            showGrid: fd.get("showGrid") === "on",
            showTicker: fd.get("showTicker") === "on",
            markerStyle: String(fd.get("markerStyle")) as ArenaConfig["markerStyle"],
            maxDecalCm: Number(fd.get("maxDecalCm")) as 20 | 32,
            startCamera: String(fd.get("startCamera")) as ArenaConfig["startCamera"],
            rewindEnabled: fd.get("rewindEnabled") === "on",
            inSceneVideoUrl: String(fd.get("inSceneVideoUrl") ?? "") || undefined,
            soundtrackMutedMobile: true,
            showHdri: fd.get("showHdri") === "on",
          };
          await saveArenaConfigAction(campaignId, JSON.stringify(next));
        }}
      >
        <h2 className="text-xl">Arena knobs</h2>
        <label className="block text-xs text-muted">Theme</label>
        <select name="theme" defaultValue={config.theme} className="w-full bg-ink p-2">
          <option value="grid">Default grid</option>
          <option value="ares">Ares</option>
          <option value="studio">Photo studio</option>
          <option value="neon">Neon tunnel</option>
          <option value="none">None</option>
        </select>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="soundtrack" defaultChecked={config.soundtrack} /> Soundtrack</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="reducedMotion" defaultChecked={config.reducedMotion} /> Reduced motion (no auto-rotate)</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="showGrid" defaultChecked={config.showGrid} /> Show grid</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="showHdri" defaultChecked={config.showHdri} /> HDRI</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="showTicker" defaultChecked={config.showTicker} /> Visitor ticker</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="rewindEnabled" defaultChecked={config.rewindEnabled} /> Rewind</label>
        <label className="block text-xs text-muted">Marker</label>
        <select name="markerStyle" defaultValue={config.markerStyle} className="w-full bg-ink p-2">
          <option value="filled">Filled decal</option>
          <option value="outline">Outline</option>
        </select>
        <label className="block text-xs text-muted">Max decal</label>
        <select name="maxDecalCm" defaultValue={config.maxDecalCm} className="w-full bg-ink p-2">
          <option value={20}>HYROX 20 cm² arm</option>
          <option value={32}>HYROX 32 cm² chest/leg</option>
        </select>
        <label className="block text-xs text-muted">Start camera</label>
        <select name="startCamera" defaultValue={config.startCamera} className="w-full bg-ink p-2">
          <option value="front">Front</option>
          <option value="back">Back</option>
          <option value="threeQuarter">3/4</option>
        </select>
        <label className="block text-xs text-muted">In-scene video URL</label>
        <input name="inSceneVideoUrl" defaultValue={config.inSceneVideoUrl} className="w-full bg-ink p-2" />
        <button className="bg-accent px-4 py-2 text-ink">Save arena</button>
      </form>
      <BodyPanel campaignId={campaignId} slots={slots} surfaces={surfaces} />
      <form
        className="border border-line p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const file = (e.currentTarget.elements.namedItem("audio") as HTMLInputElement).files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("file", file);
          fd.set("kind", "audio");
          const up = await fetch("/api/uploads", { method: "POST", body: fd }).then((r) => r.json());
          await saveSoundtrackAction(campaignId, up.key);
          window.location.reload();
        }}
      >
        <h2 className="text-xl">Soundtrack loop</h2>
        <p className="text-sm text-muted">Optional MP3. Muted by default on mobile.</p>
        <input name="audio" type="file" accept="audio/mpeg,audio/mp3,audio/wav" />
        <button className="mt-3 border border-line px-3 py-2">Upload loop</button>
      </form>
    </div>
  );
}

type IngestStep = "idle" | "downloading" | "uploading" | "attaching" | "done";

/** The arena body: Avaturn avatar built from the creator's selfies, or a hand-uploaded GLB, else the procedural mannequin. */
function BodyPanel({ campaignId, slots, surfaces }: { campaignId: string; slots: Slot[]; surfaces: Surface[] }) {
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState<IngestStep>("idle");
  const [error, setError] = useState<string | null>(null);
  // Kept so a failed upload can be retried without re-scanning (the export URL is short-lived, but not that short).
  const [lastExport, setLastExport] = useState<ExportAvatarResult | null>(null);

  const glbs = surfaces.filter((s) => s.kind === "glb" && !s.objectKey.startsWith("procedural:"));
  const body = glbs[glbs.length - 1];
  const meta = body && isAvatarMeta(body.meta) ? body.meta : null;
  const bodyLabel = !body
    ? "Procedural mannequin"
    : meta?.source === "avaturn"
      ? `Avaturn avatar · ${meta.gender ?? "?"} · ${meta.bodyId ?? "body"}${meta.supportsFaceAnimations ? " · face rig" : ""}`
      : "Custom GLB";

  const busy = step !== "idle" && step !== "done";

  async function ingest(result: ExportAvatarResult) {
    setError(null);
    setLastExport(result);
    try {
      setStep("downloading");
      const file = await avatarExportToFile(result);
      setStep("uploading");
      const { key } = await uploadAvatarFile(file);
      setStep("attaching");
      await attachBodySurface(campaignId, key, avatarMetaFromExport(result));
      setStep("done");
      window.location.reload();
    } catch (err) {
      setStep("idle");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4 border border-line p-4 lg:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl">Body</h2>
          <p className="text-sm text-muted">Current: {bodyLabel}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          className="bg-accent px-4 py-2 font-medium text-ink disabled:opacity-50"
          onClick={() => {
            setError(null);
            setScanning((v) => !v);
          }}
        >
          {scanning ? "Close scanner" : body && meta?.source === "avaturn" ? "Re-scan avatar" : "Create avatar from selfie"}
        </button>
      </div>

      {scanning && !busy && (
        <>
          <p className="text-sm text-muted">
            Sign in to Avaturn inside the frame, scan your face (front + both sides), pick a body and outfit, then press <strong>Next</strong>.
            The exported avatar is stored on this server and attached as the arena body.
          </p>
          <AvaturnEmbed onExport={ingest} onError={(e) => setError(`${e.type}${e.message ? `: ${e.message}` : ""}`)} />
        </>
      )}

      {busy && (
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-accent">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
          {step === "downloading" ? "Downloading avatar from Avaturn…" : step === "uploading" ? "Uploading to BodyTag…" : "Attaching to arena…"}
        </p>
      )}
      {error && (
        <p className="flex flex-wrap items-center gap-3 text-sm text-red-400">
          {error}
          {lastExport && !busy && (
            <button type="button" className="border border-line px-2 py-1 text-xs text-paper" onClick={() => ingest(lastExport)}>
              Retry upload
            </button>
          )}
        </p>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Upload a GLB instead</summary>
        <form
          className="mt-2 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const file = (e.currentTarget.elements.namedItem("glb") as HTMLInputElement).files?.[0];
            if (!file) return;
            setError(null);
            try {
              setStep("uploading");
              const fd = new FormData();
              fd.set("file", file);
              fd.set("kind", "glb");
              const up = (await fetch("/api/uploads", { method: "POST", body: fd }).then((r) => r.json())) as { key?: string; error?: string };
              if (!up.key) throw new Error(up.error ?? "Upload failed");
              setStep("attaching");
              await attachBodySurface(campaignId, up.key, { source: "upload" });
              window.location.reload();
            } catch (err) {
              setStep("idle");
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          <p className="text-muted">Single-file .glb with embedded textures, up to 8 MB. Draco-compressed files are not decoded yet.</p>
          <input name="glb" type="file" accept=".glb" />
          <button disabled={busy} className="border border-line px-3 py-2 disabled:opacity-50">Replace mesh</button>
        </form>
      </details>

      <ul className="text-sm text-muted">
        {slots.map((s) => (
          <li key={s.id}>
            {s.name} · {formatMoney(s.startPriceCents)}
          </li>
        ))}
      </ul>
    </div>
  );
}
