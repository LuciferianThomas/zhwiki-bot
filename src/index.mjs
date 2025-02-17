import { Mwn } from 'mwn'
import { WikimediaStream } from "wikimedia-streams";
import { CronJob } from 'cron';
import moment from 'moment';

import { time, log, logx, pruneLogs } from './fn.mjs';
import genCaseList from './SPI/case_list.mjs';
import getStewardComments from './SPI/steward_comment.mjs';

import updateRfcList from './RFC/update.mjs';
import updateTalkIndex from './TID/update.mjs';

import { CDB } from './db.mjs'
import update from './RFC/update.mjs';

// console.log( 'env', process.env )

const bot = new Mwn( {
  apiUrl: 'https://zh.wikipedia.org/w/api.php',

  username: process.env.USERNAME,
  password: process.env.BOTPASSWORD,

  userAgent: process.env.USERAGENT,

  defaultParams: { assert: 'user' }
} )

const stream = new WikimediaStream( "recentchange" );

await bot.login()

log( `成功登入` )

const main = async () => {
  await genCaseList( bot )
  await updateRfcList( bot )
  await updateTalkIndex( bot )
}

var job = new CronJob('0 */10 * * * *', main, null, true);
job.start();
await main()

// const srcuPage = 'User:LuciferianThomas/沙盒/3'
const srcuPage = 'Steward requests/Checkuser' 
    
stream.on( "recentchange", async ( data ) => {
  if (
    data.wiki === 'metawiki'
    && data.title === srcuPage
    && data.length.old < data.length.new
  ) getStewardComments( bot, data, srcuPage );

  if (
    data.wiki === 'zhwiki'
    && data.title === srcuPage
    && data.length.old < data.length.new
  ) getStewardComments( bot, data, srcuPage );
} ).on( "error", console.error )

new CronJob( '0 0 0 * * *', () => { pruneLogs() }, null, true, null, null, true ).start()