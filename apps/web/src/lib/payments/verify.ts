export type PaidFacts = { totalAmount: unknown; currency: unknown };
export type ExpectedBid = { amountCents: number; currency: string };

export type PaymentCheck =
  | { ok: true; converted: boolean }
  | { ok: false; reason: "invalid_amount" | "underpaid" };

/**
 * Defence in depth before a webhook settles a bid. Dodo's `total_amount` is in the payment currency's minor units and
 * includes tax, so it must be at least the bid amount. If Dodo converted the price (adaptive pricing shows e.g. INR for
 * UPI), the currencies differ and the amounts cannot be compared locally; that case is accepted but reported.
 */
export function checkPaymentCoversBid(paid: PaidFacts, bid: ExpectedBid): PaymentCheck {
  const total = paid.totalAmount;
  if (typeof total !== "number" || !Number.isInteger(total) || total <= 0) return { ok: false, reason: "invalid_amount" };
  const currency = typeof paid.currency === "string" ? paid.currency.toUpperCase() : "";
  if (currency && currency !== bid.currency.toUpperCase()) return { ok: true, converted: true };
  if (total < bid.amountCents) return { ok: false, reason: "underpaid" };
  return { ok: true, converted: false };
}
