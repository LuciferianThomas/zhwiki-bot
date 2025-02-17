import { Mwn } from 'mwn'
import { convert as html2Text } from 'html-to-text';
import moment from 'moment';

import { time, capitalize, $, log, logx, editPage, parseSignature, concatenateSections, trycatch, updateJobStatus } from '../fn.mjs';
import { CDB, hash } from '../db.mjs'

const TID = new CDB( 'TID' )

/**
 * @typedef { { type: string, ns: number, title: string, comment: string, tags: string[], oldlen: number, newlen: number } } ApiRecentChangesResponseField
 * @typedef { { batchcomplete: string, continue?: { rccontinue: string, continue: string }, query: { recentchanges: ApiRecentChangesResponseField[] } } } ApiRecentChangesResponse
 * @typedef { import('../fn.mjs').Signature } Signature
 * @typedef { { title: string, section: string, signatures: Signature[], rfc?: boolean, ns: number } } TalkIndexEntry
 */

/**
 * 
 * @param { Mwn } bot 
 * @param { string } prev
 * @param { string } cutoff 
 * @returns { Promise< ApiRecentChangesResponse[] > }
 */
const fetchRecentChanges = async ( bot, prev, cutoff ) => {

  /**
   * @type { string }
   */
  let rccontinue = ''

  /**
   * @type { ApiRecentChangesResponseField[] }
   */
  const entries = [];

  do {

    /**
     * @type { ApiRecentChangesResponse }
     */
    const res = await bot.query( Object.assign( {
      action: 'query',
      list: 'recentchanges',
      rcprop: 'title|comment|tags',
      rctag: 'discussiontools-added-comment',
      rcdir: 'older',
      rcstart: cutoff,
      rcend: prev,
      rcnamespace: '1|5|7|9|11|13|15|101|103|119|829',
      rcshow: '!bot',
      rclimit: 500,
      rctype: 'edit',
      rctoponly: false,
    }, rccontinue ? { rccontinue } : {} ) )

    rccontinue = res.continue?.rccontinue;

    for ( const rcEntry of res.query.recentchanges ) {
      if (
        /为翻译页面|存廢討論|rater|评级（.+?）：|評級（.+?）：|Translated[ _]page|auto (?:invite|archive)/i
          .test( rcEntry.comment )
      ) continue;

      if ( entries.find( e => e.title == rcEntry.title ) ) continue;

      if ( rcEntry.tags.includes( 'Twinkle' ) ) continue;

      // if ( rcEntry )

      entries.push( rcEntry )
    }

  } while ( rccontinue )

  logx( "TID", `${ prev } 至今有 ${ entries.length } 個討論頁面有近似留言的編輯。` )
  // logx( "TID", `  ${ entries.map( x => x.title ).join( `\n[TID]   ` ) }` )

  return entries.reverse();

}

/**
 * 
 * @param { Mwn } bot 
 * @param { string } prev
 * @param { string } cutoff 
 * @param { ApiRecentChangesResponse[] } entries 
 * @return { Promise< TalkIndexEntry[] > }
 */
const readTalkPages = async ( bot, prev, cutoff, entries ) => {

  /**
   * @type { TalkIndexEntry[] }
   */
  const toBeIndexed = [];

  const sigRgx = /(\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)([^|\]\/#]+)(?:.(?!\[\[(?:(?:U|User|UT|User talk|(?:用[戶户]|使用者)(?:討論)?):|(?:Special|特殊):用[戶户]貢[獻献]\/)(?:[^|\]\/#]+)))*? ((\d{4})年(\d{1,2})月(\d{1,2})日 \([一二三四五六日]\) (\d{2}):(\d{2}) \(UTC\)))/i

  for ( const [ idx, entry ] of entries.entries() ) {

    logx( "TID", `正在分析 ${ entry.title }（${ idx + 1 }/${ entries.length }）` )

    let _page, _wikitext

    try {
      _page = new bot.Page( entry.title )
      _wikitext = new bot.Wikitext( await _page.text() );
    }
    catch ( err ) {
      // skip
      logx( "TID", `[ERR]   無法分析此頁` )
      continue;
    }
    console.log( 'cont', entry.title )

    const page = _page, wikitext = _wikitext

    const _sections = wikitext.parseSections();
    const sections = concatenateSections( _sections )
      .filter( s => s.level <= 2 );

    const rfcTemplates = wikitext.parseTemplates( {
      namePredicate: str => /^rfc(?:[ _]subpage)?$/i.test( str )
    } );

    for ( const section of sections ) {

      const templates = new bot.Wikitext( section.content ).parseTemplates();

      /**
       * @type { RegExpMatchArray }
       */
      const _signatures = ( section.content.match( new RegExp( sigRgx.source, 'gi' ) ) ?? [] );
      if ( !_signatures.length ) continue;
      const signatures = _signatures.map( parseSignature ).sort( ( a, b ) => {
        return a.timestamp - b.timestamp
      } );
      
      const lastSignature = signatures.slice(-1)[0];

      const _sectionHeader =
        await new bot.Wikitext(
          `== ${
            section.level == 1
            ? 'top'
            : section.header ?? ''
          } ==` ?? ''
        ) .apiParse( { prop: 'text' } )
      // console.log( _sectionHeader )
      const sectionHeader = (
        $( _sectionHeader ).find( '.mw-heading > h2 > span' ).get(0)
        ?? $( _sectionHeader ).find( '.mw-heading > h2' ).get(0)
      ).id

      if ( /^((特色列表|(優良|典範)條目)評選|(特色列表|(优良|典范)条目)评选)(（第.次）)?$/.test( sectionHeader ) ) continue;

      if (
        templates.find(
          t => t.name.toLowerCase() == 'rmcategory'
          && ( t.getValue(3) && !( /^h|need move|nm$/i.test( t.getValue(3) ) ) )
        )
        || templates.find(
          t => t.name.toLowerCase() == 'editprotected'
          && ( t.getParam( 'ok' ) || t.getParam( 'no' ) )
        )
        || (
          templates.map( t => t.name ).some(
            t => /^(archive top|closed rfc top|GAarchiveH|DYKEntry\/archive|WikiProject banner shell)$/i.test( t.replace( "_", " " ) )
          )
        )
      ) continue;

      if ( new Date( lastSignature.timestamp ) > new Date( prev ) ) {

        logx( "TID", `  ${ entry.title } § ${ sectionHeader } 有新留言，將列入索引` )

        const thisEntry = {
          title: entry.title,
          section: sectionHeader,
          signatures,
          ns: page.namespace
        }

        if ( rfcTemplates.length ) thisEntry.rfc = true;

        toBeIndexed.push( thisEntry );

      }
    }
  }

  return toBeIndexed;

}

/**
 * 
 * @param { Mwn } bot 
 * @param { string } prev
 * @param { string } cutoff 
 * @param { TalkIndexEntry[] } entries 
 */
const generateTalkIndex = async ( bot, prev, cutoff, entries ) => {

  let pre = "<noinclude>{{NoteTA/MediaWiki}}\n本頁由[[User:LuciferianBot|機械人]]自動索引'''最近十四天'''有新留言的[[WP:TALK|討論頁]]話題。\n</noinclude>\n"

  /**
   * @type { { [ ns: string ]: TalkIndexEntry[] } }
   */
  const entriesByNS = entries.reduce( ( result, item ) => {

    const key = item.ns;
    ( result[ key ] ??= [] ).push( item );

    return result

  }, {} )

  for ( const [ ns, entries ] of Object.entries( entriesByNS ) ) {

    let out = "";

    out += (
      `== {{NSPN|{{int:lang}}|${ ns }}}話題索引 ==\n`
      + `{| class="wikitable sortable mw-collapsible" style="max-width:100%;"\n|- style="white-space:nowrap;"\n! 💭 話題 !! <span title="發言數/發言人次 (實際上為計算簽名數)">💬</span> !! <span title="參與討論人數/發言人數">👥</span> !! data-sort-type="isoDate" | 最後留言 !! \n`
    )
    for ( const entry of entries ) {

      const lastSignature = entry.signatures.slice(-1)[0]
      const hoursAgo = ( new Date( cutoff ) - lastSignature.timestamp ) / 1000 / 60 / 60

      const timeColor =
        hoursAgo <= 1 ? 'efe'
        : hoursAgo <= 24 ? 'eef'
        : null

      out += (
        `|- \n`
        + `| [[${ entry.title }#${ entry.section
            }|<small style="display:block;">${ entry.title }</small>§ ${
              decodeURIComponent( entry.section.replace( /\.([0-9A-F]{2})/g, "%$1" ).replace( /_/g, " " ) ).replace( /(\{\{+|\}\}+|\[\[+|\]\]+)/g, "<nowiki>$1</nowiki>" )
            }]]\n`
        + `| style="text-align:right;" | ${ entry.signatures.length }\n`
        + `| style="text-align:right;" | ${
            entry.signatures.reduce(
              ( result, item ) => result.add( item.user )
              , new Set()
            ).size
          }\n`
        + `| data-sort-type="isoDate" data-sort-value="${
            new Date( lastSignature.timestamp ).toISOString() 
          }"${
            timeColor 
            ? ` style="background-color:{{Wikipedia:討論頁話題索引/topic list/color|${
                new Date( lastSignature.timestamp ).toISOString()
              }}};"`
            : ""
          } | {{nowrap|${
            moment( lastSignature.timestamp ).format( 'YYYY-MM-DD' )
          }}} {{nowrap|${
            moment( lastSignature.timestamp ).utcOffset( 8 ).format( 'HH:mm' )
          }}}\n`
        + `| ${ entry.rfc ? `[[WP:RFC|RfC]]` : '' }\n`

      )

      logx( "TID", `已紀錄 ${ entry.title } § ${ entry.section }` )

    }

    out += `|}\n\n`

    try {
      const indexPage = new bot.Page( `Wikipedia:討論頁話題索引/topic list/NS${ ns }` )
    
      await editPage( indexPage, () => {
        return {
          text: pre + out,
          summary: `[[Wikipedia:机器人/申请/LuciferianBot/7|機械人測試]]：生成NS${ ns }討論頁話題索引（${ entries.length }個活躍討論）`
        }
      }, "TID", `已生成NS${ ns }討論頁話題索引（${ entries.length }個活躍討論）`)
    }
    catch (err) {
      logx( "TID", `[ERR] Topic list page for NS${ ns } does not exist! Skipping...` )
      continue;
    }

  }

}

/**
 * @param { Mwn } bot
 */
const main = async ( bot ) => {

  const cutoff = new Date().toISOString();
  const prev = (
    !TID.get( 'cutoff' )
    || new Date( cutoff ) - new Date( TID.get( 'cutoff' ) ) > 14 * 24 * 60 * 60 * 1000
  ) ? new Date( new Date( cutoff ) - 14 * 24 * 60 * 60 * 1000 ).toISOString()
    : TID.get( 'cutoff' )

  const rcEntries = await fetchRecentChanges( bot, prev, cutoff );
  const unindexed = await readTalkPages( bot, prev, cutoff, rcEntries );

  /**
   * @type { TalkIndexEntry[] }
   */
  const _indexed = TID.get( 'indexed' ) ?? []

  const indexed = []

  for ( const entry of _indexed ) {
    if (
      !( await new bot.Page( entry.title ).exists() )
      || !!unindexed.find( e => e.title == entry.title )
      || new Date( new Date( cutoff ) ) - new Date( entry.signatures.slice(-1)[0].timestamp )
          > 14 * 24 * 60 * 60 * 1000
    ) {
      continue;
    }
    entry.signatures = entry.signatures.map( v => { 
      v.timestamp = new Date( v.timestamp );
      return v;
    } )

    indexed.push( entry )
  }

  const toBeIndexed = [ ...unindexed, ...indexed ].sort(
    ( a, b ) => 
      new Date( b.signatures.slice(-1)[0].timestamp )
      - new Date( a.signatures.slice(-1)[0].timestamp )
  )

  await generateTalkIndex( bot, prev, cutoff, toBeIndexed )

  TID.set( 'cutoff', cutoff )
  TID.set( 'indexed', toBeIndexed )
  TID.set( 'working', false )

}

/**
 * @param { Mwn } bot
 */
export default async ( bot ) => {

  let lu = TID.get( "working" )
  if ( moment( lu ).add( 1, 'hour' ) < moment() )
    TID.set( ( lu = false ) )
  if ( lu ) return;

  TID.set( "working", moment().toISOString() )

  await trycatch( updateJobStatus( bot, 7, 2 ) )

  try {
    await main( bot )
  }
  catch ( e ) {
    logx( "TID", `[ERR] ${ e }` )
    console.trace( e )
    TID.set( "working", false )
    await trycatch( updateJobStatus( bot, 7, 0 ) )
    return;
  }

  await trycatch( updateJobStatus( bot, 7, 1 ) )

}