FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/worker-images/package.json apps/worker-images/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN pnpm install
COPY packages ./packages
COPY apps/worker-images ./apps/worker-images
RUN pnpm --filter db generate
WORKDIR /app/apps/worker-images
EXPOSE 9091
CMD ["pnpm", "start"]
