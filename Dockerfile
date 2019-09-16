# Base node
FROM node:10.15.3-alpine AS base

WORKDIR /app
COPY package.json /app

#
# ---- Dependencies ----
FROM base AS dependencies
# install only production node packages
RUN npm install --production
# mv production node_modules aside
RUN mv node_modules /root/prod_node_modules
# install ALL node_modules, including 'devDependencies'
RUN npm install \
 && npm cache clean --force
 
#
# ---- Test ----
# run linters
FROM dependencies AS test
COPY . /app
RUN npm run lint
 
#
# ---- Release ----
FROM base AS release
# copy production node_modules
COPY --from=dependencies /root/prod_node_modules ./node_modules
COPY . /app

USER node

EXPOSE 9300

CMD node -r esm ./app.js
