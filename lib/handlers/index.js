import getUserReportsHandler from './getUserReportsHandler';
import postUserReportsHandler from './postUserReportsHandler';
import userDataHandler from './userDataHandler';

export default {
  postUserReport: postUserReportsHandler,
  getUserReport: getUserReportsHandler,
  getUserData: userDataHandler,
};
