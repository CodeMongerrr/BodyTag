// Payment methods offered at Dodo checkout. Dodo treats `allowed_payment_method_types` as a hard allowlist: customers
// never see a method that is not listed here, and Dodo advises always including `credit` and `debit` as a fallback.
//
// Launch set (US, EU, India, UAE): instant-settlement methods only. Delayed or reversible rails (ACH, SEPA debit, BACS,
// Multibanco, Boleto, cash vouchers) are left out because bids confirm on `payment.succeeded` and prices double on
// takeover, so a late failure would unwind a live slot. BNPL and crypto are also left out (see docs/compliance).
const LAUNCH_METHODS = [
  "credit",
  "debit",
  "apple_pay",
  "google_pay",
  "upi_collect", // India, INR only
  "upi_intent", // India, INR only
  "ideal", // NL
  "bancontact_card", // BE
  "eps", // AT
  "przelewy24", // PL
  "blik", // PL
] as const;

// Every value an operator may opt into via DODO_PAYMENT_METHODS. Anything else is dropped so a typo cannot break checkout.
const OPT_IN_METHODS = new Set<string>([...LAUNCH_METHODS, "samsung_pay", "amazon_pay", "cashapp", "paypal", "mb_way", "twint"]);

export function dodoPaymentMethods(envValue: string): string[] {
  const requested = envValue
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  const chosen = requested.length ? requested.filter((m) => OPT_IN_METHODS.has(m)) : [...LAUNCH_METHODS];
  return Array.from(new Set(["credit", "debit", ...chosen]));
}
