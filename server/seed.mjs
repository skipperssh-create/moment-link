import catalog from '../catalog.confirmed.json' with {type:'json'};
export const initialSettings={solapi:false,customerAuto:false,adminAuto:false,push:false,smsNumber:'010-8009-8047',mainNumber:'1833-8047',adminSms:'',yachtPlace:'한국해양대학교 요트면허시험장 앞 주차장',yachtAddress:'부산광역시 영도구 태종로 727',heliGunsan:'군산 (상세 위치는 최종 안내)',heliByeonsan:'변산 (상세 위치는 최종 안내)',privacyController:'',privacyContact:'',retentionDays:null,privacyText:'',consentVersion:'draft',accepting:false,customerTemplate:'[모먼트링크] 상담 신청이 접수되었습니다. 접수번호: {receipt}',adminTemplate:'[모먼트링크] 새로운 상담 신청: {receipt}'};
export async function seed(db){
 await db.query(`INSERT INTO moment_link.config(id,data) VALUES('settings',$1) ON CONFLICT DO NOTHING`,[JSON.stringify(initialSettings)]);
 await db.query(`INSERT INTO moment_link.config(id,data) VALUES('catalog_draft',$1) ON CONFLICT DO NOTHING`,[JSON.stringify(catalog)]);
 await db.query(`INSERT INTO moment_link.catalog_versions(version,products) VALUES(1,$1) ON CONFLICT DO NOTHING`,[JSON.stringify(catalog)]);
}
