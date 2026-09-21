import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const MACROS = [
  {
    id: "payment",
    title: "Payment stuck",
    sla: "4 business hours",
    body: "We confirm bids only on payment.succeeded. Overlay return is not settlement. If you were charged twice, we will credit the extra to wallet — we do not card-refund takeovers.",
  },
  {
    id: "outbid",
    title: "Outbid wallet credit",
    sla: "4 hours",
    body: "Your previous bid was credited to the creator's wallet ledger, not refunded to the card. That is the product, not a bug. Withdraw from the sponsor portal or after 30 days idle.",
  },
  {
    id: "fake",
    title: "Impersonation / scam",
    sla: "Pause in 1 hour; decide in 24 hours",
    body: "We paused bidding. The live URL stays up as evidence. BodyTag does not hold brand bid money. File KYC if you are the real creator.",
  },
  {
    id: "logo",
    title: "Logo looks wrong",
    sla: "Next image-worker pass",
    body: "Update the PNG from the sponsor portal magic link. OG/story regenerate on a worker; hard-refresh the live URL with ?v=bidId.",
  },
];

export default async function TicketsPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/sign-in");
  }
  const tickets = await prisma.supportTicket.findMany({
    where: { email: user.email },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl">Your tickets</h1>
      <section className="mt-8 border border-line p-4">
        <h2 className="text-xl">Macros</h2>
        <p className="text-sm text-muted">Canned replies. We do not run payouts over DMs — always include the ticket ID.</p>
        <ul className="mt-3 space-y-3 text-sm">
          {MACROS.map((m) => (
            <li key={m.id} className="border border-line p-3">
              <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
                {m.title} · SLA {m.sla}
              </p>
              <p className="mt-2 text-muted">{m.body}</p>
            </li>
          ))}
        </ul>
      </section>
      <ul className="mt-8 divide-y divide-line border border-line">
        {tickets.map((t) => (
          <li key={t.id} className="p-4 text-sm">
            <p className="font-mono text-xs text-accent">
              {t.id} · {t.kind} · {t.status}
            </p>
            <p className="mt-2">{t.body}</p>
          </li>
        ))}
        {tickets.length === 0 && <li className="p-6 text-muted">No tickets. Use Support on any page.</li>}
      </ul>
    </main>
  );
}
