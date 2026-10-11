export const appConfig = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  shortUrl: process.env.SHORT_URL ?? process.env.APP_URL ?? "http://localhost:3000",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-change-me",
  hostedFeeBps: Number(process.env.HOSTED_FEE_BPS ?? "0"),
  requireStake:
    process.env.REQUIRE_STAKE === "true" || Number(process.env.HOSTED_FEE_BPS ?? "0") > 0,
  marketplaceGrid: process.env.ENABLE_MARKETPLACE_GRID !== "false",
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? "mock") as "mock" | "dodo" | "stripe" | "razorpay",
  // Mock checkout is dev-only unless explicitly allowed (public demo instances with no real money).
  allowMockPayments: process.env.ALLOW_MOCK_PAYMENTS === "true" || process.env.NODE_ENV !== "production",
  dodoApiKey: process.env.DODO_API_KEY ?? "",
  dodoWebhookSecret: process.env.DODO_WEBHOOK_SECRET ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  dodoEnv: process.env.DODO_ENVIRONMENT ?? "test_mode",
  // Pay-what-you-want products created once in the Dodo dashboard: one for sponsor slot purchases, one for Stake top-ups.
  dodoBidProductId: process.env.DODO_BID_PRODUCT_ID ?? "",
  dodoStakeProductId: process.env.DODO_STAKE_PRODUCT_ID ?? "",
  // Comma-separated Dodo payment_method_types shown at checkout. Empty = launch defaults (see lib/payments/methods.ts).
  dodoPaymentMethods: process.env.DODO_PAYMENT_METHODS ?? "",
  // Live-mode bids on the single platform Dodo key mean BodyTag collects brand money, which contradicts the Terms and
  // Dodo's underwriting copy (docs/dodo-compliance.md). Keep false until bids settle on creator-owned accounts.
  allowPlatformCollectedBids: process.env.ALLOW_PLATFORM_COLLECTED_BIDS === "true",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  databaseUrl: process.env.DATABASE_URL ?? "",
  storageDriver: (process.env.STORAGE_DRIVER ?? "fs") as "fs" | "s3" | "r2",
  storageDir: process.env.STORAGE_DIR ?? "data/objects",
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "bodytag",
    accessKey: process.env.S3_ACCESS_KEY ?? "bodytag",
    secretKey: process.env.S3_SECRET_KEY ?? "bodytagsecret",
  },
  cdnBaseUrl: process.env.CDN_BASE_URL ?? "",
  imageQueue: process.env.IMAGE_QUEUE ?? "bodytag-images",
  supportEmail: process.env.SUPPORT_EMAIL ?? "support@bodytag.app",
  creatorsEmail: process.env.CREATORS_EMAIL ?? "creators@bodytag.app",
  crispId: process.env.CRISP_WEBSITE_ID ?? "",
  // Identity shown on /terms and /privacy. Self-host operators must set their own; unset values render as visible placeholders.
  legal: {
    termsVersion: "2026-10-11",
    entityName: process.env.LEGAL_ENTITY_NAME ?? "",
    entityAddress: process.env.LEGAL_ENTITY_ADDRESS ?? "",
    governingLaw: process.env.LEGAL_GOVERNING_LAW ?? "",
    privacyEmail: process.env.PRIVACY_EMAIL ?? process.env.CREATORS_EMAIL ?? "creators@bodytag.app",
    grievanceOfficerName: process.env.GRIEVANCE_OFFICER_NAME ?? "",
    grievanceOfficerEmail: process.env.GRIEVANCE_OFFICER_EMAIL ?? "",
    euRepresentative: process.env.EU_REPRESENTATIVE ?? "",
  },
};

export function isHosted() {
  return appConfig.hostedFeeBps > 0;
}
