// Bindings declared in wrangler.jsonc.
interface Env {
  R2: R2Bucket;
  HYPERDRIVE: Hyperdrive;
}

// wrangler bundles .wasm as a compiled module (built-in rule) and .ttf as raw bytes (rules[] in wrangler.jsonc).
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}

declare module "*.ttf" {
  const data: ArrayBuffer;
  export default data;
}
