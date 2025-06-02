### Stage 0 - Base image
FROM node:20.8.0-alpine AS base
WORKDIR /app
RUN apk --no-cache update && \
    apk --no-cache upgrade && \
    apk add --no-cache --virtual .build-dependencies python3 make g++
RUN corepack enable && \
    yarn set version 3.6.4 && \
    mkdir -p node_modules .yarn-cache .yarn dist && chown -R node:node .

### Stage 1 - Cached node_modules image
FROM base AS dependencies
USER node
COPY --chown=node:node package.json yarn.lock .yarnrc.yml ./
RUN yarn plugin import workspace-tools
RUN NODE_ENV=development yarn install --immutable --silent && mv node_modules node_modules_development
RUN NODE_ENV=production yarn workspaces focus --all --production && mv node_modules node_modules_production
RUN yarn cache clean

### Stage 2 - Development image
FROM base AS development
ENV NODE_ENV=development
USER node
COPY --from=dependencies /app/node_modules_development ./node_modules
COPY . .
RUN node esbuild.config.js
USER nobody
EXPOSE 9300
CMD ["node", "./dist/app.cjs"]

### Stage 3 - Test
FROM development AS test
USER node
RUN yarn run lint
RUN yarn run test

### Stage 4 - Build
FROM base AS build
USER node
COPY --from=dependencies /app/node_modules_development ./node_modules
COPY . .
RUN node esbuild.config.js

### Stage 5 - Production image
FROM node:20.8.0-alpine AS production
USER node
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules_production ./node_modules
COPY --from=build /app/dist/app.cjs ./dist/app.cjs
USER nobody
EXPOSE 9300
CMD ["node", "./dist/app.cjs"]
