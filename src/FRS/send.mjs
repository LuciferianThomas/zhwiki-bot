import { Mwn } from 'mwn';
import moment from 'moment';
import { select as wselect } from 'weighted';

import { time, capitalize, log, logx, trycatch, updateJobStatus } from '../fn.mjs';
import { CDB, hash } from '../db.mjs'

const frsRecord = new CDB( 'FRS' )
// if ( !frsRecord.get( 'record' ) ) frsRecord.set( 'record', {} );

/**
 * @typedef { { [ user: string ]: number } } frsList
 * @typedef { { [ list: string ]: frsList } } frsSubsc
 */

/**
 * 
 * @param { Mwn } bot 
 * @returns { Promise< frsSubsc > }
 */
const getList = async ( bot ) => {
  logx( "FRS", `正在獲取通知登記表` )

  const page = new bot.Page( "Wikipedia:回饋請求服務" )
  const text = ( await page.text() ).split( "<!-- FRS-BOT-START-MARK -->" )[1]
  const lines = text.split( /\n/g )
  const list = {}
  
  const sectionRgx = /=== ?<!--rfc:(.+?)-->.+? ?===/
  const sections = lines.filter( line => sectionRgx.test( line ) ).map( line => lines.indexOf( line ) )
  console.log( sections )
  for ( let i = 0; i < sections.length; i++ ) {
    const sect = lines[ sections[ i ] ].match( sectionRgx )[1];
    const slist = list[ sect ] = {};
    for ( let n = sections[ i ] + 1; n < ( sections[ i + 1 ] ?? lines.length ); n++ ) {
      if ( /<!--/.test( lines[n] ) ) continue;
      let [ t, user, limit ] = lines[ n ].split( /\|/g )
      if ( !/frs[ _]user/i.test( t ) ) continue;
      if ( !limit ) limit = "1";
      limit = parseInt( limit.replace( /}}.*/g, "" ).replace( /[^\d]/g, "" ) )
      slist[ user ] = limit;
    }
  }
  return list;
}

/**
 * @typedef { { [ user: string ]: string } } frsRecords
 */
/**
 * 
 * @param { string } list 
 * @returns { frsRecords }
 */
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

/**
 * 
 * @param { import('../RFC/update.mjs').RfcObj } rfc 
 * @param { frsSubsc } subsc 
 * @param { string } list 
 * @param { number? } lim 
 * @returns 
 */
const getArbitraryUsers = ( rfc, subsc, list, lim ) => {
  const curList = subsc[ list ];
  for ( const uInAll in subsc.all ) {
    curList[ uInAll ] = ( curList[ uInAll ] ?? 0 ) + subsc.all[ uInAll ]
  }
  if ( !curList ) return [];

  const infList = [];
  for ( const u in curList ) {
    if ( curList[ u ] == 0 ) {
      curList[ u ] = 100;
      infList.push( u )
    }
    console.log( infList )
  }

  const count = Object.keys( curList ).length;
  logx( "FRS", `訂閱列表 ${ list } 上找到 ${ count } 個用戶`)
  if ( count == 0 ) return [];
  const target = lim ?? Math.max( Math.round( Math.random() * count ), Math.round( count / 2 ) );
  logx( "FRS", `　　將會在訂閱列表 ${ list } 中選擇 ${ target } 個用戶`)

  const records = getCleanRecords( list );
  const subAll  = getCleanRecords( "all" );
  if ( !frsRecord.get( rfc.id ) ) frsRecord.set( rfc.id, [] )
  const frsRfc  = frsRecord.get( rfc.id );

  const users = []
  while ( users.length < target ) {
    /**  */
    const selected = wselect( curList );

    const notOnSingleList =
      Object.keys( subsc.all ).includes( selected )
      && ( !Object.keys( subsc[ list ] ).includes( selected )
      || ( records[ selected ]?.length ?? 0 ) >= subsc[ list ][ selected ] );

    let selRec = ( notOnSingleList ? subAll : records )[ selected ];
    if ( !selRec ) selRec = ( notOnSingleList ? subAll : records )[ selected ] = [];

    logx( "FRS", `　　${ selected } （${ selRec.length }／${ curList[ selected ] }）`)
    if (
      ( infList.includes( selected )
        || selRec.length < curList[ selected ] )
      && !frsRfc.includes( selected )
      && rfc.lede_sig.user !== selected
    ) {
      users.push( selected );
      selRec.push( moment().toISOString() );
      logx( "FRS", `　　已選擇`)
    }
    curList[ selected ] = 0;

    if ( !Object.values( curList ).reduce( ( a, b ) => a + b, 0 ) ) {
      logx( "FRS", `　　沒有用戶可以選擇了！`)
      break;
    }
  }
  frsRecord.set( list, records )
  frsRecord.set( "all", subAll )
  frsRecord.push( rfc.id, ...users )
  return users;
}

/** CC BY-SA 4.0 – https://zh.wikipedia.org/wiki/Template:Bots */
function allowBots(text, user){
  if (!new RegExp("\\{\\{\\s*(nobots|bots[^}]*)\\s*\\}\\}", "i").test(text)) return true;
  return (new RegExp("\\{\\{\\s*bots\\s*\\|\\s*deny\\s*=\\s*([^}]*,\\s*)*"+user+"\\s*(?=[,\\}])[^}]*\\s*\\}\\}", "i").test(text)) ? false : new RegExp("\\{\\{\\s*((?!nobots)|bots(\\s*\\|\\s*allow\\s*=\\s*((?!none)|([^}]*,\\s*)*"+user+"\\s*(?=[,\\}])[^}]*|all))?|bots\\s*\\|\\s*deny\\s*=\\s*(?!all)[^}]*|bots\\s*\\|\\s*optout=(?!all)[^}]*)\\s*\\}\\}", "i").test(text);
}


const rfcLists = {
  bio: '傳記',
  econ: '經濟、貿易與公司',
  hist: '歷史與地理',
  lang: '語言及語言學',
  sci: '數學、科學與科技',
  media: '媒體、藝術與建築',
  pol: '政治、政府與法律',
  reli: '宗教與哲學',
  soc: '社會、體育運動與文化',
  style: '維基百科格式與命名',
  policy: '維基百科方針與指引',
  proj: '維基專題與協作',
  tech: '維基百科技術議題與模板',
  prop: '維基百科提議',
  unsorted: '未分類'
}
/**
 * 
 * @param { Mwn } bot 
 * @param { import('../RFC/update.mjs').RfcObj } rfc 
 * @param { string } list 
 * @param { string[] } sendlist 
 * @returns 
 */
const sendToList = async ( bot, rfc, list, sendlist ) => {
  for ( const user of sendlist ) {
    const u = new bot.User( user )
    const wt = await u.talkpage.text()
    if ( !allowBots( wt, "LuciferianBot" ) ) {
      logx( "FRS", `跳過了 User talk:${ user }：用戶討論頁掛了nobots` )
      continue;
    }
    try {
      await u.talkpage.newSection(
        `討論邀請：就${ rfcLists[ list ] }主題討論徵求意見`,
        `{{subst:FRS notification|title1=${ rfc.page }|header1=${
          rfc.section.replace( /\{\{/g, '{<nowiki/>{' )
        }|type1=${ rfcLists[ list ] }|rfcid1=${ rfc.id }}}\n--{{subst:User:LuciferianBot/SPIsign}} ~~~~~`,
        { summary: `[[User:LuciferianBot/task/6|機械人]]：發送[[WP:FRS]]討論邀請`,
          sectiontitle: `討論邀請：就${ rfcLists[ list ] }主題討論徵求意見` }
      )
      logx( "FRS", `已發送訊息給 User talk:${ user }` )
    }
    catch ( err ) {
      logx( "FRS", `未能發送訊息給 User talk:${ user }：${ err }` )
    }
  }
  return;
}

/**
 * 
 * @param { Mwn } bot
 * @param { import('../RFC/update.mjs').RfcObj } rfc
 */
export default async ( bot, rfc ) => {
  logx( "FRS", `為 ${ rfc.page } 的RFC發送FRS通告` )

  await trycatch( updateJobStatus( bot, 6, 2 ) )
  
  try {

    const subsc = await getList( bot )
    console.log( subsc )
    for ( const list of rfc.cats ) {
      const sendlist = getArbitraryUsers( rfc, subsc, list )
      console.log( sendlist )
      await sendToList( bot, rfc, list, sendlist )
    }
    frsRecord.set( rfc.id, undefined )

  }
  catch ( e ) {
    logx( "FRS", `[ERR] ${ e }` )
    console.trace( e )

    await trycatch( updateJobStatus( bot, 6, 0 ) )
    return;
  }

  await updateJobStatus( bot, 6, 1 )
}