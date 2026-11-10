export const consultationStates=['new','initial_unreachable','consulting','no_response','awaiting_payment','hold'];
export const reopenedReservation=r=>!!r?.communication?.reservation&&consultationStates.includes(r.status);
export const activeReservation=r=>!!r?.communication?.reservation&&(r.status==='confirmed'||consultationStates.includes(r.status));
