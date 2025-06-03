import getUserReportsHandler from './getUserReportsHandler.mjs';
import postUserReportsHandler from './postUserReportsHandler.mjs';
import userDataHandler from './userDataHandler.mjs';

export const postUserReport = postUserReportsHandler;
export const getUserReport = getUserReportsHandler;
export const getUserData = userDataHandler;
