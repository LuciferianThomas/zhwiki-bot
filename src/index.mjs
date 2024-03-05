import dotenv from 'dotenv';
dotenv.config();
import { Mwn } from 'mwn'
import { CronJob } from 'cron';

import { time, log, pruneLogs } from './fn.mjs';
import genCaseList from './spi/case_list.mjs';
import getStewardComments from './spi/steward_comment.mjs';

import updateRfcList from './rfc/update.mjs';
import sendFrs from './frs/send.mjs';

import { CDB } from './db.mjs'
const rfcData = new CDB( 'RFC' )

// console.log( 'env', process.env )

const bot = new Mwn( {
  apiUrl: 'https://zh.wikipedia.org/w/api.php',

  username: process.env.USERNAME,
  password: process.env.BOTPASSWORD,

  userAgent: process.env.USERAGENT,

  defaultParams: { assert: 'user' }
} )

bot.login().then( async () => {
  console.log( "成功登入" )
  log( `成功登入` )
  const main = async () => {
    try {
      await genCaseList( bot )
      if ( !rfcData.get( "working" ) ) await updateRfcList( bot )
    }
    catch ( e ) {
      log( `[ERR] ${ e }` )
      console.error( e )
    }
  }
  var job = new CronJob('0 */10 * * * *', main, null, true);
  job.start();
  await main()
  await getStewardComments( bot )

  new CronJob( '0 0 0 * * *', () => { pruneLogs() }, null, true, null, null, true ).start()
} )