# Launch compliance matrix: US · EU · India · UAE

Researched 2026-10-11. This is engineering research, **not legal advice**. Have counsel review the Terms, Privacy notice, Refund policy and Content policy before live money moves.

## 1. Verdict on Dodo Payments

Dodo is a reasonable fit for **creator-direct sales of a digital advertising placement**. It is **not** safe to go live on the current code or the current description of the product. Three things conflict with Dodo's published policy or with our own legal text.

| # | Blocker | Evidence | What to do |
| --- | --- | --- | --- |
| B1 | Brand bids settle on the **platform's** Dodo key, not the creator's | `lib/payments/dodo.ts` uses `DODO_API_KEY`; `User.processorSecret` is never read | Wire per-creator credentials (encrypted at rest) or change the model and tell Dodo. A guard now blocks live-mode bid checkout unless `ALLOW_PLATFORM_COLLECTED_BIDS=true` |
| B2 | **Stored value**: takeover credits (`Wallet`) and Stake refunds | Dodo's Merchant Acceptance Policy lists escrow, "stored value, lending, or managing funds" as unsupported | Get Dodo's written approval of the credit and Stake mechanics, or change them (refund to original payment; Dodo-native credits for Stake). Separately ask counsel about money-transmission and prepaid rules (US states, EU EMD2, India RBI PPI, CBUAE SVF); closed-loop credits are often exempt, but confirm |
| B3 | **Stake is never charged** | `depositStake` only increments a DB counter; `captureAndRefundStake` credits a ledger | Build a real Stake checkout and refund before relying on the 1% fee |
| B4 | **Verification is a mock** | `submitKyc` always approves and sets `verified` from a client-supplied flag | Integrate Persona/Didit, or stop showing a "verified" badge (misleading-claims exposure in all four regions) |
| B5 | The brand's value is partly a **physical performance** | Creator wears the logo at an event | Disclose to Dodo up front (the underwriting email now does). Dodo allows digital products only; expect a possible decline and keep a fallback processor |
| B6 | Disputes and refunds are not handled | Webhook acts only on `payment.succeeded`; SDK defines `dispute.*`, `refund.*` | Handle `dispute.opened/lost`, `refund.succeeded/failed` (pause or flag the slot, reconcile ledgers) |
| B7 | Privacy promises have no jobs behind them | No retention or deletion tooling | Implement the retention table in `/privacy` and a data-request process |
| B8 | Operator identity unset | `LEGAL_ENTITY_*`, `GRIEVANCE_OFFICER_*`, `EU_REPRESENTATIVE` | Set them; unset values render as visible `[placeholders]` |

### What was verified, and how

- **From Dodo's official SDK** (`dodopayments` 2.54.2 on npm; type definitions read directly): the payment-method list, that `allowed_payment_method_types` is a hard allowlist ("customers will never see payment methods that are not in this list", always include `credit` and `debit`), that `billing_currency` only works with adaptive pricing, the webhook event list, and the payment payload fields. AED, INR, EUR, USD and GBP are supported currencies.
- **From Dodo's policy pages, via search results** (the sandbox blocks `dodopayments.com`, so these were not fetched in full): digital products only; escrow and stored value unsupported; physical goods, adult, gambling, crypto exchanges and unlicensed money transmission prohibited; service work sold as "digital" must be productized; restricted countries include Belarus, Cuba, Iran, North Korea, Russia, Syria and Venezuela; UPI appears only when billing country is India and currency is INR, and a non-Indian merchant needs adaptive currency for it.
- **Not verified, check before launch:** whether **India** and the **UAE** are on Dodo's accepted merchant-country list (`docs.dodopayments.com/miscellaneous/accepted-countries-and-territories`; KYC documents must be issued in a listed country), Dodo's refund window and dispute fees, and its PCI DSS attestation (ask for the AOC). Also confirm each creator can pass Dodo's own onboarding.

## 2. Payment modes at launch (via Dodo)

Set by `DODO_PAYMENT_METHODS` (default in `lib/payments/methods.ts`). Dodo shows a method only if it is allowed here **and** available for the customer's location, currency and device.

| Region | Currency | Launch methods | Notes |
| --- | --- | --- | --- |
| US | USD | Cards, Apple Pay, Google Pay | ACH (slow, reversible), Cash App and BNPL deferred |
| EU | EUR | Cards, Apple Pay, Google Pay, iDEAL (NL), Bancontact (BE), EPS (AT), Przelewy24 and BLIK (PL) | SEPA debit and bank transfer excluded: bids confirm on `payment.succeeded` and prices double, so late failures would unwind a live slot. Cards need SCA/3DS (Dodo handles it) |
| India | INR | UPI (collect, intent), cards incl. RuPay, Google Pay | Needs an INR price or adaptive currency; minimum ₹1. `billing_currency` is deliberately **not** forced to USD, which would hide UPI |
| UAE | AED | Cards, Apple Pay, Google Pay | No UAE-specific method in Dodo's list |
| None yet | | Crypto/stablecoin, BNPL (Klarna, Affirm, Afterpay), PayPal, cash vouchers | UAE's Payment Token Services Regulation bars foreign payment tokens for goods and services onshore |

## 3. Regional checklist

**US.** No sale or sharing of personal data (stated in Privacy). Biometric laws (Illinois BIPA, Texas, Washington) reach face-geometry data: consent gate added before the avatar editor; add a written retention schedule and decide with counsel whether to allow Illinois at launch. Register a **DMCA designated agent** for safe harbor. FTC endorsement disclosure is a creator duty in the Terms. Sales tax is Dodo's job as merchant of record; confirm. Keep the takeover a fixed-price buyout, never a game of chance.

**EU.** GDPR notice, legal bases and rights are in Privacy; sign Data Processing Agreements and Standard Contractual Clauses with processors, appoint an Article 27 representative if there is no EU establishment, and consider a DPIA for face-derived data. Only one essential cookie today; add a consent banner before adding analytics or chat. Consumer withdrawal rights: sales are business-only with a checkbox; if consumers are ever allowed, add express consent and acknowledgement at checkout. DSA: contact point, report form and statements of reasons are covered; confirm trader-traceability duties with counsel. P2B Regulation: 15 days' notice of changes (done). Political advertising is banned (EU Reg. 2024/900). Enable `allow_tax_id` on checkout so businesses can give a VAT ID. Check AI Act synthetic-likeness labelling for avatars.

**India.** DPDP Rules 2025 were notified in November 2025 with phased commencement; core duties apply from about **13 May 2027**, so build for them now (notice, consent, grievance officer, erasure, breach notice). IT Rules 2021: grievance officer with 24-hour acknowledgement and 15-day resolution, and takedown on order. E-Commerce Rules 2020 and the 2023 dark-pattern guidelines: be careful with countdown or "last chance" urgency on takeovers. GST on digital services is Dodo's job; collect a GSTIN for B2B. The Online Gaming Act 2025 bans real-money games: keep betting vocabulary out. Use ASCI-style sponsorship disclosure.

**UAE.** The UAE Media Council **Advertiser Permit** became mandatory on 1 February 2026 for people who make promotional content (press reports; penalties are reported inconsistently, from AED 10,000 to AED 1 million, so verify with the Council). It is now a creator duty in the Terms; consider collecting the permit number for UAE creators. Content standards bar religion, state and public-morals content; alcohol, gambling and crypto promotion are blocked on hosted. PDPL requires consent for sensitive data (done for avatars); confirm the status of its executive regulations. VAT is 5%, handled by the merchant of record.

## 4. Changed in this repo

- Rewrote `/terms`, `/privacy`, `/refund-policy`, `/content-policy` to match what the product does; added versioning and a visible operator block.
- Terms acceptance: sign-up checkbox (recorded on `User.termsAcceptedAt/termsVersion`), business-purchase checkbox on bids (version sent to Dodo as `terms_version` metadata, enforced server-side), consent gate before the avatar editor.
- Dodo: payment-method allowlist per region; refuse live-mode bid checkout on the platform key; webhook now checks amount and currency before settling a bid (`lib/payments/verify.ts`).
- `docs/dodo-compliance.md` rewritten so the underwriting copy matches reality.

Apply the schema change with `pnpm db:push` (two nullable columns on `User`).
