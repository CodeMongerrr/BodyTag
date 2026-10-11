import { appConfig } from "../config";
import type { BidCheckoutInput, Money, PaymentAdapter, StakeCheckoutInput } from "./adapter";
import { dodoPaymentMethods } from "./methods";
import { MockAdapter } from "./mock";

function getDodoBaseUrl(): string {
  const env = (appConfig.dodoEnv || "").toLowerCase();
  if (env === "live_mode" || env === "live" || env === "production" || env === "prod") {
    return "https://live.dodopayments.com";
  }
  return "https://test.dodopayments.com";
}

type CheckoutSpec = {
  productId: string;
  amountCents: number;
  email: string;
  returnUrl: string;
  metadata: Record<string, string>;
};

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

  /** POST /checkouts for a pay-what-you-want product; `amount` is in minor units. */
  private async createCheckout(spec: CheckoutSpec): Promise<{ checkoutUrl: string; sessionId: string }> {
    if (!spec.productId) {
      throw new Error("Dodo product is not configured: set DODO_BID_PRODUCT_ID / DODO_STAKE_PRODUCT_ID.");
    }
    const res = await fetch(`${this.baseUrl}/checkouts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        product_cart: [{ product_id: spec.productId, quantity: 1, amount: spec.amountCents }],
        customer: { email: spec.email },
        return_url: spec.returnUrl,
        metadata: spec.metadata,
        allowed_payment_method_types: dodoPaymentMethods(appConfig.dodoPaymentMethods),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Dodo checkout failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as { checkout_url?: string; session_id?: string };
    if (!json.checkout_url) throw new Error("Dodo checkout failed: no checkout_url in response");
    return { checkoutUrl: json.checkout_url, sessionId: json.session_id ?? "" };
  }

  async createBidCheckout(input: BidCheckoutInput) {
    if (!appConfig.dodoApiKey) return this.fallback.createBidCheckout(input);
    if (this.baseUrl.includes("live.") && !appConfig.allowPlatformCollectedBids) {
      // Bids are charged with the single platform key, so BodyTag itself would collect brand money. That is not what the
      // Terms or the Dodo underwriting copy say. Refuse until per-creator processor accounts are wired in.
      throw new Error("Live Dodo bid checkout is disabled: bids must settle on the creator's own processor account.");
    }
    const checkout = await this.createCheckout({
      productId: appConfig.dodoBidProductId,
      amountCents: input.amountCents,
      email: input.brandEmail,
      returnUrl: input.returnUrl,
      metadata: {
        kind: "bid",
        campaign_id: input.campaignId,
        slot_id: input.slotId,
        bid_id: input.bidId,
        expected_price: String(input.expectedPriceCents),
        brand_email: input.brandEmail,
        ...(input.termsVersion ? { terms_version: input.termsVersion } : {}),
      },
    });
    return { checkoutUrl: checkout.checkoutUrl, sessionId: checkout.sessionId || `dodo_${input.bidId}` };
  }

  /**
   * Stake is prepaid credit for BodyTag's own hosted software, so it is charged on the platform key by design
   * (docs/dodo-compliance.md). With no API key configured the mock path credits the Stake directly (demo/self-host).
   */
  async createStakeCheckout(input: StakeCheckoutInput) {
    if (!appConfig.dodoApiKey) return this.fallback.createStakeCheckout(input);
    return this.createCheckout({
      productId: appConfig.dodoStakeProductId,
      amountCents: input.amountCents,
      email: input.creatorEmail,
      returnUrl: input.returnUrl,
      metadata: {
        kind: "stake_topup",
        campaign_id: input.campaignId,
        creator_id: input.creatorId,
        amount_cents: String(input.amountCents),
        currency: input.currency,
      },
    });
  }

  async refund(paymentId: string, reason: string) {
    if (!appConfig.dodoApiKey) return this.fallback.refund(paymentId, reason);
    const res = await fetch(`${this.baseUrl}/refunds`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ payment_id: paymentId, reason }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Dodo refund failed (${res.status}): ${text.slice(0, 300)}`);
    }
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
