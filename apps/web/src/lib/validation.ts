const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string) {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/** Keys produced by /api/uploads for brand logos: `logo/<userFolder>/<nanoid>.<ext>`. */
const LOGO_KEY_RE = /^logo\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/;

export function isLogoKey(key: string) {
  return LOGO_KEY_RE.test(key);
}

/** Positive 32-bit integer (all money columns are Postgres INT). */
export function isPositiveInt32(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 2_147_483_647;
}

/** Cheap magic-byte sniffing so a renamed file cannot poison sharp composites later. */
export function sniffImage(buf: Uint8Array): "png" | "jpeg" | "webp" | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}
