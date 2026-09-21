import { prisma } from "../db";
import type { BidCheckoutInput, Money, PaymentAdapter } from "./adapter";
import { appConfig } from "../config";

export class MockAdapter implements PaymentAdapter {
  async createBidCheckout(input: BidCheckoutInput) {
    const sessionId = `mock_${input.bidId}`;
    const checkoutUrl = `${appConfig.appUrl}/api/payments/mock/complete?session=${sessionId}&bid=${input.bidId}`;
    return { checkoutUrl, sessionId };
  }

  async refund(_paymentId: string, _reason: string) {
    return;
  }

  async creditWallet(customerId: string, amount: Money) {
    const existing = await prisma.wallet.findUnique({ where: { email: customerId } });
    if (existing) {
      if (existing.currency !== amount.currency && existing.balanceCents === 0) {
        await prisma.wallet.update({
          where: { email: customerId },
          data: { currency: amount.currency, balanceCents: { increment: amount.cents } },
        });
        return;
      }
      await prisma.wallet.update({
        where: { email: customerId },
        data: { balanceCents: { increment: amount.cents } },
      });
    } else {
      await prisma.wallet.create({
        data: { email: customerId, balanceCents: amount.cents, currency: amount.currency, provider: "mock" },
      });
    }
  }

  async debitWallet(customerId: string, amount: Money) {
    const wallet = await prisma.wallet.findUnique({ where: { email: customerId } });
    if (!wallet || wallet.currency !== amount.currency || wallet.balanceCents < amount.cents) {
      return { ok: false };
    }
    const result = await prisma.wallet.updateMany({
      where: {
        email: customerId,
        currency: amount.currency,
        balanceCents: { gte: amount.cents },
      },
      data: { balanceCents: { decrement: amount.cents } },
    });
    if (result.count === 0) return { ok: false };
    return { ok: true, paymentId: `wallet_${customerId}_${Date.now()}` };
  }

  async walletBalance(customerId: string) {
    const wallet = await prisma.wallet.findUnique({ where: { email: customerId } });
    return wallet?.balanceCents ?? 0;
  }
}
