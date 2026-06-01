FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry=https://registry.npmjs.org/ --replace-registry-host=always

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
