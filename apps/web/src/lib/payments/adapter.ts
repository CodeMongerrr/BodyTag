export type Money = { cents: number; currency: string };

export type BidCheckoutInput = {
  campaignId: string;
  slotId: string;
  bidId: string;
  brandEmail: string;
  amountCents: number;
  currency: string;
  returnUrl: string;
  expectedPriceCents: number;
  /** Terms version the brand accepted at checkout; stored on the processor payment as dispute evidence. */
  termsVersion?: string;
};

export type StakeCheckoutInput = {
  campaignId: string;
  creatorId: string;
  creatorEmail: string;
  amountCents: number;
  currency: string;
  returnUrl: string;
};

export interface PaymentAdapter {
  /** Charge a creator for a Stake top-up. Resolves null when the adapter takes no real payment (mock): the caller credits directly. */
  createStakeCheckout(input: StakeCheckoutInput): Promise<{ checkoutUrl: string; sessionId: string } | null>;
  createBidCheckout(input: BidCheckoutInput): Promise<{ checkoutUrl: string; sessionId: string }>;
  refund(paymentId: string, reason: string): Promise<void>;
  creditWallet(customerId: string, amount: Money): Promise<void>;
  debitWallet(customerId: string, amount: Money): Promise<{ ok: boolean; paymentId?: string }>;
  walletBalance(customerId: string): Promise<number>;
}
