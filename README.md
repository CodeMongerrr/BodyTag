# BodyTag

Open-source engine for **walking-billboard** sponsorship campaigns. A creator maps numbered ad slots onto photos or a 3D arena, publishes a live URL, and brands buy / take over those slots. Same mechanic as [hyrox.marclou.com](https://hyrox.marclou.com) and [token2049.vanshu.fun](https://token2049.vanshu.fun), as a Shopify-like product anyone can run.

## License and hosted cut

- Code: **AGPL-3.0-or-later**. The name **BodyTag** is trademarked; see [TRADEMARK.md](TRADEMARK.md).
- **Self-host:** `HOSTED_FEE_BPS=0`. You pay your own Postgres, Redis, CDN, and workers. BodyTag takes nothing.
- **Official hosted instance:** `HOSTED_FEE_BPS=100` (1.00% of **winning GMV**). That 1% is taken from the creator **Stake** after event proof. Leftover Stake is refunded. Arena hosting and image generation are **not billed**.

Stake is a **prepaid hosted-service margin**, not escrow of brand bid money. Brands pay the **creator's** processor (Dodo / Stripe / Razorpay). See [docs/dodo-compliance.md](docs/dodo-compliance.md).

## Repo

```
apps/web              Next.js storefront + creator admin
apps/worker-images    OG / story / square / print composites
apps/worker-realtime  Redis fan-out health + metrics
packages/db           Prisma schema + seed
packages/shared       Money, Stake math, image helpers
infra/k8s             Hosted manifests (HPA, health)
```

## Quick start (self-host)

```bash
cp .env.example .env
docker compose up -d postgres redis minio minio-init
pnpm install
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev
```

Demo login: `mara@demo.bodytag` / `demo1234`.

Deposit Stake, publish `/@mara/hyrox-mumbai` or `/@mara/arena-demo`. Brand checkout in mock mode is an overlay on the live URL (never tweet a processor checkout link).

To preview the **hosted 1%** flow locally:

```bash
HOSTED_FEE_BPS=100 REQUIRE_STAKE=true pnpm dev
```

## What v1 includes

- Photo overlay storefront (front/back, named tiers, doubling takeover, wallet-first refunds)
- 3D arena (orbit, click-to-focus, themes, audio, rewind, ticker, accessible slot list)
- Image module (OG 1200×630, square, story, print PNG, slot crops)
- Live URLs `/@handle/slug`, short links `/s/:code`, preview `/preview/:secret`
- Stake ledger, margin pause, 1% capture, leftover refund
- KYC ladder, report/pause, legal pack, help center, tickets
- `/healthz` + `/readyz`, circuit breaker on bids, Compose + Fly/K8s notes

## Payments

`PAYMENT_PROVIDER=mock` for OSS demos. Point `DodoAdapter` at test keys when you are ready; email Dodo using the copy in `docs/dodo-compliance.md` **before** live money. Never describe Stake as escrow in underwriting forms.
