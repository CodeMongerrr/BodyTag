"use client";

import { useRef, useState } from "react";
import { publicFileUrl } from "@/lib/public-url";

type Rect = { x: number; y: number; w: number; h: number };
export type DraftSlot = {
  id?: string;
  surfaceId: string;
  name: string;
  startPriceCents: number;
  rect?: Rect;
  hyroxCm?: number;
  sizeNote?: string;
};

export function PhotoEditor({
  campaignId,
  surfaces,
  slots,
  onSave,
}: {
  campaignId: string;
  surfaces: { id: string; objectKey: string; label: string }[];
  slots: DraftSlot[];
  onSave: (slots: DraftSlot[]) => Promise<{ ok?: boolean; slots?: DraftSlot[]; error?: string } | void>;
}) {
  const [active, setActive] = useState(surfaces[0]?.id ?? "");
  const [drafts, setDrafts] = useState<DraftSlot[]>(slots);
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const surface = surfaces.find((s) => s.id === active);

  function pos(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  const handleDeleteSlot = (index: number) => {
    setDrafts((d) => d.filter((_, j) => j !== index));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Client-side deduplication: eliminate identical duplicate draft slots
      const seen = new Set<string>();
      const deduplicated: DraftSlot[] = [];
      for (const slot of drafts) {
        const key = slot.id
          ? `id:${slot.id}`
          : `rect:${slot.surfaceId}:${slot.rect ? `${slot.rect.x.toFixed(4)},${slot.rect.y.toFixed(4)},${slot.rect.w.toFixed(4)},${slot.rect.h.toFixed(4)}` : slot.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduplicated.push(slot);
        }
      }

      setDrafts(deduplicated);
      const res = await onSave(deduplicated);
      if (res && "slots" in res && Array.isArray(res.slots)) {
        setDrafts(res.slots as DraftSlot[]);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <div className="mb-3 flex gap-2">
          {surfaces.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={`border px-3 py-1 text-sm ${active === s.id ? "border-accent text-accent" : "border-line"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {surface && (
          <div
            ref={box}
            className="relative cursor-crosshair border border-line bg-panel"
            onPointerDown={(e) => {
              origin.current = pos(e);
              setDrawing({ x: origin.current.x, y: origin.current.y, w: 0, h: 0 });
            }}
            onPointerMove={(e) => {
              if (!origin.current) return;
              const p = pos(e);
              setDrawing({
                x: Math.min(origin.current.x, p.x),
                y: Math.min(origin.current.y, p.y),
                w: Math.abs(p.x - origin.current.x),
                h: Math.abs(p.y - origin.current.y),
              });
            }}
            onPointerUp={() => {
              if (drawing && drawing.w > 0.02 && drawing.h > 0.02) {
                setDrafts((d) => [
                  ...d,
                  {
                    surfaceId: active,
                    name: `Spot ${d.length + 1}`,
                    startPriceCents: 35000,
                    rect: drawing,
                    hyroxCm: 20,
                  },
                ]);
              }
              origin.current = null;
              setDrawing(null);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publicFileUrl(surface.objectKey)} alt={surface.label} className="block w-full select-none" />
            {drafts
              .filter((s) => s.surfaceId === active && s.rect)
              .map((s) => {
                const draftIndex = drafts.indexOf(s);
                return (
                  <div
                    key={s.id ?? draftIndex}
                    className="group absolute border-2 border-accent bg-accent/10"
                    style={{
                      left: `${s.rect!.x * 100}%`,
                      top: `${s.rect!.y * 100}%`,
                      width: `${s.rect!.w * 100}%`,
                      height: `${s.rect!.h * 100}%`,
                    }}
                  >
                    <div className="flex items-center justify-between bg-accent px-1">
                      <span className="truncate font-mono text-[10px] text-ink">{s.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSlot(draftIndex);
                        }}
                        className="ml-1 text-[11px] font-bold text-ink hover:text-red-700"
                        title={`Delete ${s.name}`}
                        aria-label={`Delete ${s.name}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            {drawing && (
              <div
                className="absolute border border-dashed border-paper"
                style={{
                  left: `${drawing.x * 100}%`,
                  top: `${drawing.y * 100}%`,
                  width: `${drawing.w * 100}%`,
                  height: `${drawing.h * 100}%`,
                }}
              />
            )}
          </div>
        )}
        <SurfaceUpload campaignId={campaignId} />
      </div>
      <div>
        <p className="text-sm text-muted">Drag on the photo to add a slot. Name it, price it, pick a HYROX size.</p>
        <ul className="mt-4 space-y-3">
          {drafts.map((s, i) => (
            <li key={s.id ?? i} className="border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  value={s.name}
                  onChange={(e) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className="w-full bg-ink p-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteSlot(i)}
                  className="border border-line px-2.5 py-1.5 text-xs text-muted hover:border-red-500 hover:text-red-400"
                  aria-label={`Delete ${s.name}`}
                >
                  Delete
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  value={s.startPriceCents / 100}
                  onChange={(e) =>
                    setDrafts((d) => d.map((x, j) => (j === i ? { ...x, startPriceCents: Math.round(Number(e.target.value) * 100) } : x)))
                  }
                  className="w-24 bg-ink p-2 text-sm"
                />
                <select
                  value={s.hyroxCm ?? 20}
                  onChange={(e) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, hyroxCm: Number(e.target.value) } : x)))}
                  className="bg-ink p-2 text-sm"
                >
                  <option value={20}>20 cm² arm</option>
                  <option value={32}>32 cm² chest/leg</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="mt-4 bg-accent px-4 py-2 font-medium text-ink disabled:opacity-50"
        >
          {saving ? "Saving slots..." : "Save slots"}
        </button>
      </div>
    </div>
  );
}

function SurfaceUpload({ campaignId }: { campaignId: string }) {
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
        const label = (form.elements.namedItem("label") as HTMLInputElement).value || "photo";
        if (!file) return;
        const fd = new FormData();
        fd.set("file", file);
        fd.set("kind", "photo");
        const up = await fetch("/api/uploads", { method: "POST", body: fd }).then((r) => r.json());
        await fetch(`/api/campaigns/${campaignId}/surfaces`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ objectKey: up.key, label, kind: "photo" }),
        });
        window.location.reload();
      }}
    >
      <div>
        <label className="block text-xs text-muted">Add photo (front/back/side)</label>
        <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required />
      </div>
      <input name="label" placeholder="front" className="border border-line bg-ink p-2" />
      <button className="border border-line px-3 py-2">Upload surface</button>
    </form>
  );
}
