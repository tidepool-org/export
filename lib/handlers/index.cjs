const getUserReportsHandler = require('./getUserReportsHandler.cjs');
const postUserReportsHandler = require('./postUserReportsHandler.cjs');
const userDataHandler = require('./userDataHandler.cjs');

module.exports = {
  postUserReport: postUserReportsHandler,
  getUserReport: getUserReportsHandler,
  getUserData: userDataHandler,
};
