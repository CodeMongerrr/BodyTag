import { appConfig } from "../config";
import type { BidCheckoutInput, Money, PaymentAdapter } from "./adapter";
import { MockAdapter } from "./mock";

function getDodoBaseUrl(): string {
  const env = (appConfig.dodoEnv || "").toLowerCase();
  if (env === "live_mode" || env === "live" || env === "production" || env === "prod") {
    return "https://live.dodopayments.com";
  }
  return "https://test.dodopayments.com";
}

/**
 * Creator-owned Dodo account. BodyTag never settles brand bids on the platform MoR.
 * Stake top-ups on the official hosted instance may use the platform Dodo keys separately.
 */
export class DodoAdapter implements PaymentAdapter {
  private fallback = new MockAdapter();

  private get baseUrl() {
    return getDodoBaseUrl();
  }

  private headers() {
    return {
      Authorization: `Bearer ${appConfig.dodoApiKey}`,
      "Content-Type": "application/json",
    };
  }

  async createBidCheckout(input: BidCheckoutInput) {
    if (!appConfig.dodoApiKey) return this.fallback.createBidCheckout(input);
    const res = await fetch(`${this.baseUrl}/checkouts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        product_cart: [
          {
            product_id: "pwyw_sponsorship_slot",
            quantity: 1,
            amount: input.amountCents,
          },
        ],
        customer: { email: input.brandEmail },
        return_url: input.returnUrl,
        metadata: {
          campaign_id: input.campaignId,
          slot_id: input.slotId,
          bid_id: input.bidId,
          expected_price: String(input.expectedPriceCents),
          brand_email: input.brandEmail,
        },
        allowed_payment_method_types: ["credit", "debit"],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Dodo checkout failed: ${text}`);
    }
    const json = (await res.json()) as { checkout_url?: string; session_id?: string };
    return {
      checkoutUrl: json.checkout_url ?? "",
      sessionId: json.session_id ?? `dodo_${input.bidId}`,
    };
  }

  async refund(paymentId: string, reason: string) {
    if (!appConfig.dodoApiKey) return this.fallback.refund(paymentId, reason);
    await fetch(`${this.baseUrl}/refunds`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ payment_id: paymentId, reason }),
    });
  }

  async creditWallet(customerId: string, amount: Money) {
    return this.fallback.creditWallet(customerId, amount);
  }

  async debitWallet(customerId: string, amount: Money) {
    return this.fallback.debitWallet(customerId, amount);
  }

  async walletBalance(customerId: string) {
    return this.fallback.walletBalance(customerId);
  }
}
