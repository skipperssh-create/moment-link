import pg from 'pg';
let pool;
export function database() {
 if (!process.env.DATABASE_URL) throw Object.assign(new Error('데이터베이스 연결을 준비 중입니다.'), {status:503,code:'DATABASE_NOT_CONFIGURED'});
 pool ??= new pg.Pool({connectionString:process.env.DATABASE_URL, max:3, idleTimeoutMillis:10000, connectionTimeoutMillis:10000});
 return {
  query:(sql,args)=>pool.query(sql,args),
  async transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 };
}
export async function closeDatabase(){await pool?.end();pool=undefined;}
