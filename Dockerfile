FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY backend ./backend
COPY frontend ./frontend
COPY scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/root.sqlite
USER node
EXPOSE 3000
CMD ["node", "backend/server.mjs"]
