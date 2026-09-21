# Dodo Payments — underwriting copy (not escrow)

BodyTag must **not** be submitted to Dodo (or Stripe) as a marketplace, crowdfund, casino, crypto platform, or escrow.

Use this language in merchant forms, product descriptions, and support replies.

## What BodyTag sells through a Merchant of Record

**Digital advertising placement** on a BodyTag-hosted campaign page: logo, tagline, link, optional QR, and live view counts. Delivery is immediate on `payment.succeeded`.

The creator's physical wear (temporary tattoo, dress print, walking the event) is a **BodyTag Terms obligation fulfilled by the creator**, not a SKU the MoR resells. Do not list tattoos, dresses, tickets, or event entry as Dodo products.

## Who charges whom

1. **Brand bids** settle on the **creator's** processor account (Dodo / Stripe / Razorpay keys the creator connects). BodyTag never takes bid principal and never forwards brand money to creators.
2. **Official hosted fee only:** the creator deposits a **Stake** — prepaid credit for using BodyTag's hosted software (live URL, arena, image generation, SSE). At campaign close + event proof, BodyTag captures `1% of winning GMV` from that Stake and **refunds the remainder**. There is no extra charge for arena bandwidth or image jobs.
3. **Self-host:** `HOSTED_FEE_BPS=0`. No Stake required.

## Words to use vs avoid

| Use | Do not use |
| --- | --- |
| Purchase, takeover, buyout, refund | Bet, wager, prize, jackpot |
| Numbered advertising slot | Lottery, raffle, pool |
| Stake, fulfillment bond, prepaid hosted-service margin | Escrow, holding brand funds |
| Target total (optional policy copy) | Crowdfund, all-or-nothing Kickstarter, "fund my trip" |
| Digital sponsorship on a hosted page | Physical goods, in-person services as the SKU |
| Optional stablecoin as a payment method | Crypto business, token, marketplace |

Dodo lists **escrow** as unsupported. Public UI may say "Stake". Processor forms must say **prepaid hosted-service margin**.

## Auction mechanics (risk)

Do not card-charge and card-refund every takeover. Use **wallet-first**: credit the outbid brand's ledger; card refund only on withdraw or 30-day idle. Overlay checkout sessions are ephemeral — never tweet them. Confirm bids only on `payment.succeeded`.

Auction windows must close so refunds finish inside the processor's 30-day window.

## Product copy for a Dodo PWYW item (Stake top-up, hosted only)

> Prepaid BodyTag hosted-service credit. Applied as a 1% software margin on your campaign's winning advertising volume. Unused credit is refunded after the campaign. Does not hold sponsor bid funds.

## Email to Dodo compliance (send before live money)

Subject: BodyTag — digital ad slots + prepaid hosted margin (not marketplace/escrow)

Body:

> We operate open-source software that creators can self-host. On our official hosted instance, creators sell numbered digital advertising slots on a page we host. Brands pay the creator directly on the creator's own merchant account. BodyTag does not collect or forward those bids.
>
> Separately, hosted creators prepay a Stake. After the campaign, we invoice 1% of winning slot volume against that prepaid credit and refund the rest. Stake is not escrow of customer (brand) funds.
>
> Physical wear at events is a creator obligation in our Terms, not a Dodo SKU. We prohibit adult, hate, and impersonation content. Auctions are buy/replace contracts, not games of chance.

Keep a copy of this file in the merchant application attachments.
