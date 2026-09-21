export function publicFileUrl(key: string) {
  if (key.startsWith("procedural:")) return "";
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}
