import webpush from 'web-push';
import {fail,rateLimit} from './security.mjs';
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export async function pushDeviceStatus(db,user,env,endpointHash){
 if(endpointHash&&!validHash(endpointHash))fail(400,'PUSH_DEVICE','이 기기 알림 연결을 다시 확인해 주세요.');
 const settings=(await db.query("SELECT data FROM moment_link.config WHERE id='settings'")).rows[0].data;
 const sub=endpointHash?(await db.query('SELECT active FROM moment_link.push_subscriptions WHERE endpoint_hash=$1 AND user_id=$2',[endpointHash,user.id])).rows[0]:null;
 const repeat=(await db.query("SELECT updated_at>now()-interval '5 minutes' AS running FROM moment_link.config WHERE id='push-repeat-worker'")).rows[0];
 const failures=endpointHash?(await db.query(`SELECT count(*)::int AS n FROM moment_link.push_alert_deliveries d JOIN moment_link.push_subscriptions s ON s.id=d.subscription_id JOIN moment_link.consultation_alerts a ON a.consultation_id=d.consultation_id JOIN moment_link.consultations c ON c.id=a.consultation_id WHERE s.endpoint_hash=$1 AND s.user_id=$2 AND d.failures>=2 AND a.acknowledged_at IS NULL AND c.status='new' AND c.deleted_at IS NULL AND c.expires_at>now()`,[endpointHash,user.id])).rows[0].n:0;
 return {enabled:settings.push===true&&env.PUSH_LIVE_ENABLED==='true',configured:!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY),registered:sub?.active===true,repeatRunning:!!repeat?.running,deliveryProblem:failures>0,vapidPublicKey:env.VAPID_PUBLIC_KEY||''};
}
export async function testDevicePush(db,user,env,endpointHash,adapters={}){
 if(!validHash(endpointHash))fail(400,'PUSH_DEVICE','먼저 이 기기 알림을 연결해 주세요.');
 const status=await pushDeviceStatus(db,user,env,endpointHash);
 if(!status.enabled||!status.configured)fail(409,'PUSH_DISABLED','서버 푸시 연결과 사용 설정을 확인해 주세요.');
 if(!status.registered)fail(409,'PUSH_DEVICE','이 기기 알림을 다시 연결해 주세요.');
 await rateLimit(db,'push-test:'+user.id,2,60);
 const sub=(await db.query('SELECT id,subscription FROM moment_link.push_subscriptions WHERE endpoint_hash=$1 AND user_id=$2 AND active=true',[endpointHash,user.id])).rows[0];
 if(!sub)fail(409,'PUSH_DEVICE','이 기기 알림을 다시 연결해 주세요.');
 try{
  if(!adapters.push)webpush.setVapidDetails(env.VAPID_SUBJECT||'mailto:admin@teamboatn.com',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  await (adapters.push||webpush.sendNotification)(sub.subscription,JSON.stringify({type:'device-test',url:'/#admin',tag:'moment-link-device-test'}),{TTL:300,urgency:'high',timeout:10000});
 }catch(err){
  if([404,410].includes(err.statusCode)){await db.query('UPDATE moment_link.push_subscriptions SET active=false WHERE id=$1 AND user_id=$2',[sub.id,user.id]);fail(409,'PUSH_EXPIRED','이 기기 알림 연결이 만료됐습니다. 다시 연결해 주세요.');}
  fail(502,'PUSH_TEST_FAILED','테스트 알림 결과를 확인할 수 없습니다. 자동 재발송하지 않았습니다.');
 }
 return {ok:true,state:'provider_accepted'};
}
