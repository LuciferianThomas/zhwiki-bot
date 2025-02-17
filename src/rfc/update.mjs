import { Mwn } from 'mwn';
import moment from 'moment';
import { convert as html2Text } from 'html-to-text';

import { time, capitalize, $, log, logx, editPage, parseSignature, concatenateSections, trycatch, updateJobStatus } from '../fn.mjs';
import { CDB, hash } from '../db.mjs'

import sendFrs from '../FRS/send.mjs'

/**
 * @typedef { { title: string, section: string, signatures: string[], rfc?: boolean } } TalkIndexEntry
 */

const RFC = new CDB( 'RFC' )


/**
 * @typedef { { user: string, timestamp: Date, sigtext: string } } SigObj
 * @typedef { { page: string, section: string, cats: string[], lede: string, id: string, lede_sig: SigObj, last: SigObj, frs: boolean } } RfcObj
 * @typedef { RfcObj[] } RfcArr
 */


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
 */
const getRfcs = async ( bot ) => {
  logx( "RFC", `正在查詢進行中討論` )
  const cat = await bot.getPagesInCategory( '維基百科徵求意見', { cmtype: 'page' } )
  // console.log( cat )
  logx( "RFC", `　　找到 ${ cat.length } 個進行中討論` )
  let rfcs = []
  for ( const page of cat ) {

    // if ( page.startsWith( 'Wikipedia:徵求意見/' ) ) continue;

    let rfc = await getRfcDetails( bot, page )
    rfcs.push( ...rfc.filter( _rfc => _rfc.cats != '未能辨識狀態' ) )

  }
  return rfcs
}

/**
 * 
 * @param { Mwn } bot 
 * @param { string } title 
 * @returns { Promise< RfcArr > }
 */
const getRfcDetails = async ( bot, title ) => {
  /** @type { RfcArr } */
  const rfcs = [];

  try {

    const page = new bot.Page( `${ title }` )
    logx( "RFC", `正在獲取 ${ title } 的討論記錄` )

    const wikitext = new bot.Wikitext( await page.text() )
    wikitext.unbind();

    const _sections = wikitext.parseSections();
    _sections[0].header = 'top';

    const sections = concatenateSections( _sections )

    const rfcRgx = /(\{\{ ?(?:rfc(?:[ _]subpage)?|徵求意見|征求意见)[^\}]*?)(\}\})((?:.|\n)+?)/i
    const sigRgx = /(\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)([^|\]\/#]+)(?:.(?!\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)(?:[^|\]\/#]+)))*? ((\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d{2}):(\d{2}) \(UTC\)))/i
    const sufRgx = /(\s*?(?:\n|\{\{RMCategory[^\}]\}\}|$))/i

    const rgx = new RegExp( [ rfcRgx, sigRgx, sufRgx ].map( x => x.source ).join(''), 'i' )
    
    const rfcSections = sections.filter( s => s.level <= 2 && rgx.test( s.content ) )

    for ( const rfcQ of rfcSections ) {

      const match = rfcQ.content.match( rgx )
      
      const lede = [ 3, 4, 12 ].map( x => match[x] ).join( '' )

      /**
       * @type { RegExpMatchArray }
       */
      const _signatures = ( rfcQ.content.match( new RegExp( sigRgx.source, 'gi' ) ) ?? [] );
      const signatures = _signatures.map( parseSignature );
      
      const lastComment = signatures.sort( ( a, b ) => {
        return b.timestamp - a.timestamp
      } )[0];

      const _sectionHeader = await new bot.Wikitext( `== ${ rfcQ.header } ==` ?? '' )
      .apiParse( { prop: 'text' } )

      const section = decodeURIComponent(
        (
          $( _sectionHeader ).find( '.mw-heading > h2 > span' ).get(0)
          ?? $( _sectionHeader ).find( '.mw-heading > h2' ).get(0)
        ).id
          .replace( /\.([0-9A-F]{2})/g, "%$1" ).replace( /_/g, " " )
      )
      
      logx( "RFC", `　　討論標題：${ section }` )

      const lede_sig = parseSignature( lede )

      const rfcTemplate = new bot.Wikitext( rfcQ.content ).parseTemplates( {
        namePredicate: str => /^rfc(?:[ _]subpage)?$/i.test( str )
      } )[0]

      let frs = title.endsWith( '沙盒' ) ? true : false;

      const hasId = !!rfcTemplate.getParam( 'rfcid' );
      const rfcId = rfcTemplate.getValue( 'rfcid' ) ?? hash( 
        `${ match[7] }${ `0${match[8]}`.slice(-2) }${ `0${match[9]}`.slice(-2)
        }${ match[10] }${ match[11] }${ title }`
      );

      if ( Math.abs( moment().diff( moment( lastComment.timestamp ), 'days' ) ) > 30 ) {
        editPage( page, ( { content: old_content } ) => {
          return { 
            text: old_content.replace( rgx, `{{subst:anchor|rfc_${ rfcId }}}$3$4$12` ),
            summary: `[[Wikipedia:机器人/申请/LuciferianBot/5|機械人]]：移除不活躍討論的RFC模板`
          }
        }, "RFC", `已移除 ${ title } 一則不活躍徵求意見` )
        continue;
      }

      if ( !hasId ) {

        logx( "RFC", `　　需要增加RFC ID` )

        await editPage( page, ( { content: oldContent } ) => {        
          const temp = `${ rfcQ.content }`

          rfcQ.content = rfcQ.content.replace( rgx, `$1|rfcid=${rfcId}$2$3$4$12` )
          return { 
            text: oldContent.replace( temp, rfcQ.content ),
            summary: `[[Wikipedia:机器人/申请/LuciferianBot/5|機械人]]：更新RFC模板`
          }
          
        }, "RFC", `已為 ${ title } 一則徵求意見添加ID` );

        frs = true;

      }

      const cats = getCatsFromTemplate( rfcTemplate );
      logx( "RFC", `　　分類：${ cats }` )

      rfcs.push( {
        page: title,
        section,
        cats, lede,
        id  : rfcId,
        last: lastComment,
        lede_sig, frs
      } )

    }
  }
  catch ( err ) {
    /** DO NOTHING for erratic talk pages */
    logx( "RFC", `未能正常讀取該頁：` + err )
    console.error( err )
  }
  
  return rfcs;
}

/**
 * 
 * @param { Template } rfcTemplate 
 * @returns { string[] }
 */
const getCatsFromTemplate = ( rfcTemplate ) => {

  const cats = [1,2,3].map( x => ( rfcTemplate.getValue( x ) ?? '' ).trim() );
  const valcats = cats.filter( cat => !!cat && Object.keys( rfcLists ).includes( cat ) );
  
  if ( !valcats || !valcats.length ) return [ 'unsorted' ];
  else return valcats;
}

/**
 * 
 * @param { Mwn } bot 
 * @param { RfcArr } rfcs
 */
const editLists = async ( bot, rfcs ) => {
  const RFC_LISTS_ROOT = 'Wikipedia:徵求意見/'

  for ( const rfcList of Object.keys( rfcLists ) ) {
    const relatedRfcs = rfcs.filter( rfc => rfc.cats.includes( rfcList ) ).sort( ( a, b ) => a.lede_sig.timestamp - b.lede_sig.timestamp )
    let rfcListWt = `<noinclude>\n{{rfclistintro}}\n</noinclude>\n`
    if ( !relatedRfcs.length ) rfcListWt += "目前此主題無正在討論的議題"
    for ( const rfc of relatedRfcs ) {
      rfcListWt += `[[${ rfc.page }#rfc_${ rfc.id }|${ rfc.page } § <strong style="font-size:115%;">${ rfc.section }</strong>]]\<div class="cquote mw-notalk" style="padding-left:30px;">\n${ rfc.lede }</div>\n`
    }
    rfcListWt += `{{RFC list footer|${rfcList}|hide_instructions={{{hide_instructions}}} }}`
    let rfcListPage = new bot.Page( `${ RFC_LISTS_ROOT }${ rfcLists[ rfcList ] }` )
    const oldText = await rfcListPage.text();
    if ( oldText == rfcListWt ) {
      logx( "RFC", `${ RFC_LISTS_ROOT }${ rfcLists[ rfcList ] }無需更新（${ relatedRfcs.length }個活躍討論）` )
      continue;
    }
    await editPage( rfcListPage, () => {
      return {
        text: rfcListWt,
        summary: `[[Wikipedia:机器人/申请/LuciferianBot/5|機械人]]：更新RFC列表頁（${ relatedRfcs.length }個活躍討論）`
      }
    }, "RFC", `已更新 ${ RFC_LISTS_ROOT }${ rfcLists[ rfcList ] }（${ relatedRfcs.length }個活躍討論）`)
  }
  return;
}

/**
 * 
 * @param { Mwn } bot 
 */
export default async ( bot ) => {

  let lu = RFC.get( "working" )
  if ( moment( lu ).add( 10, 'minutes' ) < moment() )
    RFC.set( ( lu = false ) )
  if ( lu ) return;

  RFC.set( "working", moment().toISOString() )

  await trycatch( updateJobStatus( bot, 5, 2 ) )

  try {

    const rfcs = await getRfcs( bot )
    await editLists( bot, rfcs )

    logx( "RFC", `已完成更新所有RFC列表頁` )
    await trycatch( updateJobStatus( bot, 5, 1 ) )

    const rfc2frs = rfcs.filter( rfc => rfc.frs )
    console.log( rfc2frs )
    for ( const rfc of rfc2frs ) {
      await sendFrs( bot, rfc )
    }
    RFC.set( "working", false )

  }
  catch ( e ) {
    logx( "RFC", `[ERR] ${ e }` )
    console.trace( e )
    RFC.set( "working", false )
    await trycatch( updateJobStatus( bot, 5, 0 ) )
    return;
  }

}