// Read existing audit events. No backfill, inferred update times, or OPS writes.
const states=new Set(['new','initial_unreachable','consulting','no_response','awaiting_payment','confirmed','hold','closed','cancelled']);
export const timelineActions=['consultation.updated','ownership.started','reservation.direct_created','reservation.confirmed','reservation.restored','ops.confirmed','ops.cancelled','ops.restored','ops.inbound.applied'];
export function statusTimeline(history){
 const result=[];
 const rank=action=>action==='reservation.direct_created'?0:action==='ownership.started'?1:action==='consultation.updated'?3:2;
 for(const entry of [...history].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)||rank(a.action)-rank(b.action)||String(a.id||'').localeCompare(String(b.id||'')))){
  const d=entry.detail||{};let from,to;
  if(['consultation.updated','reservation.confirmed'].includes(entry.action)){from=d.from;to=d.to;}
  if(entry.action==='ownership.started'){from=d.statusFrom;to=d.statusTo;}
  if(entry.action==='reservation.direct_created'){from=null;to='consulting';}
  if(entry.action==='ops.confirmed'){from=null;to='confirmed';}
  if(entry.action==='ops.cancelled'){from='confirmed';to='cancelled';}
  if(['ops.restored','reservation.restored'].includes(entry.action)){from='cancelled';to='confirmed';}
  if(entry.action==='ops.inbound.applied'){
   const names={ready:'confirmed',cancelled:'cancelled'};from=names[d.before?.state];to=names[d.after?.state];
  }
  if(!states.has(to)||from===to||!Number.isFinite(new Date(entry.created_at).getTime()))continue;
  // Confirmation and its enclosing status update can both audit the same transition.
  if(result.at(-1)?.to===to)continue;
  result.push({from:states.has(from)?from:null,to,at:new Date(entry.created_at).toISOString(),actor:entry.actor_name||'시스템',action:entry.action});
 }
 return result;
}
export async function attachStatusTimelines(db,items){
 if(!items.length)return items;
 const history=(await db.query(`SELECT a.id,a.entity_id,a.action,a.detail,a.created_at,
  COALESCE(p.data->>'name',u.username,'시스템') AS actor_name
  FROM moment_link.audit_logs a LEFT JOIN moment_link.admin_users u ON u.id=a.actor_id
  LEFT JOIN moment_link.config p ON p.id='staff:'||u.id::text
  WHERE a.entity_id=ANY($1::text[]) AND a.action=ANY($2::text[]) ORDER BY a.created_at,a.id`,[items.map(r=>r.id),timelineActions])).rows;
 const groups=new Map();for(const event of history){if(!groups.has(event.entity_id))groups.set(event.entity_id,[]);groups.get(event.entity_id).push(event);}
 for(const row of items){
  row.status_timeline=statusTimeline(groups.get(row.id)||[]);
  const latest=row.status_timeline.at(-1);
  row.status_changed_at=latest?.to===row.status?latest.at:null;
  row.awaiting_payment_at=row.status==='awaiting_payment'?row.status_changed_at:null;
 }
 return items;
}
