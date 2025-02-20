import { Mwn } from 'mwn';
import moment from 'moment';

import { time, capitalize, log, logx, trycatch, updateJobStatus, parseSignature, editPage, parse } from '../fn.mjs';

/** @typedef { ({ name: string, status: string, text: string, last_comment: import('../fn.mjs').Signature, last_volunteer: import('../fn.mjs').Signature, file_user: string, file_time: Date }|{ name: string, status: string, error: string )[] } DRNCase */

/**
 * 
 * @param { Mwn } bot 
 * @returns { Promise< string[] > }
 */
async function getVolunteerList( bot ) {
  logx( "DRN", "正在獲取志願者列表" )
  let volunteers = []

  let DRNV = new bot.Page( 'Wikipedia:爭議解決布告板/志工服務' )
  
  let lines = ( await DRNV.text() ).split( /\n/g )
  // console.log( lines ) 
  let aVs = lines.indexOf( lines.find( x => /=== 活躍 ===/.test( x ) ) )   
    , iVS = lines.indexOf( lines.find( x => /=== 不活躍 ===/.test( x ) ) )   

  let p = /\{\{\/User\|([^}]+)}}/i

  for ( var i = aVs + 1; i < iVS; i++ ) {
    let line = lines[i]
    if ( p.test( line ) ) {
      volunteers.push( line.match( p )[1] )
    }
  }
  console.log( volunteers )
  logx( "DRN", `　　找到 ${ volunteers.length } 名志願者記錄` )
  return volunteers
}

/**
 * 
 * @param { string } wt 
 * @returns string
 */
function getStatusFromTemplate( wt ) {
  let caseStatusTemplate = wt.match( /\{\{DR[ _]case[ _]status ?\| ?(.*?) ?\}\}/ )
  if ( !caseStatusTemplate || !caseStatusTemplate[1] ) return "未能辨識狀態";
  else return caseStatusTemplate[1];
}

/**
 * 
 * @param { Mwn } bot
 * @param { string[] } volunteers 
 * @returns 
 */
async function getCaseDetails( bot, volunteers ) {
  let page = new bot.Page( `Wikipedia:爭議解決布告板` )
  logx( "DRN", `正在獲取 Wikipedia:爭議解決布告板 的資訊` )

  const _wikitext = await page.text()

  const wikitext = new bot.Wikitext( _wikitext )
  wikitext.unbind();
  const _sections = parseSections( wikitext )
  const sections = groupSections( _sections, 2 )

  /** @type { DRNCase[] } */
  let cases = [];

  for ( const section of sections ) {
    try {
      logx( "DRN", `正在分析「${ section.header }」章節` )
    
      let _case = {
        name: section.header,
        status: getStatusFromTemplate( section.content ),
        text: section.content
      }
        
      logx( "DRN", "　　正在找出最後留言之用戶" )
      
      /** @type { string[] } */
      let _signatures = ( _case.text.match( new RegExp( sigRgx.source, sigRgx.flags + "g" ) ) || [] )
      /** @type { import('../fn.mjs').Signature[] } */
      let signatures = _signatures.map( sig => parseSignature( sig ) )
      
      _case.last_comment = signatures.filter( sig => {
        return !volunteers.includes( sig.user )
      } ).sort( ( a, b ) => {
        return b.timestamp - a.timestamp
      } )[0];
    
      _case.last_volunteer = signatures.filter( sig => {
        return volunteers.includes( sig.user )
      } ).sort( ( a, b ) => {
        return b.timestamp - a.timestamp
      } )[0];

      try {

        let filing_editor_template = new bot.Wikitext( section.content ).parseTemplates()
          .find( t => t.name.toLowerCase().replace( /_/g , ' ') == 'drn filing editor' )
        if ( !filing_editor_template ) throw Error();

        let _file_user = filing_editor_template.getParam(1)
        let _file_time = filing_editor_template.getParam(2)
        
        let fakesig = parseSignature( `[[User:${_file_user}]] ${_file_time}` )
        
        _case.file_user = _file_user
        _case.file_time = fakesig.timestamp
      }
      catch ( err ) {
        _case.file_user = ''
        _case.file_time = ''
        _case.status = "ERROR"
        _case.error = "NOSIG"
      }
    
      logx(
        'DRN',
`　　章節：${ _case.name }
　　狀態：${ _case.status }
　　登錄人：${ _case.file_user ?? '未知' }
　　登錄時間：${ !_case.file_time ? "ERROR" : time( _case.file_time ) }
　　最後留言：${ _case.last_comment ? `${ _case.last_comment.user } 於 ${ time( _case.last_comment.timestamp ) }` : `無` }\n      　　最後助理留言：${ _case.last_volunteer ? `${ _case.last_volunteer.user } 於 ${ time( _case.last_volunteer.timestamp ) }` : `無` }`
      )
      cases.push( _case )
    }
    catch ( err ) {
      logx( "DRN", `[ERR] 在獲取 Wikipedia:爭議解決布告板#${ section.header } 的案件資訊時遇到錯誤` )
      console.log( err )
      cases.push( {
        name: section.header,
        status: "ERROR",
        error: "FORMAT"
        // text: case_wt
      } )
    }
  }
  return cases 
}

/**
 * 
 * @param { DRNCase } _case 
 * @returns string
 */
function formatTableRow( _case ) {
  
  return `{{DRN case status/row|t=${ _case.name
    }|d=${ _case.name
    }|s=${ _case.status
    }|cu=${ !_case.file_user
          ? ""
          : _case.file_user
    }|cs=${ !_case.file_time
          ? ""
          : _case.file_time
            ? time( _case.file_time )
            : "未知"
    }|ct=${ !_case.file_time
          ? ""
          : _case.file_time
            ? time( _case.file_time )
            : "未知"
    }|mu=${ _case.last_comment ? _case.last_comment.user/*.replace( /^(([0-9A-F]{1,4})\:.*\:([^:]+\:[^:]+))$/i, `<abbr title="$1">$2...$3</abbr>` )*/ : ""
    }|ms=${ _case.last_comment ? time( _case.last_comment.timestamp ) : ""
    }|mt=${ _case.last_comment ? time( _case.last_comment.timestamp ) : ""
    }|vu=${ _case.last_volunteer ? _case.last_volunteer.user : ""
    }|vs=${ _case.last_volunteer ? time( _case.last_volunteer.timestamp ) : "" 
    }|vt=${ _case.last_volunteer ? time( _case.last_volunteer.timestamp ) : "" }${
      _case.error
      ? `|error=${ _case.error }`
      : ""
    }}}\n`
}

/**
 * 
 * @param { DRNCase[] } cases 
 * @returns string
 */
function generateCaseTable( cases ) {
  let result = "{{DRN case status/header|small={{{small|}}}|collapsed={{{collapsed|}}}}}\n"
  for ( var _case of cases ) {
    result += formatTableRow( _case )
  }
  if ( cases.length == 0 ) {
    result += `| colspan=8 align=center style=\"font-size:150%;font-weight:bold\" | 
<div style="text-align: center; line-height: 1.5"><!--<div style="font-size: 200%">襪子櫃清空了。</div>--><div style="text-align: center; line-height: 1.5"><div style="font-size: 120%">（暫無活躍爭議解決請求）</div></div>`
  }
  result += "\n{{DRN case_status/footer|small={{{small|}}}}}\n<noinclude>{{documentation}}"
  return result
}

let lastDone;
/**
 * @param { Mwn } bot
 */
export default async ( bot ) => {
  await trycatch( updateJobStatus( bot, 8, 2 ) )

  try {

    const TABLE_LOCATION = 'Template:DRN case status'
    let volunteers = await getVolunteerList( bot )
    let cases = await getCaseDetails( bot, volunteers )
    let list = new bot.Page( TABLE_LOCATION )
    await editPage( bot, list, ( { content } ) => {
      return {
        text: generateCaseTable( cases ),
        summary: `[[User:LuciferianBot/task/8|機械人測試]]：更新DRN列表（${ cases.length }活躍請求）`,
        bot: true
      }
    }, "DRN", `已完成更新DRN請求列表（${ cases.length }活躍請求）` )
    lastDone = new moment();
  }
  catch ( e ) {
    logx( "DRN", `[ERR] ${ e }` )
    console.trace( e )
    await trycatch( updateJobStatus( bot, 8, 0 ) )
    return;
  }
  await trycatch( updateJobStatus( bot, 8, 1 ) )

}