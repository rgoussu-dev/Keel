FROM node:22-alpine
WORKDIR /app
COPY . .
# No build step: Node runs the TypeScript sources directly. The
# workspace has no runtime dependencies, so install only links the
# workspace packages.
RUN npm ci --omit=dev
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "application/rest/src/main.ts"]
