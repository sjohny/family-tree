FROM node:20-alpine

LABEL org.opencontainers.image.title="Family Tree"
LABEL org.opencontainers.image.description="Beautiful self-hosted family tree app with Immich/pCloud photo support"

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY public/ ./public/

RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
