import http from "node:http";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 2 });

const server = http.createServer(async (_req, res) => {
  let redisOk = false;
  try {
    redisOk = (await redis.ping()) === "PONG";
  } catch {
    redisOk = false;
  }
  res.writeHead(redisOk ? 200 : 503, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: redisOk, worker: "realtime", note: "SSE fan-out lives in the web app: one Redis sub per campaign" }));
});

server.listen(9092, "0.0.0.0", () => {
  console.log("worker-realtime health on :9092");
});
