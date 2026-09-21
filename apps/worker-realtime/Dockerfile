FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker-realtime/package.json apps/worker-realtime/
RUN pnpm install
COPY apps/worker-realtime ./apps/worker-realtime
WORKDIR /app/apps/worker-realtime
EXPOSE 9092
CMD ["pnpm", "start"]
