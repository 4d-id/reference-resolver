# 4D-ID reference resolver, version 2.3.
# Default build needs no native compilation: the resolver runs on a pure-JS store.
# Set STORE=sqlite (and provide build tools) only if you want SQLite persistence.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
# --omit=optional skips the native better-sqlite3 binding; the memory store is default.
RUN npm install --omit=dev --omit=optional
COPY schemas ./schemas
COPY openapi ./openapi
COPY samples ./samples
COPY resolver ./resolver
COPY conformance ./conformance
COPY scripts ./scripts
ENV PORT=4141
ENV STORE=memory
ENV SEED=true
EXPOSE 4141
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4141)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "resolver/server.mjs"]
