import { prisma } from "./db";

const THRESHOLD = 5;
const OPEN_MS = 30_000;

export async function paymentAvailable() {
  const row = await prisma.circuitState.upsert({
    where: { id: "payments" },
    update: {},
    create: { id: "payments", state: "closed" },
  });
  if (row.state === "open") {
    if (row.openedAt && Date.now() - row.openedAt.getTime() > OPEN_MS) {
      await prisma.circuitState.update({
        where: { id: "payments" },
        data: { state: "half" },
      });
      return true;
    }
    return false;
  }
  return true;
}

export async function recordPaymentSuccess() {
  await prisma.circuitState.upsert({
    where: { id: "payments" },
    update: { state: "closed", failures: 0, openedAt: null },
    create: { id: "payments", state: "closed" },
  });
}

export async function recordPaymentFailure() {
  const row = await prisma.circuitState.upsert({
    where: { id: "payments" },
    update: { failures: { increment: 1 } },
    create: { id: "payments", failures: 1 },
  });
  const failures = row.failures + (row.id ? 0 : 0);
  const next = await prisma.circuitState.findUnique({ where: { id: "payments" } });
  const count = next?.failures ?? failures;
  if (count >= THRESHOLD) {
    await prisma.circuitState.update({
      where: { id: "payments" },
      data: { state: "open", openedAt: new Date() },
    });
  }
}

export class PaymentUnavailableError extends Error {
  constructor() {
    super("Payments are temporarily unavailable. The live page stays up.");
    this.name = "PaymentUnavailableError";
  }
}
