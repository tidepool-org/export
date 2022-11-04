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

1. Install Node version 12 or later. [NVM](https://github.com/creationix/nvm) is highly recommended.
1. Execute `npm install` to install all dependencies

# Execute

`npm run start`
