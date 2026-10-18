'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {check} = require('../assets/agent-handoff-core.js');
const base = {
 jobId:'CATALOG-104', buyerAgent:'Merchant-Agent-A', sellerAgent:'REORK-Agent-B',
 buyerCountry:'CA', sellerCountry:'GB', deliverable:'100-row CSV exceptions',
 currency:'CAD', amountMinor:35000, dueUtc:'2026-11-03T17:00:00Z',
 acceptanceCriteria:['CSV exception list','QA checklist'],
 dataRules:'redacted product records only', approvalRequired:true
};
const dup = x => JSON.parse(JSON.stringify(x));
test('matched terms still require review',()=>assert.equal(check(base,dup(base)).status,'READY_FOR_HUMAN_REVIEW'));
test('different country values are allowed across party roles',()=>assert.equal(check(base,dup(base)).status,'READY_FOR_HUMAN_REVIEW'));
for (const [field,newValue] of [
 ['amountMinor',39000],['currency','USD'],['dueUtc','2026-11-05T17:00:00Z'],
 ['deliverable','different deliverable'],['buyerCountry','US'],['sellerCountry','US'],
 ['dataRules','share customer identities'],['jobId','OTHER-104'],
 ['approvalRequired',false]
]) {
 test('mismatch '+field+' forces hold',()=>assert.equal(check(base,{...dup(base),[field]:newValue}).status,'HOLD'));
}
test('acceptance order is immaterial',()=>assert.equal(check(base,{...base,acceptanceCriteria:[...base.acceptanceCriteria].reverse()}).status,'READY_FOR_HUMAN_REVIEW'));
test('changed acceptance requires hold',()=>assert.equal(check(base,{...base,acceptanceCriteria:['CSV only']}).status,'HOLD'));
test('both agents turning off human approval triggers hold',()=>assert.equal(check({...base,approvalRequired:false},{...base,approvalRequired:false}).status,'HOLD'));
for (const [name,side] of [
 ['missing criteria',{...base,acceptanceCriteria:[]}],
 ['duplicate criteria',{...base,acceptanceCriteria:['x','x']}],
 ['negative price',{...base,amountMinor:-2}],
 ['unsafe float price',{...base,amountMinor:10.3}],
 ['missing buyer',{...base,buyerAgent:''}],
 ['missing seller',{...base,sellerAgent:''}],
 ['invalid UTC',{...base,dueUtc:'tomorrow'}],
 ['invalid country',{...base,buyerCountry:'Canada'}],
 ['proposal array',[]]
]) {
 test('reject invalid '+name,()=>assert.equal(check(side,base).status,'INVALID_INPUT'));
}
