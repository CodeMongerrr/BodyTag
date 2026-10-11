# Dodo Payments: underwriting copy

Use this in merchant forms and support replies. The rule is simple: **describe the product as it works.** Dodo's Merchant Acceptance Policy excludes escrow and "anything involving stored value, lending, or managing funds", and its prohibited list covers marketplaces that hold funds, physical goods, adult, gambling and crypto exchanges. If a mechanic touches one of those, say so and ask Dodo, rather than choosing words that avoid the label. A processor that finds a mismatch later can freeze funds.

See [compliance/launch-matrix.md](compliance/launch-matrix.md) for the open blockers. Until B1 to B3 there are closed, do not enable live money.

## What is sold

**A digital advertising placement** on a BodyTag-hosted campaign page: logo, tagline, link, optional QR, and live view counts. Delivery is immediate on `payment.succeeded`.

**The physical element, disclosed.** The creator separately promises, in the BodyTag Terms, to wear or display the sponsor at an event. That is a creator obligation, not a Dodo product, and brands know it is the reason the placement has value. Do not list tattoos, garments, tickets or event entry as Dodo products, and do not tell Dodo the physical element does not exist.

## Who charges whom (target design)

1. **Brand bids** are charged on the **creator's own** Dodo account. BodyTag does not take bid principal or forward it to creators. *Not yet implemented: the code uses one platform key (blocker B1).*
2. **Hosted fee:** the creator pays a **Stake**, prepaid credit for BodyTag's hosted software. At close, BodyTag takes 1% of winning value and returns the rest. *Not yet implemented: no money moves today (blocker B3).*
3. **Self-host:** `HOSTED_FEE_BPS=0`. No Stake.

## Mechanics Dodo must be told about

| Mechanic | What happens | Why it matters |
| --- | --- | --- |
| Takeover at 2× | A new purchase replaces the previous holder, who gets a credit equal to what they paid | Many refunds or credits on one slot; a chargeback and refund-ratio risk |
| Takeover credit | A ledger balance (`Wallet`) applied to the next purchase, or refunded to the original payment method on request or after 30 idle days | This is closed-loop stored value. Ask whether it is acceptable |
| Stake | Prepaid, refundable credit that only covers our fee, never used to pay brands | Prepaid refundable balance. Ask whether it is acceptable, or use Dodo's own credits product |
| Physical wear | Creator obligation under the Terms | Dodo supports digital products only |
| Auction | Fixed 2× price steps, no chance element, no prize | Not gambling; keep betting vocabulary out of the product |

Auction windows must close so refunds finish inside the processor's refund window. Confirm bids only on `payment.succeeded`, and never share an overlay checkout link publicly.

## Product copy for a Dodo pay-what-you-want item (Stake top-up, hosted only)

> Prepaid BodyTag hosted-service credit. Applied as a 1% software fee on your campaign's winning advertising volume. Unused credit is refunded after the campaign. It is your own credit and is not used to pay sponsors.

## Email to Dodo compliance (send before live money)

Subject: BodyTag: digital ad slots, prepaid hosted fee, and credits (please confirm fit)

> We publish open-source software that creators can self-host. On our hosted instance, creators sell numbered digital advertising placements on a page we host. The creator also promises, in our Terms, to wear or display the sponsor at an event; that promise is not a product we ask you to sell.
>
> Brands pay the creator's own Dodo account. We do not collect or forward those payments. Prices rise 2× each time a placement is taken over; the previous holder receives a credit equal to what they paid, which they can apply to a later purchase or have refunded to their original payment method. There is no prize and no element of chance.
>
> Separately, hosted creators prepay a Stake (credit for our software). At close we take 1% of winning value from it and refund the rest. It is not held for brands and never pays their refunds.
>
> Please tell us (1) whether the credit and Stake mechanics fit your policy on stored value, (2) whether the physical-wear element is acceptable alongside the digital placement, and (3) whether creators in India and the UAE can be onboarded as merchants. We prohibit adult, gambling, hate, impersonation and crypto-exchange content. Keep a copy of this file with the application.

## Webhook security

`payment.succeeded` is signature-checked (HMAC over `id.timestamp.body`, 5-minute window) and now also checked for amount and currency before a bid settles. `dispute.*` and `refund.*` events open an operator ticket linked to the bid. Stake top-ups are charged through the Stake product and credited once per payment id. Still to do: automatic slot pause on `dispute.opened`, and reconciling any bid left in `intent` after an amount mismatch.
