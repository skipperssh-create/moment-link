import {timingSafeEqual} from 'node:crypto';
import {eraseConsultations} from './trash.mjs';
import {audit} from './security.mjs';

export function authorizedCron(request,secret){
 if(!secret||secret.length<32)return false;
 const actual=Buffer.from(request.headers.get('authorization')||''),expected=Buffer.from('Bearer '+secret);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function purgeExpired(db){
 return db.transaction(async tx=>{
  await tx.query("SELECT pg_advisory_xact_lock(hashtext('moment-link-retention'))");
  const expired=(await tx.query('SELECT id FROM moment_link.consultations WHERE expires_at<=now() OR delete_after<=now() ORDER BY expires_at LIMIT 500 FOR UPDATE')).rows.map(r=>r.id);
  await eraseConsultations(tx,expired);
  await tx.query('DELETE FROM moment_link.sessions WHERE expires_at<=now()');
  await tx.query('DELETE FROM moment_link.rate_limits WHERE expires_at<=now()');
  await tx.query("DELETE FROM moment_link.audit_logs WHERE created_at<now()-interval '90 days'");
  await tx.query("INSERT INTO moment_link.config(id,data) VALUES('maintenance',$1) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()",[JSON.stringify({lastRun:new Date().toISOString(),deleted:expired.length})]);
  if(expired.length)await audit(tx,null,'privacy.expired.deleted','maintenance',{count:expired.length});
  return {deleted:expired.length};
 });
}
