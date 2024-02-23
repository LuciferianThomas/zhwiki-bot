import { Mwn } from 'mwn';
import moment from 'moment';
import { select as wselect } from 'weighted';

import { time, capitalize, log } from '../fn.mjs';
import { CDB, hash } from '../db.mjs'

const frsRecord = new CDB( 'FRS' )
// if ( !frsRecord.get( 'record' ) ) frsRecord.set( 'record', {} );

/**
 * 
 * @param { Mwn } bot 
 */
const getList = async ( bot ) => {
  log( `[FRS] 正在獲取通知登記表` )

  const page = new bot.Page( "Wikipedia:回饋請求服務" )
  const text = ( await page.text() ).split( "<!-- FRS-BOT-START-MARK -->" )[1]
  const lines = text.split( /\n/g )
  const list = {}
  
  const sectionRgx = /===<!--rfc:(.+?)-->.+?===/
  const sections = lines.filter( line => sectionRgx.test( line ) ).map( line => lines.indexOf( line ) )
  for ( let i = 0; i < sections.length; i++ ) {
    const sect = lines[ sections[ i ] ].match( sectionRgx )[1];
    const slist = list[ sect ] = {};
    for ( let n = sections[ i ] + 1; n < ( sections[ i + 1 ] ?? lines.length ); n++ ) {
      let [ t, user, limit ] = lines[ n ].split( /\|/g )
      if ( !/frs[ _]user/i.test( t ) ) continue;
      limit = parseInt( limit.replace( /}}.*/g, "" ).replace( /[^\d]/g, "" ) )
      slist[ user ] = limit;
    }
  }
  return list;
}

const getCleanRecords = ( list ) => {
  const records = frsRecord.get( list ) ?? {};
  for ( const user in records ) {
    records[ user ] = records[ user ].filter(
      date => Math.abs( moment( date ).diff( moment(), 'days' ) ) <= 30
    )
  }
  frsRecord.set( list, records )
  return records;
}

const getArbitraryUsers = ( subsc, list, lim ) => {
  const curList = subsc[ list ];
  for ( const uInAll in subsc.all ) {
    curList[ uInAll ] = ( curList[ uInAll ] ?? 0 ) + subsc.all[ uInAll ]
  }
  if ( !curList ) return [];
  const count = Object.keys( curList ).length;
  log( `[FRS] 訂閱列表 ${ list } 上找到 ${ count } 個用戶`)
  if ( count == 0 ) return [];
  if ( count == 1 ) return Object.keys( curList );
  const target = lim ?? Math.max( Math.round( Math.random() * count ), 1 );
  log( `[FRS] 　　將會在訂閱列表 ${ list } 中選擇 ${ target } 個用戶`)

  const records = getCleanRecords( list );
  const subAll  = getCleanRecords( "all" );

  const users = []
  while ( users.length < target ) {
    const selected = wselect( curList );

    const notOnSingleList =
      Object.keys( subsc.all ).includes( selected )
      && ( !Object.keys( subsc[ list ] ).includes( selected )
      || records[ selected ].length >= subsc[ list ][ selected ] );

    let selRec = ( notOnSingleList ? subAll : records )[ selected ];
    if ( !selRec ) selRec = ( notOnSingleList ? subAll : records )[ selected ] = [];

    if ( selRec.length < ( notOnSingleList ? subAll : records )[ selected ] ) {
      users.push( selected );
      selRec.push( moment().toISOString() );
      log( `[FRS] 　　已選擇 ${ selected } （${ selRec.length }／${ curList[ selected ] }）`)
    }
    curList[ selected ] = 0;

    if ( !Object.values( curList ).reduce( ( a, b ) => a + b, 0 ) ) {
      log( `[FRS] 　　沒有用戶可以選擇了！`)
      break;
    }
  }
  frsRecord.set( list, records )
  frsRecord.set( "all", subAll )
  return users;
}

const sendToList = async ( bot, rfc, sendlist ) => {
  // TODO
  return;

}

/**
 * 
 * @param { Mwn } bot
 * @param { import('../rfc/update.mjs').RfcObj } rfc
 */
export default async ( bot, rfc ) => {
  log( `[FRS] 為 ${ rfc.page } 的RFC發送FRS通告` )
  
  const subsc = await getList( bot )
  for ( const list of rfc.cats ) {
    const sendlist = getArbitraryUsers( subsc, list )
    console.log( sendlist )
    await sendToList( bot, rfc, sendlist )
  }
}