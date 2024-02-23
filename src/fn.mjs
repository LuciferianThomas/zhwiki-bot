import { mwn } from 'mwn';
import moment from 'moment';
import jquery from 'jquery';
import { JSDOM } from 'jsdom';
import fs from 'fs';

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
  fs.appendFile( `../logs/debug-${ time( moment(), "YYYYMMDD" ) }.log`, `${ time() } | ${ ( typeof message !== 'string' ? JSON.stringify( message ) : message ).replace( /\n/g, '\n' + ( ' '.repeat(19) ) ) }\n`, ( e ) => {
    if ( e ) return;
  } )
}

export {
  time,
  capitalize,
  $,
  log
}