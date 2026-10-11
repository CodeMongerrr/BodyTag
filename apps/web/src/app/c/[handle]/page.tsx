import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { livePath } from "@bodytag/shared";

export default async function CreatorHandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const creator = await prisma.user.findUnique({ where: { handle } });
  if (!creator) notFound();

  // Prefer what is actually on sale: live first, then paused, then ended campaigns. Drafts are never public.
  const campaigns = await prisma.campaign.findMany({
    where: { creatorId: creator.id, status: { in: ["live", "paused", "closed", "fulfilled"] } },
    orderBy: { createdAt: "desc" },
  });
  const rank = (status: string) => ["live", "paused"].indexOf(status) + 1 || 3;
  const best = [...campaigns].sort((a, b) => rank(a.status) - rank(b.status))[0];
  if (!best) notFound();

  redirect(livePath(handle, best.slug));
}
