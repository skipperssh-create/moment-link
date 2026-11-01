import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {hash,passwordHash,SESSION_SECONDS} from '../server/security.mjs';

async function setup(){
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)},origin='https://session.test.invalid';
 await migrate(db);const id=randomUUID(),password=randomUUID();
 await db.query("INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,'session-admin',$2,'admin',false)",[id,await passwordHash(password)]);
 const env={APP_ORIGIN:origin,NODE_ENV:'production'};let app=createApp({db,env});
 const req=async(path,method='GET',data,auth={})=>{const response=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...auth},...(data===undefined?{}:{body:JSON.stringify(data)})}));return {status:response.status,headers:response.headers,data:await response.json()};};
 const login=async()=>{const r=await req('auth/login','POST',{username:'session-admin',password});assert.equal(r.status,200);return {response:r,auth:{Cookie:r.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':r.data.csrf}};};
 return {pg,db,id,password,req,login,restart:()=>{app=createApp({db,env});}};
}
const tokenHash=auth=>hash(auth.Cookie.slice('ml_session='.length));
async function remaining(db,auth){return (await db.query('SELECT EXTRACT(EPOCH FROM expires_at-now())::float8 AS seconds FROM moment_link.sessions WHERE token_hash=$1',[tokenHash(auth)])).rows[0]?.seconds;}

test('persistent device sessions survive reopening, renew with use, and upgrade valid eight-hour sessions',async()=>{
 const x=await setup();try{
  const {auth,response}=await x.login(),setCookie=response.headers.get('set-cookie');
  assert.match(setCookie,/HttpOnly; SameSite=Strict; Max-Age=31536000;?\s*;?\s*Secure/);
  assert.equal(SESSION_SECONDS,31536000);assert.ok(await remaining(x.db,auth)>SESSION_SECONDS-10);
  x.restart();let r=await x.req('auth/session','GET',undefined,auth);assert.equal(r.data.user.id,x.id);assert.equal(r.data.csrf,auth['X-CSRF-Token']);assert.equal(r.headers.get('set-cookie'),null);
  // A previously issued, still valid eight-hour login upgrades without credentials.
  await x.db.query("UPDATE moment_link.sessions SET expires_at=now()+interval '8 hours' WHERE token_hash=$1",[tokenHash(auth)]);
  r=await x.req('auth/session','GET',undefined,auth);assert.equal(r.data.user.id,x.id);assert.equal(r.headers.get('set-cookie'),setCookie);assert.ok(await remaining(x.db,auth)>SESSION_SECONDS-10);
  // Admin use also renews, preserving concurrent tabs' token and CSRF value.
  await x.db.query("UPDATE moment_link.sessions SET expires_at=now()+interval '300 days' WHERE token_hash=$1",[tokenHash(auth)]);
  r=await x.req('admin/consultations','GET',undefined,auth);assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),setCookie);
  const stable=await remaining(x.db,auth);r=await x.req('auth/session','GET',undefined,auth);assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.data.csrf,auth['X-CSRF-Token']);assert.ok(await remaining(x.db,auth)<=stable);
  assert.equal((await x.req('admin/settings','PUT',{}, {...auth,'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await x.req('admin/settings','PUT',{}, {...auth,Origin:'https://other.invalid'})).status,403);
  await x.db.query("UPDATE moment_link.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[tokenHash(auth)]);
  r=await x.req('auth/session','GET',undefined,auth);assert.equal(r.data.user,null);assert.equal(r.headers.get('set-cookie'),null);assert.equal((await x.req('admin/consultations','GET',undefined,auth)).status,401);assert.ok(await remaining(x.db,auth)<0);
  r=await x.req('auth/session','GET',undefined,{Cookie:'ml_session=unknown'});assert.equal(r.data.user,null);assert.equal(r.headers.get('set-cookie'),null);
 }finally{await x.pg.close();}
});

test('persistent login still revokes on logout, password changes and staff deactivation',async()=>{
 const x=await setup();try{
  const first=await x.login(),second=await x.login();
  await x.db.query("UPDATE moment_link.sessions SET expires_at=now()+interval '8 hours' WHERE token_hash=$1",[tokenHash(first.auth)]);
  let r=await x.req('auth/logout','POST',{},first.auth);assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/ml_session=;.*Max-Age=0/);assert.doesNotMatch(r.headers.get('set-cookie'),/31536000/);
  assert.equal((await x.req('auth/session','GET',undefined,first.auth)).data.user,null);assert.equal((await x.req('auth/session','GET',undefined,second.auth)).data.user.id,x.id);
  const third=await x.login();await x.db.query("UPDATE moment_link.sessions SET expires_at=now()+interval '8 hours' WHERE token_hash=$1",[tokenHash(second.auth)]);
  r=await x.req('auth/password','POST',{current:x.password,password:'Next8!xy'},second.auth);assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
  for(const auth of [second.auth,third.auth])assert.equal((await x.req('auth/session','GET',undefined,auth)).data.user,null);
  assert.equal((await x.db.query('SELECT count(*)::int AS n FROM moment_link.sessions WHERE user_id=$1',[x.id])).rows[0].n,0);
  r=await x.req('auth/login','POST',{username:'session-admin',password:'Next8!xy'});const auth={Cookie:r.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':r.data.csrf};
  const staffId=randomUUID();await x.db.query("INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,'session-staff',$2,'counselor',false)",[staffId,await passwordHash('Staff8!x')]);
  r=await x.req('auth/login','POST',{username:'session-staff',password:'Staff8!x'});const staff={Cookie:r.headers.get('set-cookie').split(';')[0]};assert.ok(await remaining(x.db,staff)>SESSION_SECONDS-10);
  assert.equal((await x.req('admin/users/'+staffId,'PATCH',{role:'counselor',active:false},auth)).status,200);
  r=await x.req('auth/session','GET',undefined,staff);assert.equal(r.data.user,null);assert.equal(r.headers.get('set-cookie'),null);
 }finally{await x.pg.close();}
});
