import { Mwn } from 'mwn';
import moment from 'moment';

import { time, capitalize, log } from '../fn.mjs';
import { CDB, hash } from '../db.mjs'

const rfcData = new CDB( 'RFC' )

import crypto from 'node:crypto'

import sendFrs from '../frs/send.mjs'

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
  log( `[RFC] 正在查詢進行中討論` )
  const cat = await bot.getPagesInCategory( '維基百科徵求意見', { cmtype: 'page' } )
  // console.log( cat )
  log( `[RFC] 　　找到 ${ cat.length } 個進行中討論` )
  let rfcs = []
  for ( var page of cat ) {
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
  let page = new bot.Page( `${ title }` )
  log( `[RFC] 正在獲取 ${ title } 的討論記錄` )
  let wikitext = await page.text()

  /** @type { RfcArr } */
  let rfcs = [];
  try {
    const rgx = /(\{\{ ?rfc(?:[ _]subpage)?[^\}]*?)(\}\})((?:.|\n)+?\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)[^|\]\/#]+(?:.(?!\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)(?:[^|\]\/#]+)))*? (\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d{2}):(\d{2}) \(UTC\)\s*?(?:\n|$))/i
    const rgxg = new RegExp( rgx.source, rgx.flags + 'g' )
    let rfcQs = wikitext.match( rgxg ) || []
    
    for ( const rfcQ of rfcQs ) {
      const lede = rfcQ.replace( rgx, "$3" ).trim()

      let p = /\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)([^|\]\/#]+)(?:.(?!\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)(?:[^|\]\/#]+)))*? ((\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d{2}):(\d{2}) \(UTC\))/i
      let signatures = ( wikitext.split(/(^|\n)==[^=].+?[^=]==\n/g).find( x => rgx.test(x) ).match( new RegExp( p.source, p.flags + "g" ) ) || [] ).map( sig => {
        // console.log( sig.match( p ) )
        let [ _, user, full, year, month, day, hour, min ] = sig.match( p )
        // user = user.split(/\//g)[0]
        if ( month.length == 1 ) month = "0" + month
        if (   day.length == 1 )   day = "0" + day
        return {
          user: capitalize( user ),
          timestamp: new Date( `${ year }-${ month }-${ day }T${ hour }:${ min }:00+00:00` ),
          sigtext: full,
        }
      } )
      // console.log( signatures )
      const lede_sig = ( () => {
        let [ _, user, full, year, month, day, hour, min ] = lede.match( p )
        if ( month.length == 1 ) month = "0" + month
        if (   day.length == 1 )   day = "0" + day
        return {
          user: capitalize( user ),
          timestamp: new Date( `${ year }-${ month }-${ day }T${ hour }:${ min }:00+00:00` ),
          sigtext: full,
        }
      } )()
      const last_comment = signatures.sort( ( a, b ) => {
        return b.timestamp - a.timestamp
      } )[0];
      if ( Math.abs( moment().diff(moment(last_comment.timestamp), 'days') ) > 30 ) {
        editPageSync( page, ( { content: old_content } ) => {
          return { 
            text: old_content.replace( rgx, `$3` ),
            summary: `[[Wikipedia:机器人/申请/LuciferianBot/5|機械人（測試）]]：移除不活躍討論的RFC模板`
          }
        }, `[RFC] 已移除 ${ title } 一則不活躍徵求意見` )
        continue;
      }


      let rfcId = rfcQ.match( /\{\{ ?rfc(?:[ _]subpage)?[^\}]+rfcid *?= *?([^ }]+)[^\}]*\}\}/i )
      let rfcQm = rfcQ.match( rgx )

      let frs = title.endsWith( '沙盒' ) ? true : false;

      if ( !rfcId ) {
        rfcId = hash( `${ rfcQm[4] }${ rfcQm[5].length == 1 ? '0' : '' }${ rfcQm[5] }${ rfcQm[6].length == 1 ? '0' : '' }${ rfcQm[6] }${ rfcQm[7] }${ rfcQm[8] }${ title }` )

        await editPage( page, ( { content: old_content } ) => {
          // console.log( old_content )
          let section = old_content.split(/(^|\n)==[^=].+?[^=]==\n/g)
            .find( s => {
              let m = s.match( rgx )
              if ( !m ) return false;
              let t = m[1]
              if ( !/rfcid/.test( t ) ) return true;
              else return false;
            } )
          let new_section = section.replace( rgx, `$1|rfcid=${rfcId}$2$3` )
          return { 
            text: old_content.replace( section, new_section ),
            summary: `[[Wikipedia:机器人/申请/LuciferianBot/5|機械人（測試）]]：更新RFC模板`
          }
        }, `[RFC] 已為 ${ title } 一則徵求意見添加ID` )
        frs = true;
      }
      else rfcId = rfcId[1];

      wikitext = await page.text()
      const _c = wikitext.split( /(?:(?:^|\n)==(?!=)([^\n]+)==(?!=)\n)/ );
      const _i = _c.findIndex( _ => _.includes( `rfcid=${rfcId}` ) );
      // console.log( _c, _i, _c[ _i ], _c[ _i - 1 ] )
      const section = _c[ _i - 1 ].replace( /\[\[(?:[^\|\]]+\|)?([^\]]+)\]\]/g, "$1" ).trim();
      log( `[RFC] 　　討論標題：${ section }` )

      const cats = getCatsFromTemplate( rfcQ );
      log( `[RFC] 　　分類：${ cats }` )
      rfcs.push( {
        page: title,
        section,
        cats,
        lede,
        id  : rfcId,
        last: last_comment,
        lede_sig,
        frs
      } )
    }
  }
  catch ( err ) {
    /** DO NOTHING for erratic talk pages */
    log( `[RFC] 未能正常讀取該頁：` + err )
    console.error( err )
  }
  return rfcs;
}


const getCatsFromTemplate = ( wt ) => {
  let rfcTemplate = wt.match( /\{\{ ?rfc(?:[ _]subpage)? ?\| ?(.+?)\}\}/i )
  if ( !rfcTemplate || !rfcTemplate[1] ) return "未能辨識狀態";
  else {
    const cats = rfcTemplate[1].split( /\|/g ).map( x => x.trim() );
    const valcats = cats.filter( cat => Object.keys( rfcLists ).includes( cat ) );
    if ( !valcats || !valcats.length ) return [ 'unsorted' ];
    else return valcats;
  }
}

/**
 * 
 * @param { import('mwn').MwnPage } page 
 * @param { import('mwn').EditTransform } transform 
 * @param { * } message
 */
const editPage = async ( page, transform, message ) => {
  await page.edit( transform )
  log( message )
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
      rfcListWt += `[[${ rfc.page }#rfc_${ rfc.id }|${ rfc.page } § <strong style="font-size:115%;">${ rfc.section }</strong>]]\n{{rfcquote|text=<nowiki/>\n${ rfc.lede }}}\n`
    }
    rfcListWt += `{{RFC list footer|${rfcList}|hide_instructions={{{hide_instructions}}} }}`
    let rfcListPage = new bot.Page( `${ RFC_LISTS_ROOT }${ rfcLists[ rfcList ] }` )
    const oldText = await rfcListPage.text();
    if ( oldText == rfcListWt ) {
      log( `[RFC] ${ RFC_LISTS_ROOT }${ rfcLists[ rfcList ] }無需更新（${ relatedRfcs.length }個活躍討論）` )
      continue;
    }
    await rfcListPage.edit( ( { content: old_content } ) => {
      return {
        text: rfcListWt,
        summary: `[[Wikipedia:机器人/申请/LuciferianBot/5|機械人（測試）]]：更新RFC列表頁（${ relatedRfcs.length }個活躍討論）`
      }
    } )
    log( `[RFC] 已更新 ${ RFC_LISTS_ROOT }${ rfcLists[ rfcList ] }（${ relatedRfcs.length }個活躍討論）`)
  }
  return;
}

/**
 * 
 * @param { Mwn } bot 
 */
export default async ( bot ) => {
  rfcData.set( "working", true )
  const rfcs = await getRfcs( bot )
  await editLists( bot, rfcs )
  log( `[RFC] 已完成更新所有RFC列表頁` )
  const rfc2frs = rfcs.filter( rfc => rfc.frs )
  console.log( rfc2frs )
  for ( const rfc of rfc2frs ) {
    await sendFrs( bot, rfc )
  }
  rfcData.set( "working", false )
}