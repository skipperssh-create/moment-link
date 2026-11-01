import {z} from 'zod';
import {randomUUID,createHash} from 'node:crypto';
import {text,parse,validDate} from './validation.mjs';
import {fail,audit} from './security.mjs';
import '../messages.js';
const stages=z.enum(['receipt','confirmed','reminder','thanks']);
const booking=z.object({date:z.union([z.literal(''),text(10).refine(validDate)]),time:z.union([z.literal(''),z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),amount:z.number().int().min(0).max(100000000).nullable(),place:text(500),scheduleConfirmed:z.boolean(),paymentConfirmed:z.boolean(),extra:text(1000)}).strict();
const drafts=z.object(Object.fromEntries(['receipt','confirmed','reminder','thanks'].map(k=>[k,text(5000).optional()]))).strict();
export async function saveCommunication(tx,r,user,method,input){
 const old=r.communication||{};
 const d=parse(method==='PUT'?z.object({version:z.number().int(),booking,drafts}).strict():z.object({version:z.number().int(),stage:stages,kind:z.enum(['composer_requested','manual_sent']),eventId:z.string().uuid()}).strict(),input);
 // Retried clicks cannot duplicate the log, even if the original response was lost.
 if(method==='POST'&&(old.events||[]).some(e=>e.id===d.eventId))return {item:r};
 if(r.version!==d.version)fail(409,'VERSION','다른 직원이 변경했습니다. 상담을 다시 열고 확인해 주세요.');
 let next;
 if(method==='PUT'){
  next={...old,booking:d.booking,drafts:d.drafts};
  await audit(tx,user.id,'communication.saved',r.id);
 }else{
  const problem=MomentLinkMessages.validate(d.stage,old.booking||{},r);
  if(problem)fail(400,'MESSAGE_NOT_READY',problem);
  const message=old.drafts?.[d.stage];if(!message?.trim())fail(400,'MESSAGE_EMPTY','문구를 먼저 저장해 주세요.');
  const digest=createHash('sha256').update(message).digest('hex');
  next={...old,events:[...(old.events||[]),{id:d.eventId||randomUUID(),stage:d.stage,kind:d.kind,at:new Date().toISOString(),actor:user.username,digest}].slice(-40)};
  await audit(tx,user.id,'communication.'+d.kind,r.id,{stage:d.stage});
 }
 const item=(await tx.query('UPDATE moment_link.consultations SET communication=$1,version=version+1,updated_at=now() WHERE id=$2 RETURNING *',[JSON.stringify(next),r.id])).rows[0];
 return {item};
}
