# Built by `pnpm deploy:transcoder`, which bundles dist/main.mjs first.
FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY dist/main.mjs /app/main.mjs
USER node
ENTRYPOINT ["node", "/app/main.mjs"]
