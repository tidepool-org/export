const pjson = require('./package.json');

module.exports =
{
  "openapi": "3.0.0",
  "info": {
    "title": "Export API",
    "version": pjson.version,
    "description": pjson.description,
    "license": {
      "name": "BSD-2-Clause",
      "url": "https://opensource.org/licenses/BSD-3-Clause"
    },
    "contact": {
      "name": "Diabeloop",
      "url": "https://www.diabeloop.com",
      "email": "platforms@diabeloop.fr"
    }
  },
  "servers": [
    {
      "url": "https://api.android-qa.your-loops.dev/export",
      "description": "Staging for Android development team"
    },
    {
      "url": "https://api.your-loops.com/export",
      "description": "Commercial"
    },
    {
      "url": "https://api.clinical.your-loops.com/export",
      "description": "Clinical"
    }
  ]
};
