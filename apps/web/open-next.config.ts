import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every BodyTag page is dynamic (live inventory), so no ISR/incremental cache is configured.
export default defineCloudflareConfig({});
