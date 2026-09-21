# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Creators (primary, homepage-led):** event organizers/hosts who map numbered ad slots onto a photo (front/back) or a 3D "arena" render of a body/walking-billboard surface, publish a live campaign URL, and monetize sponsorships at their event (races, conferences, meetups).
- **Brands/sponsors (secondary):** buy a numbered slot outright or take it over from the current sponsor (paying a multiple of the listed price); the previous sponsor is credited to a wallet, not card-refunded. They transact via checkout overlaid on the creator's live URL, not the homepage.

## Product Purpose

BodyTag is a campaign engine for selling "walking billboard" ad placements — sponsor logos/ads mapped onto numbered slots on a person or surface worn/displayed at a live event. A creator publishes a live auction URL; brands buy or take over slots. Success looks like: creators can launch a monetized, credible campaign quickly; brands get verifiable, high-visibility event placement; and the marketplace stays clean via QA/moderation so the format isn't misused (impersonation, scams, prohibited content).

## Positioning

A managed marketplace + live auction engine purpose-built for walking-billboard/body-surface sponsorships at events — the same "numbered slot, pay-to-take-over" mechanic used by one-off campaigns (e.g. hyrox.marclou.com, token2049.vanshu.fun), productized, QA'd, and offered as a hosted platform. An open-source, self-hostable core exists underneath but is a secondary/technical-buyer fact, not the headline pitch (confirmed: downplay OSS/self-host framing on the public marketing site; keep it truthful in footer/docs).

## Operating Context

- Live, time-boxed event campaigns where a creator wears/displays numbered ad slots.
- Two surface types: photo overlay (front/back) and an orbitable 3D "arena" render.
- Bidding/takeover mechanic: a brand pays the listed price, or pays a multiple to take over an already-sold slot; the outbid sponsor is credited to a wallet.
- Creator dashboard: campaign builder, KYC ladder, Stake ledger (hosted plan only), print-pack export (zip of logos + placement diagram), support tickets.
- Content policy / QA moderation to prevent misuse — report/pause flow with published response SLAs.
- Live URLs (`/@handle/slug`), short links, secret preview links.
- Payments run through the creator's own payment processor; the hosted plan's "Stake" is a prepaid service margin, not escrow of brand money.

## Capabilities and Constraints

- Self-hostable (AGPL-3.0-or-later; "BodyTag" name is trademarked) at 0% platform fee; the official hosted plan takes a percentage of winning campaign volume from the creator's Stake. This must stay factually accurate but, per product direction, does not lead the public homepage — it lives in the footer/docs for technical buyers.
- A mock/demo payment mode exists for OSS/demo use; production uses real processor adapters (creator's own account).
- Web only; no native mobile app.
- No existing logo/brand asset file at project start — brand mark is a typography-led wordmark (plus optional simple glyph) designed in code, confirmed with the user rather than assumed.

## Brand Commitments

- Name: **BodyTag** (trademarked) — keep as-is.
- Prior tagline "Shopify for walking billboards" is descriptive copy, not a locked brand asset — open to revision as part of the rebrand.

## Evidence on Hand

- Demo/seed campaigns only (e.g. `/@mara/hyrox-mumbai`, `/@mara/arena-demo`) — internal seed data, not real customer case studies. No real testimonials, press mentions, or client logos exist; future work must not fabricate them or present demo data as customer proof.

## Product Principles

1. Creator-led, still two-sided: the homepage sells the ability to launch and monetize a campaign; brand/bidder value is present but secondary, not the hero.
2. Trust and safety are a differentiator, not fine print: QA/moderation, KYC, and content policy read as deliberate product features because misuse risk is an explicitly named concern.
3. Commercial-platform framing over dev-tool framing: open-source/self-host facts stay true and reachable but never lead the pitch.
4. Never overstate: no invented metrics, logos, or testimonials; fee/pricing language must match the real model (hosted plan takes a cut of winning volume via Stake, self-host is free).
