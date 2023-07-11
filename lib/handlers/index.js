const getUserReportsHandler = require('./getUserReportsHandler');
const postUserReportsHandler = require('./postUserReportsHandler');
const userDataHandler = require('./userDataHandler');

module.exports = {
  postUserReport: postUserReportsHandler,
  getUserReport: getUserReportsHandler,
  getUserData: userDataHandler,
};
