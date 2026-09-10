import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQrInput, profileWebUrl, publicSearchText } from '../src/lib/qr-input.ts';
for (const [value, expected] of [
 ['QRG-AB02777','QRG-AB02777'],[' qrg-a00174 ','QRG-A00174'],
 ['https://qrguitar.com/i/QRG-A00174','QRG-A00174'],
 ['https://www.qrguitar.com/i/qrg-a00174/','QRG-A00174'],
 ['http://qrguitar.com/i/QRG-A00174','QRG-A00174'],
 ['https://qrguitar.com/i/QRG-A00174?utm_source=label#photos','QRG-A00174'],
 ['qrguitar://i/QRG-A00174','QRG-A00174'],['qrguitar:///i/QRG-A00174','QRG-A00174']
]) test('recognizes Profile identity '+value,()=>assert.equal(parseQrInput(value),expected));
for (const value of [
 '', 'QRG-', 'QRG-A_1','QRG-'+ 'A'.repeat(65),
 'https://qrguitar.com.evil.test/i/QRG-A00174','https://evil.test/qrguitar.com/i/QRG-A00174',
 'https://qrguitar.com@evil.test/i/QRG-A00174','https://person:secret@qrguitar.com/i/QRG-A00174',
 'https://qrguitar.com:8080/i/QRG-A00174','javascript:alert(1)','file:///i/QRG-A00174',
 'https://qrguitar.com/transfer/QRG-A00174','https://qrguitar.com/i/QRG-A00174/extra',
 'qrguitar://evil/i/QRG-A00174','https://qrguitar.com/i/QRG-A%2f00174',
 'https://qrguitar.com/i/%E0%A4%A','QRG-A\u0000B','https://qrgu\nitar.com/i/QRG-A00174'
]) test('rejects unrecognized or unsafe scan '+JSON.stringify(value),()=>assert.equal(parseQrInput(value),null));
test('generated Profile link discards incoming URL data and uses fixed HTTPS destination',()=>{
 assert.equal(profileWebUrl('qrg-a00174'),'https://qrguitar.com/i/QRG-A00174');
 assert.equal(profileWebUrl('QRG-A00174',true),'https://qrguitar.com/dashboard/profile/QRG-A00174');
 assert.throws(()=>profileWebUrl('https://evil.test'));assert.throws(()=>profileWebUrl('https://qrguitar.com/i/QRG-A00174?secret=x'));
});
test('public search includes year without consulting hidden serial fields',()=>{
 const record={qrCode:'QRG-123',name:'Amp',brand:'Fender',year:'1991',serial:'PRIVATE'};
 assert.equal(publicSearchText(record,'1991'),true);assert.equal(publicSearchText(record,'private'),false);
});
