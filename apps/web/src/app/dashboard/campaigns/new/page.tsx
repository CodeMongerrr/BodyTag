import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createCampaignFormAction } from "@/app/actions";

export default async function NewCampaignPage() {
  try {
    await requireUser();
  } catch {
    redirect("/sign-in");
  }
  const soon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 16);
  const close = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString().slice(0, 16);
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-4xl">New campaign</h1>
      <form action={createCampaignFormAction} className="mt-8 space-y-4">
        <label className="block text-xs uppercase tracking-widest text-muted">Title</label>
        <input name="title" required className="w-full border border-line bg-panel p-3" placeholder="HYROX Mumbai walking billboard" />
        <label className="block text-xs uppercase tracking-widest text-muted">Theme</label>
        <select name="theme" className="w-full border border-line bg-panel p-3">
          <option value="photo">Photo overlay</option>
          <option value="arena">3D arena</option>
        </select>
        <label className="block text-xs uppercase tracking-widest text-muted">Event name</label>
        <input name="eventName" required className="w-full border border-line bg-panel p-3" />
        <label className="block text-xs uppercase tracking-widest text-muted">City</label>
        <input name="eventCity" required className="w-full border border-line bg-panel p-3" />
        <label className="block text-xs uppercase tracking-widest text-muted">Event date</label>
        <input name="eventDate" type="datetime-local" defaultValue={soon} required className="w-full border border-line bg-panel p-3" />
        <label className="block text-xs uppercase tracking-widest text-muted">Auction close</label>
        <input name="closeAt" type="datetime-local" defaultValue={close} required className="w-full border border-line bg-panel p-3" />
        <label className="block text-xs uppercase tracking-widest text-muted">Target total USD (optional policy copy, not a crowdfund)</label>
        <input name="targetTotal" type="number" min="0" className="w-full border border-line bg-panel p-3" />
        <button className="bg-accent px-6 py-3 font-medium text-ink">Create draft</button>
      </form>
    </main>
  );
}
