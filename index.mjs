import dotenv from 'dotenv';
dotenv.config();
import { Mwn } from 'mwn'
import { time, log } from './fn.mjs';
import genCaseList from './spi/case_list.mjs';
import getStewardComments from './spi/steward_comment.mjs';

console.log( 'env', process.env )

const bot = new Mwn( {
  apiUrl: 'https://zh.wikipedia.org/w/api.php',

  username: process.env.USERNAME,
  password: process.env.BOTPASSWORD,

  userAgent: process.env.USERAGENT,

  defaultParams: { assert: 'user' }
} )

bot.login().then( async () => {
  console.log( "成功登入" )
  log( `成功登入` )
  try {
    genCaseList( bot )
  }
  catch ( e ) {
    log( `${ e }` )
  }
  
  try {
    getStewardComments( bot )
  }
  catch ( e ) {
    log( `${ e }` )
  }
} )