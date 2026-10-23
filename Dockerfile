# Runs the receipt proxy as a container (AletCloud, or any Docker host).
FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
