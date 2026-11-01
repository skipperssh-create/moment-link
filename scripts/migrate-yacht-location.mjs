import {audit} from '../server/security.mjs';
import '../pricing.js';

// Only the two user-confirmed location settings change. Historical bookings remain intact.
export async function migrateYachtLocation(tx){
 const row=(await tx.query("SELECT data FROM moment_link.config WHERE id='settings' FOR UPDATE")).rows[0];
 if((await tx.query('SELECT version FROM moment_link.migrations WHERE version=5')).rows.length)return;
 if(!row)throw Error('Settings must be seeded before applying the yacht location');
 const next={...row.data,yachtPlace:MomentLinkPricing.yachtPlace,yachtAddress:MomentLinkPricing.yachtAddress};
 if(JSON.stringify(next)!==JSON.stringify(row.data)){
  await tx.query("UPDATE moment_link.config SET data=$1,version=version+1,updated_at=now() WHERE id='settings'",[JSON.stringify(next)]);
  await audit(tx,null,'settings.yacht_location.updated','settings',{migration:5});
 }
 await tx.query('INSERT INTO moment_link.migrations(version) VALUES(5)');
}
