import { Mwn } from 'mwn'
import { CronJob } from 'cron';
import moment from 'moment';

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

await bot.login()

log( `成功登入` )
rfcData.set( "working", false )

const main = async () => {
  try {
    await genCaseList( bot )
  }
  catch ( e ) {
    log( `[SPI] [ERR] ${ e }` )
    console.error( e )
  }
  try {
    let lu = rfcData.get( "working" )
    if ( moment( lu ).add( 10, 'minutes' ) < moment() )
      rfcData.set( ( lu = false ) )
    if ( !lu ) await updateRfcList( bot )
  }
  catch ( e ) {
    log( `[RFC] [ERR] ${ e }` )
    console.error( e )
    rfcData.set( "working", false )
  }
}

var job = new CronJob('0 */10 * * * *', main, null, true);
job.start();
rfcData.set( "working", false )
await main()
await getStewardComments( bot )

new CronJob( '0 0 0 * * *', () => { pruneLogs() }, null, true, null, null, true ).start()