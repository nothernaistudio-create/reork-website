'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, compare, exportIssues } = require('../assets/receipt-check-core');

const source = 'id,amount,currency,status\nORD-101,29.00,USD,paid\nORD-102,20.00,USD,paid\nORD-103,14.00,USD,paid\nORD-104,15.00,USD,paid';
const destination = 'id,amount,currency,status\nORD-101,29,USD,paid\nORD-103,14.00,USD,refunded\nORD-104,15.00,USD,paid\nORD-104,15.00,USD,paid\nORD-105,20.00,USD,paid';

test('classifies matches, missing, unexpected, duplicate and mismatch without double-counting', () => {
  const out = compare(parseCsv(source), parseCsv(destination));
  assert.deepEqual(out.counts, {expected:4, delivered:5, matched:1, missing:1, unexpected:1, mismatch:1, duplicate:1});
  assert.equal(out.issues.length, 4);
  assert.equal(out.issues.find(x => x.id === 'ORD-102').type, 'MISSING');
  assert.equal(out.issues.find(x => x.id === 'ORD-103').type, 'MISMATCH');
  assert.equal(out.issues.find(x => x.id === 'ORD-104').type, 'DUPLICATE_ID');
  assert.equal(out.issues.find(x => x.id === 'ORD-105').type, 'UNEXPECTED');
});
test('CSV parser handles UTF-8 BOM, quoted comma, escaped quotes and multiline fields', () => {
  const p = parseCsv('\uFEFFid,amount,currency,status\r\n"ref, 1",1.50,USD,"paid ""true"""\r\n"ref\n2",2.0,CAD,refunded');
  assert.equal(p.records.length,2);
  assert.equal(p.records[0].id,'ref, 1');
  assert.equal(p.records[0].status,'paid "true"');
  assert.equal(p.records[1].id,'ref\n2');
});
test('rejects malformed CSV quotes, missing IDs, bad width and duplicated headers', () => {
  for (const data of [
    'id,amount\n"A",12"3', 'id,amount\n"A,123', 'id,amount\n,10',
    'amount,currency\n10,USD', 'id,id\n1,2', 'id,amount\n1,2,3'
  ]) assert.throws(() => parseCsv(data));
});
test('amount comparison handles cents; currency and refund status changes remain detectable', () => {
  const a = parseCsv('id,amount,currency,status\n1,10,usd,paid');
  const b = parseCsv('id,amount,currency,status\n1,10.00,USD,paid');
  assert.equal(compare(a,b).counts.matched,1);
  assert.equal(compare(a,parseCsv('id,amount,currency,status\n1,10.01,USD,paid')).counts.mismatch,1);
  assert.equal(compare(a,parseCsv('id,amount,currency,status\n1,10,CAD,paid')).counts.mismatch,1);
  assert.equal(compare(a,parseCsv('id,amount,currency,status\n1,10,USD,refunded')).counts.mismatch,1);
});
test('absence of optional column in one export is a mismatch, never assumed equal', () => {
  const a = parseCsv('id,amount\n1,10');
  const b = parseCsv('id\n1');
  assert.equal(compare(a,b).counts.mismatch,1);
});
test('detects duplicates in source as well as destination', () => {
  const a = parseCsv('id\n1\n1\n2'), b = parseCsv('id\n1\n2');
  const out = compare(a,b);
  assert.equal(out.counts.duplicate,1);
  assert.equal(out.counts.matched,1);
});
test('will not process oversized CSV or more than 5000 data rows', () => {
  assert.throws(() => parseCsv('id\n'+'x'.repeat(1024*1024+1)));
  const long = 'id\n'+Array.from({length:5001},(_,i)=>'R'+i).join('\n');
  assert.throws(() => parseCsv(long), /5,000/);
});
test('issue exports escape CSV and neutralize spreadsheet formulas in IDs', () => {
  const result = exportIssues([{id:'=HYPERLINK("bad", "click")',type:'MISSING',detail:'Value, not present'}]);
  assert.match(result,/^﻿id,type,detail\r\n"'\=HYPERLINK/);
  assert.match(result, /"Value, not present"/);
});
test('public beta states real limitations and calls core without network transport', () => {
  const html = fs.readFileSync(path.join(__dirname,'../receipt-check.html'),'utf8');
  const core = fs.readFileSync(path.join(__dirname,'../assets/receipt-check-core.js'),'utf8');
  assert.match(html,/manual CSV comparison only/);
  assert.match(html,/files are not uploaded/);
  assert.match(html,/not a subscription product|not a live payment verification service/);
  assert.match(html,/receipt-check-core\.js/);
  assert.doesNotMatch(core,/\bfetch\s*\(|XMLHttpRequest|https?:\/\/|localStorage|sessionStorage/);
});
