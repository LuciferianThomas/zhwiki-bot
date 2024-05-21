import { Mwn } from 'mwn';
import moment from 'moment';

import { CronJob } from 'cron';

import { time, capitalize, log } from '../fn.mjs';

const isIP = ( s ) => {
  return /(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))/.test( s )
}

export default async ( bot, newReqs ) => {
  if ( !newReqs.length ) return;
  console.log( newReqs.map( r => r.name ) )
  log( `[SPI] 發現新的CU請求：${ newReqs.map( r => r.name ) }` )
  // return;
  for ( var req of newReqs ) {
    log( `[SPI] 分析新的CU請求：${ req.name }` )
    let sockListTemplate = req.text.match( /\{\{sock[ _]list\|.*?\}\}/i )[0].split( /\|/g ).filter( m => !( /\{\{sock[ _]list|tools_link=/.test( m ) ) )
    let sockList = sockListTemplate.map( m => m.match( /^(?:\d+=)?(.*?)$/ )[1] )
    let qUsers = await bot.query( {
      list: 'users',
      ususers: sockList.slice( 0, 50 ).join( "|" ),
      usprop: "registration|blockinfo|editcount"
    } )
    let { users: sockUsers } = qUsers.query
    console.log( sockUsers )
    let mainAcc
    let invalid = [], missing = []
    let noEdits = [], stale = []
    let almostStale = []
    for ( var sockUser of sockUsers ) {
      if ( sockUser.invalid ) {
        if ( !isIP( sockUser.name ) )
          missing.push( sockUser.name )
        continue;
      }
      if ( sockUser.missing ) {
        missing.push( sockUser.name )
        continue;
      }
      
      if ( !mainAcc || sockUser.editcount > mainAcc.editcount || sockUser.registration < mainAcc.registration )
        mainAcc = sockUser

      let qContribs = await bot.query( {
        list: 'usercontribs',
        ucuser: sockUser.name,
        uclimit: 1
      } )
      let { usercontribs: lastContrib } = qContribs.query
      let qLogs = await bot.query( {
        list: 'logevents',
        leuser: sockUser.name,
        lelimit: 1
      } )
      let { logevents: lastLog } = qLogs.query
      // console.log( qContribs.query )
      // console.log( sockUser.name, lastContrib.timestamp, moment.utc( lastContrib.timestamp ) , moment().subtract( 90, 'days' ) )
      if ( !lastContrib.length && !lastLog.length ) noEdits.push( sockUser.name )
      else if ( moment.utc( lastContrib.length ? lastContrib[0].timestamp : '1970-01-01T00:00:00Z' ).isBefore( moment().subtract( 90, 'days' ) ) && moment.utc( lastLog.length ? lastLog[0].timestamp : '1970-01-01T00:00:00Z' ).isBefore( moment().subtract( 90, 'days' ) ) ) stale.push( sockUser.name )
      else if ( moment.utc( lastContrib.length ? lastContrib[0].timestamp : '1970-01-01T00:00:00Z' ).isBefore( moment().subtract( 83, 'days' ) ) && moment.utc( lastLog.length ? lastLog[0].timestamp : '1970-01-01T00:00:00Z' ).isBefore( moment().subtract( 83, 'days' ) ) ) almostStale.push( sockUser.name )
    }

    if ( invalid.length + missing.length + noEdits.length + stale.length + almostStale.length == 0 ) { 
      log( '沒有發現帳號問題。' )
      continue;
    }
    console.log( invalid )
    console.log( missing )
    console.log( noEdits )
    console.log( stale )
    // console.

    let out = "{| class=wikitable\n! style=\"width:12em;padding-left:1.3em\" | 問題 !! 帳號\n"
    // if ( invalid.length ) {
    //   out += `|-\n| 不能查核IP帳號間或其與註冊帳號的關聯 || ${ invalid.map( n => `{{unping|${n}}}` ).join( "、" ) }\n`
    // }
    if ( missing.length ) {
      out += `|-\n| 用戶未在本地註冊 || ${ missing.map( n => `{{unping|${n}}}` ).join( "、" ) }\n`
    }
    if ( noEdits.length ) {
      out += `|-\n| 用戶在本地無可見編輯 || ${ noEdits.map( n => `{{unping|${n}}}` ).join( "、" ) }\n`
    }
    if ( stale.length ) {
      out += `|-\n| 上筆可見編輯已為90天前，可能{{stale}} || ${ stale.map( n => `{{unping|${n}}}` ).join( "、" ) }\n`
    }
    if ( almostStale.length ) {
      out += `|-\n| 上筆可見編輯已為83天前，可能'''即將'''{{stale}} || ${ almostStale.map( n => `{{unping|${n}}}` ).join( "、" ) }\n`
    }
    out += `|}\n* {{clerk note|機械助理留言}}：自動檢查查核請求發現以上問題。--{{subst:User:LuciferianBot/SPIsign}} ~~~~~\n`
    let newtext = req.text.replace( /(----<!--+ 所有留言請放在此行以上 -->)/, out + `$1` )
    let spipage = new bot.page( `Wikipedia:傀儡調查/案件/${ req.name }` )
    await spipage.edit( ( { content } ) => {
      return {
        text: content.replace( req.text, newtext ),
        summary: `[[Wikipedia:机器人/申请/LuciferianBot/4|機械人]]：機械人助理發送用戶查核請求檢查提示`,
        bot: true
      }
    } )
    console.log( newtext )
    log( `[SPI] 已自動檢查 Wikipedia:傀儡調查/案件/${ req.name } 的CU請求` )
  }
  return;
}