import {createHash} from 'node:crypto';
import webpush from 'web-push';
import {audit,fail} from './security.mjs';

export const ALERT_INTERVAL_SECONDS=120;
const active="a.acknowledged_at IS NULL AND c.status='new' AND c.read_at IS NULL AND c.deleted_at IS NULL AND c.expires_at>now()";
async function enabled(db,env){return env.PUSH_LIVE_ENABLED==='true'&&!!env.VAPID_PUBLIC_KEY&&!!env.VAPID_PRIVATE_KEY&&(await db.query("SELECT data->>'push' AS enabled FROM moment_link.config WHERE id='settings'")).rows[0]?.enabled==='true';}

// Called only for a newly accepted public consultation with push enabled.
export async function createConsultationAlert(tx,id){
 await tx.query('INSERT INTO moment_link.consultation_alerts(consultation_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
}
export async function acknowledgeConsultationAlert(db,user,id){
 return db.transaction(async tx=>{
  const r=(await tx.query('SELECT assignee FROM moment_link.consultations WHERE id=$1 AND deleted_at IS NULL AND expires_at>now()',[id])).rows[0];
  if(!r)fail(404,'NOT_FOUND','접수건을 찾을 수 없습니다.');
  if(user.role!=='admin'&&r.assignee&&r.assignee!==user.id)fail(403,'NOT_ASSIGNED','담당 상담사 또는 관리자가 확인해 주세요.');
  const result=await tx.query('UPDATE moment_link.consultation_alerts SET acknowledged_at=now(),acknowledged_by=$2 WHERE consultation_id=$1 AND acknowledged_at IS NULL RETURNING consultation_id',[id,user.id]);
  if(result.rows.length)await audit(tx,user.id,'notification.acknowledged',id);
  return {ok:true};
 });
}
export async function consultationAlertSummary(db,user){
 const r=(await db.query(`SELECT count(*)::int AS pending,max(a.created_at) AS latest FROM moment_link.consultation_alerts a JOIN moment_link.consultations c ON c.id=a.consultation_id WHERE ${active} AND ($1='admin' OR c.assignee=$2 OR c.assignee IS NULL)`,[user.role,user.id])).rows[0];
 return {alertPending:r.pending,alertLatestAt:r.latest?new Date(r.latest).toISOString():null};
}
export async function dispatchConsultationAlerts(db,env,adapters={},id=null){
 if(!await enabled(db,env))return {enabled:false,sent:0,failed:0};
 // Enroll only active admin devices. New subscriptions may pick up unacknowledged new intakes.
 await db.query(`INSERT INTO moment_link.push_alert_deliveries(consultation_id,subscription_id)
 SELECT a.consultation_id,s.id FROM moment_link.consultation_alerts a JOIN moment_link.consultations c ON c.id=a.consultation_id
 CROSS JOIN moment_link.push_subscriptions s JOIN moment_link.admin_users u ON u.id=s.user_id
 WHERE ${active} AND s.active AND u.active AND u.role='admin' AND ($1::uuid IS NULL OR a.consultation_id=$1) ON CONFLICT DO NOTHING`,[id]);
 const due=(await db.query(`SELECT d.consultation_id,d.subscription_id FROM moment_link.push_alert_deliveries d
 JOIN moment_link.consultation_alerts a ON a.consultation_id=d.consultation_id JOIN moment_link.consultations c ON c.id=a.consultation_id
 WHERE ${active} AND d.next_at<=now() AND d.failures<2 AND ($1::uuid IS NULL OR d.consultation_id=$1) ORDER BY d.next_at LIMIT 50`,[id])).rows;
 if(!adapters.push)webpush.setVapidDetails(env.VAPID_SUBJECT||'mailto:admin@teamboatn.com',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
 const result={enabled:true,sent:0,failed:0},deadline=Date.now()+40000;
 for(const item of due){
  if(Date.now()>deadline)break;
  // Claim before sending; a crash consumes one of two failure attempts. Overlapping ticks cannot send twice.
  const d=(await db.query(`UPDATE moment_link.push_alert_deliveries d SET next_at=to_timestamp((floor(extract(epoch FROM now())/120)+1)*120),failures=failures+1
   FROM moment_link.consultation_alerts a,moment_link.consultations c,moment_link.push_subscriptions s,moment_link.admin_users u
   WHERE d.consultation_id=$1 AND d.subscription_id=$2 AND a.consultation_id=d.consultation_id AND c.id=a.consultation_id
   AND s.id=d.subscription_id AND u.id=s.user_id AND s.active AND u.active AND u.role='admin'
   AND ${active} AND d.next_at<=now() AND d.failures<2 RETURNING s.subscription,d.sent_count`,[item.consultation_id,item.subscription_id])).rows[0];
  if(!d)continue;
  if(!await enabled(db,env))break;
  // A detail view may have acknowledged the alert while the worker claimed its delivery.
  if(!(await db.query(`SELECT a.consultation_id FROM moment_link.consultation_alerts a JOIN moment_link.consultations c ON c.id=a.consultation_id WHERE a.consultation_id=$1 AND ${active}`,[item.consultation_id])).rows.length)continue;
  try{
   const payload={type:'consultation-alert',repeat:d.sent_count>0,url:'/#admin/request/'+item.consultation_id,tag:'consultation:'+item.consultation_id};
   await (adapters.push||webpush.sendNotification)(d.subscription,JSON.stringify(payload),{TTL:ALERT_INTERVAL_SECONDS,urgency:'high',timeout:10000,topic:createHash('sha256').update(item.consultation_id).digest('base64url').slice(0,32)});
   await db.query('UPDATE moment_link.push_alert_deliveries SET last_sent_at=now(),failures=0,error_code=NULL,sent_count=sent_count+1 WHERE consultation_id=$1 AND subscription_id=$2',[item.consultation_id,item.subscription_id]);result.sent++;
  }catch(error){
   const expired=[404,410].includes(error.statusCode);
   if(expired)await db.query('UPDATE moment_link.push_subscriptions SET active=false WHERE id=$1',[item.subscription_id]);
   await db.query('UPDATE moment_link.push_alert_deliveries SET error_code=$3 WHERE consultation_id=$1 AND subscription_id=$2',[item.consultation_id,item.subscription_id,expired?'PUSH_EXPIRED':'PUSH_DELIVERY_FAILED']);result.failed++;
  }
 }
 return result;
}
