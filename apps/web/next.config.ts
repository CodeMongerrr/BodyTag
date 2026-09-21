import path from "node:path";
import type { NextConfig } from "next";

// `pnpm cf:build` sets this: the Workers bundle must never reference native `sharp`, and must carry the
// Workers socket shim that `pg` loads at runtime (Next's file tracing only copies its Node stub).
const cfBuild = process.env.BODYTAG_BUILD_TARGET === "cloudflare";

const nextConfig: NextConfig = {
  // Monorepo root, so Turbopack and OpenNext agree on where the pnpm store and standalone output live.
  turbopack: {
    root: path.join(__dirname, "../.."),
    ...(cfBuild ? { resolveAlias: { sharp: "./src/lib/stubs/sharp.ts" } } : {}),
  },
  transpilePackages: ["@bodytag/db", "@bodytag/shared"],
  // @prisma/client stays external on both hosts: on Workers OpenNext/wrangler bundle it, which is what lets
  // Prisma's `.wasm` engine import become a real WebAssembly.Module (see lib/db.ts).
  serverExternalPackages: cfBuild ? ["ioredis", "bullmq", "@prisma/client"] : ["sharp", "ioredis", "bullmq", "@prisma/client"],
  ...(cfBuild
    ? { outputFileTracingIncludes: { "/**": ["../../node_modules/.pnpm/pg-cloudflare@*/node_modules/pg-cloudflare/**"] } }
    : {}),
  experimental: {
    // With a middleware/proxy present Next buffers request bodies and truncates at 10 MB by default;
    // Avaturn avatar exports are ~14 MB (see UPLOAD_RULES.avatar in api/uploads).
    proxyClientMaxBodySize: "42mb",
  },
  images: {
    remotePatterns: [{ protocol: "http", hostname: "localhost" }],
  },
};

export default nextConfig;
