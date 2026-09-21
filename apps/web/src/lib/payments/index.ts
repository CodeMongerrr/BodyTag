import { appConfig } from "../config";
import type { PaymentAdapter } from "./adapter";
import { DodoAdapter } from "./dodo";
import { MockAdapter } from "./mock";

export function getPayments(): PaymentAdapter {
  if (appConfig.paymentProvider === "dodo") return new DodoAdapter();
  return new MockAdapter();
}
