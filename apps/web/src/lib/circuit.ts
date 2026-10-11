import { prisma } from "./db";

const THRESHOLD = 5;
const OPEN_MS = 30_000;

export async function paymentAvailable() {
  // Read-only on the hot path; the row is only written when the breaker changes state.
  const row = await prisma.circuitState.findUnique({ where: { id: "payments" } });
  if (!row || row.state !== "open") return true;
  if (row.openedAt && Date.now() - row.openedAt.getTime() > OPEN_MS) {
    // Half-open: let traffic probe the processor. One failure re-opens it, one success closes it.
    await prisma.circuitState.update({ where: { id: "payments" }, data: { state: "half" } });
    return true;
  }
  return false;
}

export async function recordPaymentSuccess() {
  const row = await prisma.circuitState.findUnique({ where: { id: "payments" } });
  if (row && row.state === "closed" && row.failures === 0) return;
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
  if (row.state === "half" || row.failures >= THRESHOLD) {
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
