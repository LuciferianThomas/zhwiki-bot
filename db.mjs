import crypto from 'node:crypto';
import fs from 'fs'
import path from 'path';
import url from 'url';
import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";
import { default as lodash } from 'lodash';

const __dirname = path.dirname( url.fileURLToPath( import.meta.url ) );
const file = path.join(__dirname, "db", "db.json");
const adapter = new JSONFileSync( file )
const lowdb = new LowSync( adapter, {} )

/**
 * Customized LowDB instance with get and set wrappers.
 */
export class CDB {
  #table;

  /**
   * 
   * @param { string } table 
   * @returns CDB
   */
  constructor( table ) { 
    this.#table = table;
    lowdb.read();
    lowdb.data[ this.#table ] ||= {};
    lowdb.write();
    return this;
  };
  
  /**
   * 
   * @param { string } field 
   * @param { any } value
   * @returns { CDB }
   */
  set( field, value ) {
    lodash.set( lowdb.data[ this.#table ], field, value );
    lowdb.write();
    return this;
  }
  /**
   * 
   * @param { string } field
   * @returns any
   */
  get( field ) {
    return lodash.cloneDeep( lodash.get( lowdb.data[ this.#table ], field ) );
  }

  /**
   * 
   * @param { string } field 
   * @param { ...any } values
   * @returns { CDB }
   */
  push( field, ...values ) {
    const val = this.get( field );
    if ( !Array.isArray( val ) ) throw Error( `[CDB] Field ${ field } is not an array!` );
    this.set( field, val.concat( ...values ) );
    lowdb.write();
    return this;
  }

  /**
   * 
   * @returns { any }
   */
  all() {
    return lowdb.data[ this.#table ];
  }
};

export const hash = ( str ) => crypto.createHash( 'md5' ).update( str ).digest( "hex" )