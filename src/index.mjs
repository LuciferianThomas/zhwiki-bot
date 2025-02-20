import { Mwn } from 'mwn'
import { WikimediaStream } from "wikimedia-streams";
import { CronJob } from 'cron';
import moment from 'moment';

import { time, log, logx, pruneLogs } from './fn.mjs';
import updateSpiCaseList from './SPI/case_list.mjs';
import getStewardComments from './SPI/steward_comment.mjs';

import updateRfcList from './RFC/update.mjs';
import updateTalkIndex from './TID/update.mjs';

import updateDrnList from './DRN/case_list.mjs';

import archiveUT from './UT/archive.mjs';

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

/**
 * 
 * @param { boolean } all 
 */
const main = async ( all ) => {
  const now = moment()

  await updateSpiCaseList( bot )
  await updateRfcList( bot )
  await updateTalkIndex( bot )
  // await updateDrnList( bot )

  // DAILY
  if ( all || ( now.hour() == 0 && now.minute() < 10 ) ) {
    await archiveUT( bot )
  }
}

var job = new CronJob('0 */10 * * * *', main, null, true);
job.start();
await main( true )

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