FROM oven/bun:1

WORKDIR /app

COPY package.json .
COPY bun.lock .

RUN bun install --production

RUN mkdir -p /app/data && chmod 777 /app/data

COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]
