FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs storage.mjs ./
COPY public ./public
COPY data ./data
COPY vendor ./vendor
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/app/runtime
RUN mkdir -p /app/runtime && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/runtime"]
CMD ["node","server.mjs"]
