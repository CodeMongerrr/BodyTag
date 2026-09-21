export const appConfigClient = {
  note: "compose default 0 · hosted 100",
  /**
   * Avaturn project subdomain (`https://<subdomain>.avaturn.dev`). Create one at developer.avaturn.me.
   * `demo` works without an account but has undocumented limits and exports T1 avatars as httpURL.
   */
  avaturnSubdomain: process.env.NEXT_PUBLIC_AVATURN_SUBDOMAIN ?? "demo",
};
