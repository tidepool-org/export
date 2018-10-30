#!/bin/bash -eu

. "${NVM_DIR}/nvm.sh"
. version.sh

nvm ls "${START_NODE_VERSION}" > /dev/null || { echo "ERROR: Node version ${START_NODE_VERSION} not installed"; exit 1; }
nvm use --delete-prefix "${START_NODE_VERSION}"

. config/env.sh

exec node --max_old_space_size=400 -r esm ./app.js
