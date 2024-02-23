import moment from 'moment';
import jquery from 'jquery';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname( url.fileURLToPath( import.meta.url ) );
const logpath = path.join(__dirname, "..", "logs" );

const time = ( date = moment(), format = "YYYY-MM-DD HH:mm" ) => {
  return moment( date ).utcOffset( 8 ).format( format )
}

const capitalize = (s) => {
  if (typeof s !== 'string') return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const win = new ( JSDOM )( '' ).window
const $ = jquery( win, true )

const log = ( message ) => {
  console.log( message )
  fs.appendFile( path.join( logpath, `debug-${ time( moment(), "YYYYMMDD" ) }.log` ), `${ time() } | ${ ( typeof message !== 'string' ? JSON.stringify( message ) : message ).replace( /\n/g, '\n' + ( ' '.repeat(19) ) ) }\n`, ( e ) => {
    if ( e ) return;
  } )
}

const pruneLogs = () => {
  const dir = fs.readdirSync( logpath )
  const logsToPrune = dir.filter( logfile => logfile < `debug-${ moment().subtract(7,'d').format("YYYYMMDD") }.log` )
  for ( const logToPrune of logsToPrune ) {
    fs.unlink( path.join( logpath, logToPrune ), ( e ) => {
      if ( e ) return;
      log( `[LOG] Pruned ${ logToPrune }` )
    } )
  }
}

export {
  time,
  capitalize,
  $,
  log,
  pruneLogs,
}