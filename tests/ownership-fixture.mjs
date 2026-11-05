import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {migrate} from '../scripts/migrate.mjs';
import {createApp} from '../server/app.mjs';
import {passwordHash} from '../server/security.mjs';
export async function ownershipFixture(origin='https://test.moment-link.invalid'){
 const pg=new PGlite(),db={query:(s,a)=>pg.query(s,a),transaction:fn=>pg.transaction(fn)};
 await migrate(db);
 const password='Synthetic-only-password-123!',encoded=await passwordHash(password),staff={};
 for(const [username,role,name] of [['owner-admin','admin','합성 관리자'],['counselor-a','counselor','합성 상담사 가'],['counselor-b','counselor','합성 상담사 나']]){
  const id=randomUUID();staff[username]={id,username,role,name};
  await db.query('INSERT INTO moment_link.admin_users(id,username,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,false)',[id,username,encoded,role]);
  await db.query('INSERT INTO moment_link.config(id,data) VALUES($1,$2)',['staff:'+id,JSON.stringify({name})]);
 }
 const app=createApp({db,env:{APP_ORIGIN:origin}}),sessions={};
 async function request(path,username='owner-admin',method='GET',data){
  const response=await app(new Request(origin+'/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(sessions[username]||{})},...(data===undefined?{}:{body:JSON.stringify(data)})}));
  return {status:response.status,data:await response.json(),headers:response.headers};
 }
 for(const username of Object.keys(staff)){const result=await request('auth/login',null,'POST',{username,password});sessions[username]={Cookie:result.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':result.data.csrf};}
 async function add({owner=null,status='new',communication={},person='합성 상담 고객'}={}){
  const id=randomUUID(),snapshot={product:{id:'visit',name:'출장 프로포즈'},package:{id:'light',name:'라이트',weekday:249000,weekend:249000},price:{weekday:249000,weekend:249000},options:[]};
  return (await db.query('INSERT INTO moment_link.consultations(id,receipt,idempotency_hash,payload_hash,person,phone,category,product_id,package_id,snapshot,preferences,place,notes,consent,expires_at,assignee,status,communication) VALUES($1,$2,$1::uuid::text,$1::uuid::text,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,now()+interval \'365 days\',$12,$13,$14) RETURNING *',[id,'ML-'+id.slice(0,8),person,'01000000000','visit','light',JSON.stringify(snapshot),JSON.stringify([{date:'2099-11-01',time:'오후'}]),'합성 검수 장소','합성 요청사항','{}',owner,status,JSON.stringify(communication)])).rows[0];
 }
 return {pg,db,app,staff,password,sessions,request,add};
}
