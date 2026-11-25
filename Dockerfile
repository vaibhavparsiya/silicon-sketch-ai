FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node web ./web
COPY --chown=node:node worker ./worker
COPY --chown=node:node scripts/dev.mjs ./scripts/dev.mjs
RUN mkdir .local && chown node:node .local
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "scripts/dev.mjs"]
