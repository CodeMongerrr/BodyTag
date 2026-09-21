import { prisma } from "@/lib/db";
import { redisPing } from "@/lib/redis";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  const redis = await redisPing();
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-5xl">Status</h1>
      <p className="mt-3 text-muted">Checkout fails closed. The live billboard fails open.</p>
      <ul className="mt-8 space-y-3 font-mono text-sm">
        <li>Postgres {db ? "ok" : "down"}</li>
        <li>Redis {redis ? "ok" : "down (SSE degrades, pages still render)"}</li>
        <li>
          Payments circuit{" "}
          {(await prisma.circuitState.findUnique({ where: { id: "payments" } }))?.state ?? "closed"}
        </li>
      </ul>
      <p className="mt-6 text-sm text-muted">
        Hosted operators should also embed Instatus. Image worker death does not 404 cached OG images.
      </p>
    </main>
  );
}
