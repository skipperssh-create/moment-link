import {randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual, randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
export async function passwordHash(password){const salt=randomBytes(16).toString('hex');return `${salt}:${Buffer.from(await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex')}`;}
export async function verifyPassword(password,encoded){const [salt,key]=(encoded||'00:00').split(':');const candidate=Buffer.from(await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}));const expected=Buffer.from(key,'hex');return candidate.length===expected.length&&timingSafeEqual(candidate,expected);}
export async function audit(db,actor,action,entity,detail={}){await db.query('INSERT INTO moment_link.audit_logs(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor||null,action,entity,JSON.stringify(detail)]);}
export async function rateLimit(db,key,max,seconds){
 const r=await db.query(`INSERT INTO moment_link.rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second')
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN moment_link.rate_limits.expires_at<=now() THEN 1 ELSE moment_link.rate_limits.count+1 END,
 expires_at=CASE WHEN moment_link.rate_limits.expires_at<=now() THEN now()+$2*interval '1 second' ELSE moment_link.rate_limits.expires_at END RETURNING count`,[hash(key),seconds]);
 if(r.rows[0].count>max)fail(429,'RATE_LIMIT','요청이 많습니다. 잠시 후 다시 시도해 주세요.');
}
export function sameOrigin(request,env){const origin=request.headers.get('origin');if(!env.APP_ORIGIN&&(env.VERCEL||env.NODE_ENV==='production'))fail(503,'ORIGIN_NOT_CONFIGURED','접속 주소 설정을 준비 중입니다.');const allowed=[env.APP_ORIGIN||new URL(request.url).origin,...(env.APP_ALLOWED_ORIGINS||'').split(',').filter(Boolean)];if(!allowed.includes(origin))fail(403,'ORIGIN','허용되지 않은 요청입니다.');}
// Persistent per-device login, renewed by real authenticated requests at most daily.
export const SESSION_SECONDS=365*24*60*60;
const SESSION_RENEW_AFTER_SECONDS=24*60*60;
export function cookie(value,env,maxAge=SESSION_SECONDS){return `ml_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${env.NODE_ENV==='production'||env.VERCEL?' ; Secure':''}`;}
export async function session(db,request,onRenew=()=>{}){
 const raw=request.headers.get('cookie')?.match(/(?:^|;\s*)ml_session=([^;]+)/)?.[1];
 if(!raw)return null;
 const r=await db.query(`SELECT u.id,u.username,(SELECT data->>'name' FROM moment_link.config WHERE id='staff:'||u.id::text) AS "displayName",u.role,u.must_change_password,s.csrf,s.token_hash,s.expires_at<=now()+$2*interval '1 second' AS renew_session FROM moment_link.sessions s JOIN moment_link.admin_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,[hash(raw),SESSION_SECONDS-SESSION_RENEW_AFTER_SECONDS]);
 const user=r.rows[0];if(!user)return null;
 if(user.renew_session){
  // Never recreate revoked/expired sessions; the same token keeps concurrent tabs valid.
  const renewed=await db.query(`UPDATE moment_link.sessions s SET expires_at=now()+$2*interval '1 second' WHERE s.token_hash=$1 AND s.expires_at>now() AND EXISTS(SELECT 1 FROM moment_link.admin_users u WHERE u.id=s.user_id AND u.active=true) RETURNING s.token_hash`,[user.token_hash,SESSION_SECONDS]);
  if(!renewed.rows.length)return null;
  onRenew(raw);
 }
 delete user.renew_session;return user;
}
export function authorize(user,admin=false){if(!user)fail(401,'AUTH_REQUIRED','관리자 로그인이 필요합니다.');if(user.must_change_password)fail(403,'PASSWORD_CHANGE_REQUIRED','임시 비밀번호를 먼저 변경해 주세요.');if(admin&&user.role!=='admin')fail(403,'FORBIDDEN','관리자 권한이 필요합니다.');}
export function csrf(request,user){if(!user||request.headers.get('x-csrf-token')!==user.csrf)fail(403,'CSRF','세션을 새로 확인한 후 시도해 주세요.');}
