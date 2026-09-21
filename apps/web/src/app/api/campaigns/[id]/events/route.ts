import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { subscribeCampaign, touchViewer, removeViewer } from "@/lib/redis";
import { isCloudflare } from "@/lib/runtime";
import { campaignEventsResponse } from "@/lib/realtime/cloudflare";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Hosted instance: the CampaignHub Durable Object owns the stream (fan-out + presence); just proxy it.
  if (isCloudflare()) return campaignEventsResponse(id, req.signal);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const unsubscribe = subscribeCampaign(id, (data) => {
        send(data);
      });

      const viewerId = nanoid(10);
      const ping = setInterval(async () => {
        if (closed) return;
        const viewers = await touchViewer(id, viewerId);
        send({ type: "presence", viewers });
      }, 4000);

      const abort = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        void removeViewer(id, viewerId);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", abort);
      send({ type: "hello", campaignId: id });
      void touchViewer(id, viewerId).then((viewers) => send({ type: "presence", viewers }));
      return abort;
    },
  });
  return new NextResponse(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
