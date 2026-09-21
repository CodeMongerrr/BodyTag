export interface Env {
  R2: R2Bucket;
  DB: D1Database;
  PRESENCE: KVNamespace;
}

export default {
  async fetch(_req: Request, env: Env): Promise<Response> {
    return Response.json({
      ok: true,
      service: "bodytag-cloudflare",
      r2: Boolean(env.R2),
      d1: Boolean(env.DB),
      kv: Boolean(env.PRESENCE),
    });
  },
};
