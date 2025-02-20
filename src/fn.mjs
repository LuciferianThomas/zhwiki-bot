import moment from 'moment';
import jquery from 'jquery';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import url from 'url';

import { hash } from './db.mjs'
import { Mwn } from 'mwn';

/**
 * @typedef { import('mwn/build/wikitext').Section  } Section
 * @typedef { import('mwn/build/wikitext').Template } Template
 * @typedef { import('mwn').MwnWikitext } MwnWikitext
 * @typedef { import('mwn/build/api_params').ApiEditPageParams } ApiEditPageParams
 * @typedef { { user: string, timestamp: Date, sigtext: string } } Signature
 */

const __dirname = path.dirname( url.fileURLToPath( import.meta.url ) );
const logpath = path.join(__dirname, "..", "logs" );

export const sigRgx = /\[\[:?(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)([^|\]\/#]+)(?:.(?!\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)(?:[^|\]\/#]+)))*? (\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d{2}):(\d{2}) \(UTC\)(?:\[\[special:diff\/\d+\|加入\]\]。<\/span>)?/i

export const time = ( date = moment(), format = "YYYY-MM-DD HH:mm" ) => {
  return moment( date ).utcOffset( 8 ).format( format )
}

/**
 * 
 * @param { string } s 
 * @returns 
 */
export const capitalize = s => {
  if ( typeof s !== 'string' ) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const win = new ( JSDOM )( '' ).window
export const $ = jquery( win, true )

/**
 * 
 * @param { any[] } message 
 */
export const log = ( ...message ) => {
  return logx( "MAIN", ...message )
}
/**
 * 
 * @param { string } group
 * @param { any[] } message 
 */
export const logx = ( group, ...message ) => {
  console.log( `[${ group }]`, ...message );
  fs.appendFile( path.join( logpath, `debug-${ time( moment(), "YYYYMMDD" ) }-${group.toUpperCase()}.log` ), `${ time() } | ${ message.map( m => ( typeof m !== 'string' ? JSON.stringify( m ) : m ) ).join(' ').replace( /\n/g, '\n' + ( ' '.repeat(19) ) ) }\n`, ( e ) => {
    if ( e ) return;
  } )
}

/**
 * 
 */
export const pruneLogs = () => {
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
 * @param { Mwn } bot
 * @param { import('mwn').MwnPage } page 
 * @param { ( rev: { content: string, timestamp: string} ) => ApiEditPageParams } transform 
 * @param { string? } group
 * @param { any[]? } message
 */
export const editPage = async ( bot, page, transform, group, ...message ) => {
  let _transform = transform
  if ( typeof transform === 'function' ) {
    _transform = ( { content, timestamp } ) => {
      return Object.assign(
        transform( { content, timestamp } ),
        { bot: true }
      )
    };
  }

  if ( await page.exists() ) {
    await page.edit( _transform )
  }
  else {
    const { text, summary, ...options } = _transform( { content: '' } )
    await bot.create( page.getPrefixedText(), text, summary, options );
  }
  logx( group, ...message )
}

/**
 * 
 * @param { import('mwn').Mwn } bot
 * @param { number | string } job
 * @param { number } newStatus
 * @param { * } message
 */
export const updateJobStatus = async ( bot, job, newStatus ) => {
  if ( newStatus > 1 ) return;

  /** @type { import('mwn').MwnPage } */
  const page = new bot.Page( `User:LuciferianBot/task/${job}/info.json` )
  const wikitext = await page.text()

  /** @type { { brfa?: number, taskDesc: string, auto: number, freq: string, approval?: string, using?: string, status: number, lastRan: string | null, lastCompleted: string | null } } */
  const info = JSON.parse( wikitext );
  // if ( info.status != 2 && newStatus == 2 )
  //   info.lastRan = new Date().toISOString();
  if ( /** info.status != 1 && **/ newStatus == 1 )
    info.lastCompleted = new Date().toISOString();
  info.status = newStatus;

  editPage( bot, page, ( { content: old_content } ) => {
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
export const parseSignature = sig => {

  const sigRgx = /(\[\[\:?(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)([^|\]\/#]+)(?:.(?!\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)(?:[^|\]\/#]+)))*? ((\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d{2}):(\d{2}) \(UTC\)))(?:\[\[special:diff\/\d+\|加入\]\]。<\/span>)?/i

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
 * Custom function to parse sections in Wikitext, throwing out section markers within templates.
 * @param { MwnWikitext } wikitext 
 */
export const parseSections = ( wikitext ) => {

  wikitext.unbind();
  wikitext.parseTemplates();

  let idx = 0;

  wikitext.templates.forEach( t => {
    const text_hash = hash( t.wikitext );
    t.hash = text_hash;
    wikitext.text = wikitext.text.replace(
      t.wikitext, `<!-- ###TEMPLATE_${ text_hash }### -->`
    );
  } )

  const _wikitext = new (new Mwn().Wikitext)( wikitext.text )
  _wikitext.unbind();
  _wikitext.parseSections();

  let sectIdx = 0;
  _wikitext.sections.forEach( s => {
    const extractedTemplates = s.content.match( /<!-- ###TEMPLATE_(.+?)### -->/g ) || []
    if ( !extractedTemplates.length ) return;
    for ( const template of extractedTemplates ) {
      const text_hash = template.match( /<!-- ###TEMPLATE_(.+?)### -->/ )[1]
      s.content = s.content.replace(
        template, wikitext.templates.find( t => t.hash == text_hash ).wikitext
      )
    }
    s.index = sectIdx;
    sectIdx += s.content.length;
  } )

  return _wikitext.sections;

}

/**
 * 
 * @param { Section[] } arr 
 * @param { number? } level
 * @returns { Section[] }
 */
export const groupSections = ( arr, level = 2 ) => {
  // Find the indices of elements where level <= 2
  const mainIndices = arr
    .map( ( item, index ) => ( item.level <= 2 ? index : -1 ) )
    .filter( index => index !== -1 );

  // Iterate through the array and concatenate content
  mainIndices.forEach( ( mainIndex, idx ) => {
    let nextMainIndex = mainIndices[ idx + 1 ] || arr.length;

    for ( let i = mainIndex + 1; i < nextMainIndex; i++ ) {
      if ( arr[i].level > level ) {
        arr[ mainIndex ].content += arr[i].content;
      }
    }
  });

  return arr;
}

/**
 * 
 * @param { Promise<any> } resolvable 
 */
export const trycatch = async ( resolvable ) => {
  try {
    await resolvable
  }
  catch (err) {
    log( `[ERR] ${err}` )
  }
}