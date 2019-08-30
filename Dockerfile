### Stage 0 - Base image
FROM node:10.14.2-alpine as base
WORKDIR /app
RUN apk --no-cache update && \
    apk --no-cache upgrade && \
    apk add --no-cache --virtual .build-dependencies python make g++ && \
    mkdir -p node_modules && chown -R node:node .


### Stage 2 - Create cached `node_modules`
# Only rebuild layer if `package.json` has changed
FROM base as dependencies
COPY package.json .
COPY yarn.lock .
RUN \
  # Build and separate all dependancies required for production
  yarn install --production && cp -R node_modules production_node_modules \
  # Build all modules, including `devDependancies`
  && yarn install \
  && yarn cache clean


### Stage 3 - Development root with Chromium installed for unit tests
FROM base as development
ENV NODE_ENV=development
# Copy all `node_modules` dependencies
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
# Copy source files
COPY --chown=node:node . .
USER node
EXPOSE 9300
CMD node -r esm ./app.js


### Stage 4 - Test
FROM dependencies as test
COPY . /app
RUN yarn lint


### Stage 5 - Serve production-ready release
FROM base as production
ENV NODE_ENV=production
# Copy only `node_modules` needed to run the server
COPY --from=dependencies /app/production_node_modules ./node_modules
# Copy source files
COPY --chown=node:node . .
USER node
EXPOSE 9300
CMD node -r esm ./app.js
