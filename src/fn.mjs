import moment from 'moment';
import jquery from 'jquery';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import url from 'url';

/**
 * @typedef { import('mwn/build/wikitext').Section  } Section
 * @typedef { import('mwn/build/wikitext').Template } Template
 * @typedef { { user: string, timestamp: Date, sigtext: string } } Signature
 */

const __dirname = path.dirname( url.fileURLToPath( import.meta.url ) );
const logpath = path.join(__dirname, "..", "logs" );

const sigRgx = /\[\[:?(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)([^|\]\/#]+)(?:.(?!\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)(?:[^|\]\/#]+)))*? (\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d{2}):(\d{2}) \(UTC\)/i

const time = ( date = moment(), format = "YYYY-MM-DD HH:mm" ) => {
  return moment( date ).utcOffset( 8 ).format( format )
}

/**
 * 
 * @param { string } s 
 * @returns 
 */
const capitalize = s => {
  if ( typeof s !== 'string' ) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const win = new ( JSDOM )( '' ).window
const $ = jquery( win, true )

/**
 * 
 * @param { any[] } message 
 */
const log = ( ...message ) => {
  return logx( "MAIN", ...message )
}
/**
 * 
 * @param { string } group
 * @param { any[] } message 
 */
const logx = ( group, ...message ) => {
  console.log( `[${ group }]`, ...message );
  fs.appendFile( path.join( logpath, `debug-${ time( moment(), "YYYYMMDD" ) }-${group.toUpperCase()}.log` ), `${ time() } | ${ message.map( m => ( typeof m !== 'string' ? JSON.stringify( m ) : m ) ).join(' ').replace( /\n/g, '\n' + ( ' '.repeat(19) ) ) }\n`, ( e ) => {
    if ( e ) return;
  } )
}

/**
 * 
 */
const pruneLogs = () => {
  const dir = fs.readdirSync( logpath )
  const logsToPrune = dir.filter( logfile => logfile < `debug-${ moment().subtract(7,'d').format("YYYYMMDD") }` )
  for ( const logToPrune of logsToPrune ) {
    fs.unlink( path.join( logpath, logToPrune ), ( e ) => {
      if ( e ) return;
      log( `Pruned ${ logToPrune }` )
    } )
  }
}

/**
 * 
 * @param { import('mwn').MwnPage } page 
 * @param { import('mwn').EditTransform } transform 
 * @param { string? } group
 * @param { any[]? } message
 */
const editPage = async ( page, transform, group, ...message ) => {
  await page.edit( transform )
  logx( group, ...message )
}

/**
 * 
 * @param { import('mwn').Mwn } bot
 * @param { number | string } job
 * @param { number } newStatus
 * @param { * } message
 */
const updateJobStatus = async ( bot, job, newStatus ) => {
  /** @type { import('mwn').MwnPage } */
  const page = new bot.Page( `User:LuciferianBot/task/${job}/info.json` )
  const wikitext = await page.text()

  /** @type { { brfa?: number, taskDesc: string, auto: number, freq: string, approval?: string, using?: string, status: number, lastRan: string | null, lastCompleted: string | null } } */
  const info = JSON.parse( wikitext );
  if ( info.status != 2 && newStatus == 2 )
    info.lastRan = new Date().toISOString();
  if ( info.status != 1 && newStatus == 1 )
    info.lastCompleted = new Date().toISOString();
  info.status = newStatus;

  editPage( page, ( { content: old_content } ) => {
    return { 
      text: JSON.stringify( info ),
      summary: `更新運行狀態`
    }
  }, "MAIN", `更新任務${job}運行狀態` )
}

/**
 * 
 * @param { string } sig 
 * @returns { Signature }
 */
const parseSignature = sig => {

  const sigRgx = /(\[\[\:?(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)([^|\]\/#]+)(?:.(?!\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)(?:[^|\]\/#]+)))*? ((\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d{2}):(\d{2}) \(UTC\)))/i

  /**
   * @type { string[] }
   */
  const [ _a, _b, user, full, year, m, d, hour, min ] = sig.match( sigRgx );

  const month = `0${ m }`.slice( -2 );
  const day   = `0${ d }`.slice( -2 );

  return {
    user: capitalize( user ),
    timestamp: new Date( `${ year }-${ month }-${ day }T${ hour }:${ min }:00+00:00` ),
    sigtext: full,
  }

}

/**
 * 
 * @param { Section[] } arr 
 * @returns { Section[] }
 */
const concatenateSections = ( arr ) => {
  // Find the indices of elements where level <= 2
  const mainIndices = arr
    .map((item, index) => (item.level <= 2 ? index : -1))
    .filter(index => index !== -1);

  // Iterate through the array and concatenate content
  mainIndices.forEach((mainIndex, idx) => {
    let nextMainIndex = mainIndices[idx + 1] || arr.length;

    for (let i = mainIndex + 1; i < nextMainIndex; i++) {
      if (arr[i].level >= 3) {
        arr[mainIndex].content += arr[i].content;
      }
    }
  });

  return arr;
}

/**
 * 
 * @param { Promise<any> } resolvable 
 */
const trycatch = async ( resolvable ) => {
  try {
    await resolvable
  }
  catch (err) {
    log( `[ERR] ${err}` )
  }
}


export {
  time,
  capitalize,
  $,
  sigRgx,
  log,
  logx,
  editPage,
  pruneLogs,
  parseSignature,
  concatenateSections,
  updateJobStatus,
  trycatch
}