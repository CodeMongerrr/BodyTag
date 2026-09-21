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
};

export interface PaymentAdapter {
  createBidCheckout(input: BidCheckoutInput): Promise<{ checkoutUrl: string; sessionId: string }>;
  refund(paymentId: string, reason: string): Promise<void>;
  creditWallet(customerId: string, amount: Money): Promise<void>;
  debitWallet(customerId: string, amount: Money): Promise<{ ok: boolean; paymentId?: string }>;
  walletBalance(customerId: string): Promise<number>;
}
