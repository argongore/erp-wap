FROM node:22-slim

WORKDIR /app

ENV TZ=Asia/Jakarta
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
