import pg from 'pg';
import {attachDatabasePool} from '@vercel/functions';
let pool;
export function database() {
 if (!process.env.DATABASE_URL) throw Object.assign(new Error('데이터베이스 연결을 준비 중입니다.'), {status:503,code:'DATABASE_NOT_CONFIGURED'});
 if(!pool){
  const url=new URL(process.env.DATABASE_URL);
  if(process.env.VERCEL||process.env.NODE_ENV==='production')url.searchParams.set('sslmode','verify-full');
  pool=new pg.Pool({connectionString:url.href,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
  pool.on('error',()=>console.error(JSON.stringify({code:'DATABASE_IDLE_CONNECTION_ERROR'})));
  if(process.env.VERCEL)attachDatabasePool(pool);
 }
 return {
  query:(sql,args)=>pool.query(sql,args),
  async transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 };
}
export async function closeDatabase(){await pool?.end();pool=undefined;}
