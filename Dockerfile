FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/scripts/dev.mjs ./scripts/dev.mjs
COPY --from=build /app/worker/http.mjs ./worker/http.mjs
COPY --from=build /app/shared/validators.js ./shared/validators.js
COPY --from=build /app/package.json ./
RUN mkdir .local && chown node:node .local
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node","scripts/dev.mjs"]
