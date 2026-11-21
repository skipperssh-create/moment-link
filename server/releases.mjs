import history from '../release-history-source.json' with {type:'json'};
import manifest from '../release-history.json' with {type:'json'};
export async function releaseHistory(db){
 const current=manifest.current;
 await db.query('INSERT INTO moment_link.release_history(id,data) SELECT id,data FROM jsonb_to_recordset($1::jsonb) AS x(id text,data jsonb) ON CONFLICT(id) DO NOTHING',[JSON.stringify(history.map(r=>({id:r.id,data:r})))]);
 await db.query('INSERT INTO moment_link.release_history(id,data) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[current.id,JSON.stringify(current)]);
 const rows=(await db.query('SELECT data,first_seen_at FROM moment_link.release_history ORDER BY first_seen_at DESC')).rows;
 return {currentId:current.id,items:rows.map(r=>({...r.data,...(r.data.dateBasis==='버전 생성 시각'?{observedAt:r.first_seen_at}: {})})).sort((a,b)=>new Date(b.at)-new Date(a.at))};
}
