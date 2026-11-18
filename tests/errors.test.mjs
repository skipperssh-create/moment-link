import test from 'node:test';import assert from 'node:assert/strict';import {publicError,errorDiagnostic} from '../server/errors.mjs';
test('known pricing and storage failures provide a cause and request reference without exposing private errors',()=>{
 const p=publicError(new TypeError("Cannot read properties of undefined (reading 'quote')"),'ref-1');assert.equal(p.body.error,'BOOKING_PRICING_UNAVAILABLE');assert.match(p.body.message,/계산 모듈/);
 const db=Object.assign(new Error('secret database URL'),{code:'ECONNRESET'});assert.equal(publicError(db,'ref-2').status,503);assert.doesNotMatch(JSON.stringify(publicError(db,'ref-2')),/secret/);
 const unknown=new Error('customer phone and credentials');unknown.stack='Error: customer phone and credentials\n at generate (/var/task/messages.js:260:9)';const u=publicError(unknown,'ref-3');assert.equal(u.body.requestId,'ref-3');assert.doesNotMatch(JSON.stringify(u),/credentials/);const d=errorDiagnostic(unknown,'ref-3','/api/admin/consultations/:id/communications');assert.deepEqual(d.frames,['messages.js:260:9']);assert.doesNotMatch(JSON.stringify(d),/credentials/);
 const validation=Object.assign(new Error('입금액을 입력해 주세요.'),{status:400,code:'PAYMENT_REQUIRED'});assert.equal(publicError(validation,'ref-4').body.message,validation.message);
});

test('HTTP error handling returns a diagnostic response even when booking calculation fails',async()=>{
 const {createApp}=await import('../server/app.mjs');
 const app=createApp({db:{query:async()=>{throw new TypeError("Cannot read properties of undefined (reading 'quote')");}},env:{APP_ORIGIN:'https://test.invalid'}});
 const response=await app(new Request('https://test.invalid/api/catalog'));const body=await response.json();assert.equal(response.status,500);assert.equal(body.error,'BOOKING_PRICING_UNAVAILABLE');assert.ok(body.requestId);
});
