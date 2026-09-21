// Stands in for `sharp` in the Cloudflare Workers bundle. Nothing on the hosted path calls it: the image
// pipeline runs in apps/worker-images-cf (resvg-wasm) and Node self-hosts get the real package.
export default function sharp(): never {
  throw new Error("sharp is not available on Cloudflare Workers; images are rendered by worker-images-cf");
}
