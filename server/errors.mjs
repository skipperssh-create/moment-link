export function publicError(e,requestId){
 if(e.status)return {status:e.status,body:{error:e.code||'REQUEST_FAILED',message:e.message,requestId}};
 let error='INTERNAL_ERROR',status=500,message='서버 내부 처리 오류로 저장 완료 여부를 확인하지 못했습니다. 같은 작업을 반복하지 말고 아래 확인 번호를 담당자에게 알려 주세요.';
 if(e instanceof TypeError&&/reading ['"](quote|location|yachtRoute)['"]/.test(e.message||'')){
  error='BOOKING_PRICING_UNAVAILABLE';message='예약 금액·안내문 계산 모듈을 불러오지 못했습니다. 화면을 새로고침한 뒤 다시 저장해 주세요. 계속 발생하면 아래 확인 번호를 담당자에게 알려 주세요.';
 }else if(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','57P01','57P03','08006','08001','53300'].includes(e.code)){
  error='DATABASE_UNAVAILABLE';status=503;message='저장 서버 연결이 끊겼거나 응답이 지연되었습니다. 예약을 다시 열어 저장 여부를 확인한 뒤 진행해 주세요.';
 }
 return {status,body:{error,message,requestId}};
}
export function errorDiagnostic(e,requestId,path){
 const frames=String(e.stack||'').split('\n').slice(1).map(x=>x.match(/(?:\/|\\\\)((?:[\w-]+\.)?m?js):(\d+):(\d+)/)).filter(Boolean).slice(0,4).map(x=>x.slice(1).join(':'));
 return {requestId,code:publicError(e,requestId).body.error,type:e.name||'Error',path,frames};
}
