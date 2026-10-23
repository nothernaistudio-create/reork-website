'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../cockpit.html'),'utf8');
function script(){
  const a=html.indexOf('  const TASK_HOOK');
  const b=html.indexOf('  const CONTINUITY_HOOK',a);
  const c=html.indexOf('  async function sendTask()');
  const d=html.indexOf("  document.getElementById('s1Input').addEventListener",c);
  if(a<0||b<a||c<0||d<c)throw Error('Current Cockpit script controls are missing');
  return html.slice(a,b)+'\n'+html.slice(c,d)+'\nsendTask()';
}
async function run(input,answer,{status=202,body={ok:true,task_recorded:true,task_key:'owner_cockpit_123',queue_status:'queued'}}={}){
 const elems={
  s1Input:{value:input},
  s1St:{innerHTML:'',textContent:'',className:''},
  s1Btn:{disabled:false,innerHTML:'',textContent:'',dataset:{lbl:'Record Owner Command'}}
 };
 const calls=[];
 const ctx={
  window:{prompt:()=>answer},
  document:{getElementById:k=>elems[k]},
  setStatus:(id,txt,kind)=>{elems[id].textContent=txt;elems[id].className='status '+kind;},
  btnLoad:id=>{elems[id].disabled=true;},
  btnReset:id=>{elems[id].disabled=false;},
  fetch:async(url,opt)=>{calls.push({url,opt});return {ok:status>=200&&status<300,status,json:async()=>body};}
 };
 await vm.runInNewContext(script(),ctx);
 return {elems,calls};
}
test('real Cockpit uses old repaired endpoint and never persists an owner token in browser storage',()=>{
 assert.match(html,/\/api\/command-intake/);
 assert.match(html,/x-reork-runner-token/);
 assert.doesNotMatch(html,/localStorage|sessionStorage|document\.cookie/);
});
test('receipt-confirmed HTTP 202 displays real task key but NOT completed',async()=>{
 const r=await run('Repair the queue','temporary-token');
 assert.equal(r.calls.length,1);
 assert.equal(r.calls[0].opt.headers['x-reork-runner-token'],'temporary-token');
 assert.equal(JSON.parse(r.calls[0].opt.body).message,'Repair the queue');
 assert.match(r.elems.s1St.textContent,/owner_cockpit_123/);
 assert.match(r.elems.s1St.textContent,/Not yet executed or verified/);
 assert.equal(r.elems.s1Input.value,'');
});
test('HTTP 200 without task receipt fails closed and retains user command',async()=>{
 const r=await run('Do real work','owner-token',{status:200,body:{ok:true}});
 assert.equal(r.calls.length,1);
 assert.match(r.elems.s1St.textContent,/Not confirmed in REORK queue/);
 assert.equal(r.elems.s1Input.value,'Do real work');
});
test('no owner authorization means no request',async()=>{
 const r=await run('Check queue',null);
 assert.equal(r.calls.length,0);
 assert.equal(r.elems.s1Input.value,'Check queue');
 assert.match(r.elems.s1St.textContent,/authorization/);
});
test('HTTP 401 is a failure, not a fake completed job',async()=>{
 const r=await run('Check queue','bad-token',{status:401,body:{ok:false,error:'Token invalid'}});
 assert.match(r.elems.s1St.textContent,/Token invalid/);
 assert.equal(r.elems.s1Input.value,'Check queue');
});
