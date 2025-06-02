# Export

The Tidepool export service.

[![Build Status](https://travis-ci.com/tidepool-org/export.png)](https://travis-ci.com/tidepool-org/export)
[![Code Climate](https://codeclimate.com/github/tidepool-org/export/badges/gpa.svg)](https://codeclimate.com/github/tidepool-org/export)
[![Issue Count](https://codeclimate.com/github/tidepool-org/export/badges/issue_count.svg)](https://codeclimate.com/github/tidepool-org/export)
[![Docker Image](https://images.microbadger.com/badges/image/tidepool/export.svg)](http://microbadger.com/images/tidepool/export "Get your own image badge on microbadger.com")
[![Docker Image version](https://images.microbadger.com/badges/version/tidepool/export.svg)](http://microbadger.com/images/tidepool/export "Get your own version badge on microbadger.com")

# Running as part of the Tidepool Stack
The easiest way to run the Tidepool export service is as part of the [Tidepool Development environment](https://github.com/tidepool-org/development).
You'll have to uncomment the export service in the `docker-compose.yml`, but after that, you can just run `docker-compose up -d`, and you're all set.

# Setup
If you want to develop any part of the export service, you can run the service locally on Node.

1. Install Node version 20.8.0 or later. [NVM](https://github.com/creationix/nvm) is highly recommended.
1. Execute `nvm use` to use the correct version of Node.
1. Install [Yarn](https://yarnpkg.com/).
1. Execute `yarn` to install all dependencies

# Execute
`yarn start:dev` will start the service in development mode. It will watch for changes and restart the service as needed.

# Testing
`yarn test` will run the tests.

# Linting
`yarn lint` will run the linter.

# Building
`yarn build` will build the service.

# Configuration
Configuration is done via environment variables. The following variables are available:

| Variable | Description | Example |
| --- | --- | --- |
| API_HOST | The hostname of the Tidepool API | https://qa1.development.tidepool.org |
| DEBUG_LEVEL | The log level | info |
| DEBUG_PDF | Whether to write out files for debugging purposes | false |
| PLOTLY_ORCA | The URL of the Plotly Orca service | http://localhost:9091 |
| EXPORT_TIMEOUT | The maximum time to wait for a request to complete | 120000 |

