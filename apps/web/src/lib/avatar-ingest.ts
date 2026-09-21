import type { ExportAvatarResult } from "@avaturn/sdk";
import type { AvatarMeta } from "@bodytag/shared";

/**
 * Client-side ingest of an Avaturn export into BodyTag storage.
 *
 * Avaturn's export URL is temporary (their API docs say not to persist it), and the export mode
 * (dataURL vs httpURL) is a per-project portal setting, so we always pull the bytes in the browser —
 * `fetch()` handles both `data:` and `https:` — and re-upload through /api/uploads. That keeps the
 * server free of any remote-fetch (SSRF) surface.
 */
/**
 * Shape-check the export payload: a base64 GLB data: URL or an https URL. The embed already drops SDK messages that
 * did not originate from an Avaturn origin, and the upload route validates the bytes, so the export host itself is
 * not pinned here (Avaturn does not document which storage host serves httpURL exports).
 */
export function isTrustedExport(result: ExportAvatarResult): boolean {
  if (typeof result.url !== "string" || typeof result.avatarId !== "string") return false;
  if (result.urlType !== "dataURL" && result.urlType !== "httpURL") return false;
  if (result.url.startsWith("data:")) return /^data:(model\/gltf-binary|application\/octet-stream);base64,/.test(result.url);
  try {
    return new URL(result.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function avatarExportToFile(result: ExportAvatarResult): Promise<File> {
  if (!isTrustedExport(result)) throw new Error("Unexpected export payload from the avatar editor");
  const res = await fetch(result.url);
  if (!res.ok) throw new Error(`Avatar download failed (${res.status})`);
  const blob = await res.blob();
  return new File([blob], `${result.avatarId || "avatar"}.glb`, { type: "model/gltf-binary" });
}

export function avatarMetaFromExport(result: ExportAvatarResult): AvatarMeta {
  return {
    source: "avaturn",
    avatarId: result.avatarId,
    sessionId: result.sessionId,
    gender: result.gender,
    bodyId: result.bodyId,
    supportsFaceAnimations: result.avatarSupportsFaceAnimations,
    rig: "mixamo_T",
    createdAt: new Date().toISOString(),
  };
}

export async function uploadAvatarFile(file: File): Promise<{ key: string }> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", "avatar");
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const body = (await res.json()) as { key?: string; error?: string };
  if (!res.ok || !body.key) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return { key: body.key };
}

export async function attachBodySurface(campaignId: string, objectKey: string, meta: AvatarMeta) {
  const res = await fetch(`/api/campaigns/${campaignId}/surfaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectKey, label: "body", kind: "glb", meta }),
  });
  const body = (await res.json()) as { id?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? `Attach failed (${res.status})`);
  return body;
}
