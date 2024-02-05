import { Mwn } from 'mwn';
import moment from 'moment';

import { time, capitalize, $, log } from '../fn.mjs';

const metabot = new Mwn( {
  apiUrl: 'https://meta.wikimedia.org/w/api.php',
  userAgent: 'LuciferianBotSPI/1.0 (https://zh.wikipedia.org/wiki/Wikipedia:SPI)',

  username: process.env.USERNAME,
  password: process.env.BOTPASSWORD,
  
  defaultParams: { assert: 'user' }
} )

async function getStewards( bot ) {
  log( "正在獲取監管員列表" )

  let res = await metabot.query( {
    list: "allusers",
    augroup: "steward",
    aulimit: 100
  } )

  let stewards = res.query.allusers.length ? res.query.allusers.map(x => x.name) : []
  // console.log( stewards )
  // stewards.push( "LuciferianThomas" )
  return stewards
}

function srcuStatus( status ) {
  switch ( status ) {
    case "d": case "+": case "done":
      return "完成";
    case "nd": case "-": case "not done": case "notdone":
      return "未完成";
    case "?": case "on hold": case "hold": case "onhold":
      return "擱置";
    case "already done": case "alreadydone":
      return "之前已完成";
    default:
      return status;
  }
}

const srcuPage = 'Steward requests/Checkuser' 

export default async ( bot ) => {
  try {
    let stewards = await getStewards( bot )  
    
    let stream = new bot.stream( "recentchange", {
      onopen: () => { console.log( "EventSource online." ) },
      onerror: ( err ) => { console.error( "EventSource:", err ) }
    } );
    
    stream.addListener( ( data ) => {
      // if (
      //   data.wiki === 'metawiki'
      //   && data.title === srcuPage
      // ) console.log( data )
      return (
        data.wiki === 'metawiki'
        && data.title === srcuPage
        && stewards.includes( data.user )
        && data.length.old < data.length.new
      )
    }, async ( data ) => {
      log( `[SPI] 有新的Steward回覆：${ data.user }` )
      let { compare } = await metabot.request({
        action: "compare",
        format: "json",
        fromrev: data.revision.old,
        torev: data.revision.new
      })
      let $diff = $( '<table>' ).append( compare.body )
      let diffText = []
      $diff.find( '.diff-addedline' ).each( ( _i, ele ) => {
        diffText.push( $( ele ).text() )
      } )
      // console.log( diffText )
      let lastSig = diffText.slice().reverse()
        .find( line => new RegExp( `user(?:[ _]talk)?:${ data.user }.*? \\d{2}:\\d{2}, \\d{1,2} (?:january|february|march|april|may|june|july|august|september|october|november|december) \\d{4} \\(UTC\\)`, 'i' ).test( line ) )
      
      let SRCUpage = new metabot.Page( srcuPage )
      const wikitext = await SRCUpage.text()
      // console.log( wikitext )
      // console.log( `=== ?(.*?) ?===(?:.|\\n)+?${ lastSig.replace( /([\[\]\(\)\?\-\+\*\/\:\\\|])/g, "\\$1" ) }` )
      const editedReport = wikitext.match( new RegExp( `=== ?(.*?) ?===(?:(?!===)(?:.|\n))+?${ lastSig.replace( /([\[\]\(\)\?\-\+\*\/\:\\\|])/g, "\\$1" ) }` ) )
      if ( !( /@zh\.wikipedia/.test( editedReport[1] ) ) )
        return;
    //   console.log(1)
    // return;
      
      let SPIcase = editedReport[0].match( /\| *discussion *= *\[\[:?(?:w:)?zh:.*?((?:Wikipedia|維基百科|维基百科|Project):傀儡調查\/案件\/.*?)[#\|\]]/i )[1]
      let changeState
      
      if ( diffText.find( line => /\| *status *= *(.*?)$/m.test( line ) ) )
        changeState = diffText.find( line => /\| *status *= *(.*?)$/m.test( line ) ).match( /\| *status *= *(.*?)$/m )[1].replace( /<!--.*?-->/g, "" ).trim()
  
      let out = `監管員[[:m:User:${ data.user }|${ data.user }]]在[[:m:SRCU]]作出了'''[[:m:Special:Diff/${ data.revision.new }|回覆]]'''${ changeState ? `並將案件狀態設為${ srcuStatus( changeState ) }` : "" }。`
      log( `[SPI] 　　屬於${ SPIcase }` )

      let SPIpage = new bot.page( SPIcase )
      let SPI_wt = await SPIpage.text()
      console.log( SPI_wt.match( /=== *\d{4}年\d{1,2}月\d{1,2}日 *===(?:.|\n)+?----<!--+ 所有留言請放在此行以上 -->/g ) )
      let endorsedCase = SPI_wt.match( /=== *\d{4}年\d{1,2}月\d{1,2}日 *===(?:.|\n)+?----<!--+ 所有留言請放在此行以上 -->/g ).find( _case => _case.match( /\{\{SPI[ _]case[ _]status ?\| ?(?:(?!close|admin|open).+)? ?\}\}/i ) )

      let new_wt = `${ endorsedCase }`
      if ( /\{\{doing\}\}/i.test( lastSig ) ) {
        new_wt = new_wt.replace( /(\{\{SPI[ _]case[ _]status ?\| ?).*?( ?\}\})/i, "$1checking$2" )
        out = `監管員[[:m:User:${ data.user }|${ data.user }]]{{checking}}`
      }
      if ( changeState == 'done' ) {
        new_wt = new_wt.replace( /(\{\{SPI[ _]case[ _]status ?\| ?).*?( ?\}\})/i, "$1checked$2" )
        out = `監管員[[:m:User:${ data.user }|${ data.user }]]{{completed}}查核，請見'''[[:m:Special:Diff/${ data.revision.new }|回覆]]'''。`
      }
      new_wt = new_wt.replace( /(----<!--+ 所有留言請放在此行以上 -->)/, `* {{clerk note|機械人助理留言}}：${ out }--{{subst:User:LuciferianBot/SPIsign}} ~~~~~\n$1` )
      SPI_wt = SPI_wt.replace( endorsedCase, new_wt )
      
      await SPIpage.edit( ( { content } ) => {
        return {
          text: SPI_wt,
          summary: `[[Wikipedia:机器人/申请/LuciferianBot/4|機械人]]：機械人助理轉發監管員留言通知`,
          bot: true
        }
      } )
      log( "[SPI] 　　完成發送監管員留言通知" )
      return;
    } )
    
    return;
  } catch (e) {
    log( "[SPI] 　　發送監管員留言通知時出現錯誤：" )
    log( e )
  }
}