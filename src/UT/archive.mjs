import { Mwn } from "mwn";
import moment from "moment";

import { time, capitalize, log, logx, trycatch, updateJobStatus, parseSignature, editPage, groupSections, parseSections, sigRgx } from '../fn.mjs';

/**
 * 
 * @param { Mwn } bot 
 */
const main = async ( bot ) => {
  let page = new bot.Page( `User talk:LuciferianThomas` )
  logx( "UT", `正在獲取 User talk:LuciferianThomas 的資訊` )

  const _wikitext = await page.text()

  const wikitext = new bot.Wikitext( _wikitext );
  wikitext.unbind();

  const _sections = parseSections( wikitext )
  const _sections_all = groupSections( _sections )
  const sections = _sections_all.filter( x => x.level == 2 )

  // console.log( sections )
  // console.log( '*****************' )

  let newWikitext = _sections_all.find( x => x.level == 1 ).content
    , newArchive  = ""
    , cnt = 0;

  for ( const section of sections ) {

    let last_comment = null;

    try {
      logx( "UT", `正在分析「${ section.header }」章節` )
        
      logx( "UT", "　　正在找出最後留言之用戶" )
      
      /** @type { string[] } */
      let _signatures = ( section.content.match( new RegExp( sigRgx.source, sigRgx.flags + "g" ) ) || [] )
      /** @type { import('../fn.mjs').Signature[] } */
      let signatures = _signatures.map( sig => parseSignature( sig ) )
      
      last_comment = signatures.sort( ( a, b ) => {
        return b.timestamp - a.timestamp
      } )[0];
    }
    catch ( error ) {
      logx( "UT", `[ERR] 在獲取 User talk:LuciferianThomas#${ section.header } 的資訊時遇到錯誤` )
      console.log( error )
    }

    if ( !last_comment ) continue;

    if ( Math.abs( moment().diff( moment( last_comment.timestamp ), 'days' ) ) > 10 ) {
      newArchive += section.content;
      cnt++;
      logx( "UT", "　　存檔" )
    }
    else {
      newWikitext += section.content;
      logx( "UT", "　　保留" )
    }

  }

  const archivePage = new bot.Page(
    `User talk:LuciferianThomas/存檔/${ moment().year() }/${ moment().quarter() }`
  );

  await editPage( bot, archivePage, ( { content: old_content } ) => {
    return {
      text: ( old_content || '{{talk archive|User talk:LuciferianThomas}}' ) + '\n' + newArchive,
      summary: `[[User:LuciferianBot/task/9|機械人]]：存檔用戶討論頁${ cnt }則討論串`
    }
  }, "UT", "Archived contents from talk page." )

  await editPage( bot, page, () => {
    return {
      text: newWikitext,
      summary: `[[User:LuciferianBot/task/9|機械人]]：存檔用戶討論頁${ cnt }則討論串`
    }
  }, "UT", "Removed archived contents from talk page." )
}


/**
 * @param { Mwn } bot
 */
export default async ( bot ) => {

  await trycatch( updateJobStatus( bot, 9, 2 ) )

  try {
    await main( bot )
  }
  catch ( error ) {
    logx( "UT", `[ERR] ${ error }` )
    console.error( error )
    await trycatch( updateJobStatus( bot, 9, 0 ) )
    return;
  }

  await trycatch( updateJobStatus( bot, 9, 1 ) )

}