import {z} from 'zod';
import {fail} from './security.mjs';
export const text=(max,min=0)=>z.string().trim().min(min).max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(v),'허용되지 않는 문자가 있습니다.');
const id=text(80,1).refine(v=>/^[a-zA-Z0-9_-]+$/.test(v));
const price=z.number().int().min(0).max(100000000).nullable();
export const packageSchema=z.object({id,name:text(100,1),weekday:price,weekend:price,summary:text(500),features:z.array(text(500)).max(40),note:text(1000)}).strict().refine(p=>p.weekday!==null||p.weekend===null);
export const productSchema=z.object({id,category:z.enum(['yacht','visit','trunk','heli']),sub:z.enum(['sail','dock','main']),name:text(100,1),short:text(500),description:text(5000),visible:z.boolean(),photo:z.string().max(2000).refine(v=>!v||/^\/api\/media\/[a-f0-9-]{36}$/.test(v)||/^https:\/\//.test(v)),bouquet:z.boolean(),packages:z.array(packageSchema).min(1).max(30),archived:z.boolean().optional()}).strict().refine(p=>new Set(p.packages.map(x=>x.id)).size===p.packages.length);
export const catalogSchema=z.array(productSchema).min(1).max(200).refine(p=>new Set(p.map(x=>x.id)).size===p.length);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;}
const preference=z.object({date:text(10).refine(validDate),time:z.string().refine(v=>['오전','오후','저녁','시간 무관'].includes(v)||/^([01]\d|2[0-3]):[0-5]\d$/.test(v))}).strict();
export const consultationSchema=z.object({catalogVersion:z.number().int().positive(),productId:id,packageId:id,category:z.enum(['yacht','visit','trunk','heli']),person:text(80,1),phone:z.string().transform(v=>v.replace(/[\s-]/g,'')).pipe(z.string().regex(/^01[016789]\d{7,8}$/)),preferences:z.array(preference).min(1).max(2),place:text(500),notes:text(2000),consent:z.literal(true),consentVersion:text(80,1),website:z.string().max(0).optional()}).strict();
export function parse(schema,input){const r=schema.safeParse(input);if(!r.success)fail(400,'VALIDATION','입력 내용을 확인해 주세요.');return r.data;}
export function validatePreferences(p){if(p.some(x=>x.date<today()))fail(400,'PAST_DATE','과거 날짜는 선택할 수 없습니다.');if(p.length===2&&p[0].date===p[1].date&&p[0].time===p[1].time)fail(400,'DUPLICATE_PREFERENCE','1·2순위 일정은 다르게 선택해 주세요.');}
