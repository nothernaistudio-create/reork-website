'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../connection-lab.html'),'utf8');
const script=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const a=script.indexOf('const configs='),b=script.indexOf('let current=');
const c=script.indexOf('function parseCsv('),d=script.indexOf('function safeCell(');
if(a<0||b<a||c<0||d<c)throw Error('Expected actual Connection Lab validation functions missing');
const ctx={TextEncoder,Date};
vm.runInNewContext(script.slice(a,b)+'\n'+script.slice(c,d)+'\nglobalThis.core={parseCsv,normalize};',ctx);
const {parseCsv,normalize}=ctx.core;

test('real service example parses and preserves urgent and missing-email gates',()=>{
  const rows=normalize('reference,customer,email,details,priority\nSR-1,Ashley,a@example.com,Leaking tap,normal\nSR-2,Bob,b@example.com,Flooded basement,urgent\nSR-3,Cam,,Broken light,low','service');
  assert.equal(rows.length,3);assert.equal(rows[0].status,'ready');
  assert.equal(rows[1].status,'review');assert.equal(rows[2].status,'blocked');
});

test('quoted commas and escaped quote survive actual source parser',()=>{
 const rows=parseCsv('ref,name\n"SR, 2","Tap ""seized"""\r\n');
 assert.equal(rows[1][0],'SR, 2');
 assert.equal(rows[1][1],'Tap "seized"');
});
test('malformed quoting does not silently mis-map columns',()=>{
 for(const csv of ['ref,name\nA"1,Bob','ref,name\n"A"X,Bob','ref,name\n"A,Bob']){
   assert.throws(()=>parseCsv(csv),/quotation mark|Unclosed/);
 }
});
test('quantities must be literal positive whole numbers, not exponent notation',()=>{
 const txt='po,vendor,email,item,quantity\nP1,Vendor,v@example.com,Nuts,25\nP2,Vendor,v@example.com,Bolts,1e3\nP3,Vendor,v@example.com,Pins,0\nP4,Vendor,v@example.com,Clips,-1';
 const rows=normalize(txt,'supplier');
 assert.deepEqual(Array.from(rows,x=>x.status),['ready','blocked','blocked','blocked']);
});
test('invoice amounts accept ordinary money, reject exponents and malformed grouping',()=>{
 const txt='invoice,customer,email,amount,due_date\nI1,A,a@example.com,1200.25,2027-11-18\nI2,B,b@example.com,1e3,2027-11-18\nI3,C,c@example.com,"12,34",2027-11-18\nI4,D,d@example.com,"1,234.50",2027-11-18';
 const rows=normalize(txt,'invoice');
 assert.deepEqual(Array.from(rows,x=>x.status),['ready','blocked','blocked','ready']);
});
test('invalid due date is blocked despite otherwise valid invoice',()=>{
 const rows=normalize('invoice,customer,email,amount,due_date\nI1,A,a@example.com,12.50,2027-02-31','invoice');
 assert.equal(rows[0].status,'blocked');
});
test('duplicate reference and extra CSV fields remain blocked',()=>{
 const rows=normalize('po,vendor,email,item,quantity\nP1,A,a@example.com,Nuts,2\nP1,B,b@example.com,Bolts,3\nP3,C,c@example.com,Pins,4,extra','supplier');
 assert.equal(rows[0].status,'ready');
 assert.equal(rows[1].status,'blocked');
 assert.equal(rows[2].status,'blocked');
});
