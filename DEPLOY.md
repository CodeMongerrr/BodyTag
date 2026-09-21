# Deploy

## OSS / small self-host

`docker compose up --build` runs Postgres, Redis, MinIO, web, image worker, and realtime worker.

- Default `HOSTED_FEE_BPS=0` (no BodyTag cut).
- Caddy (optional): [infra/caddy/Caddyfile](../infra/caddy/Caddyfile) for TLS on your domain. Custom campaign CNAMEs are designed (`Host` header) but not shipped in v1.
- Storage: `STORAGE_DRIVER=s3` against MinIO, or `fs` with a persistent volume.
- Health: web `/healthz` (liveness) and `/readyz` (Postgres + Redis). Workers expose `:9091/healthz` and `:9092/healthz`. Compose `restart: unless-stopped` plus healthchecks is the self-healing loop.

If the image worker dies, the last cached PNG/GLB on MinIO/CDN still serves. The web app can lazily generate a missing variant on first GET so the live URL does not 404.

## Official hosted (you run this)

Suggested shape:

- **Fly.io** or Kubernetes on Hetzner/GKE: 2+ web machines, autoscale on CPU + connections.
- **Postgres:** Neon or self-managed + PgBouncer.
- **Redis:** Upstash or Sentinel (pub/sub + BullMQ).
- **Objects:** Cloudflare R2 + CDN. Compress GLBs (Draco). Screenshot fallback on mobile.
- **Workers:** separate process, concurrency cap, exponential backoff. Playwright 3D shots are optional and expensive; default is `sharp` + arena card.
- Set `HOSTED_FEE_BPS=100` and `REQUIRE_STAKE=true`.

Circuit breaker: bid/checkout **fails closed** when Dodo/Stripe is down; storefront GETs **fail open**.

Under load, shed rewind playback and in-scene video first. Keep the billboard (static GLB/PNG + slot list) on the CDN.

### Fly

See [infra/k8s](../infra/k8s) for the same topology expressed as Deployments + HPA. A minimal `fly.toml` for web:

```toml
app = "bodytag-web"
primary_region = "iad"

[http_service]
  internal_port = 3000
  force_https = true

  [http_service.http_options]
    idle_timeout = 60

[[http_service.checks]]
  interval = "10s"
  timeout = "2s"
  grace_period = "15s"
  method = "GET"
  path = "/readyz"

[env]
  HOSTED_FEE_BPS = "100"
  REQUIRE_STAKE = "true"
```

Scale: `fly scale count 2` and use Fly autoscale on connections. Run `worker-images` and `worker-realtime` as separate Fly apps with `--ha=true`.

### Kubernetes

Manifests in `infra/k8s/`:

- `web-deployment.yaml` — 2 replicas, liveness `/healthz`, readiness `/readyz`
- `web-hpa.yaml` — CPU 70% / connections via custom metrics if available
- `worker-images.yaml` — 1–N, restart on fail
- `worker-realtime.yaml`

Do not run GPU photogrammetry or multi-region active-active in v1. Single primary Postgres + CDN is enough.

## Cost notes (hosted, you eat these)

Arena + image generation are **$0 to creators**. Your bill is:

1. Egress of GLB + composites (R2/Bunny vs AWS)
2. Image worker CPU (`sharp` cheap, Playwright expensive)
3. SSE: one Redis subscription per campaign, then fan-out
4. Postgres IOPS on bid storms (`SELECT … FOR UPDATE` on slots)
5. Card fees on Stake top-ups only

A 60k-visitor / 48h campaign is mostly CDN if thumbs are cached. Always Draco-compress GLBs and serve a screenshot on mobile.

## Feature flags

| Variable | Self-host default | Hosted |
| --- | --- | --- |
| `HOSTED_FEE_BPS` | `0` | `100` |
| `REQUIRE_STAKE` | `false` | `true` |
| `ENABLE_MARKETPLACE_GRID` | `true` | `true` |
| `PAYMENT_PROVIDER` | `mock` | `dodo` |
| `STORAGE_DRIVER` | `fs` or `s3` | `s3` (R2) |
| `PLAYWRIGHT_SNAPSHOTS` | `false` | optional |
