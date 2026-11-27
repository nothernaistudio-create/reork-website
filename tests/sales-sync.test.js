'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const home = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'sales-sync.html'), 'utf8');
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

class FakeElement {
  constructor(tag = 'div') { this.tag = tag; this.textContent = ''; this.children = []; this.listeners = {}; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  click() { if (!this.listeners.click) throw Error('Missing click listener'); this.listeners.click(); }
}
function setup() {
  const elements = new Map();
  const ids = ['newSale', 'repeatSale', 'refundSale', 'missingSale', 'reset', 'rows', 'result', 'recordCount'];
  for (const id of ids) elements.set(id, new FakeElement());
  const document = {
    getElementById(id) {
      if (!elements.has(id)) throw Error('Unknown ID ' + id);
      return elements.get(id);
    },
    createElement(tag) { return new FakeElement(tag); }
  };
  vm.runInNewContext(script, { document });
  return Object.fromEntries(elements);
}

test('homepage offers a clear service CTA to the actual new sales example', () => {
  assert.match(home, /href="\/sales-sync.html"/);
  assert.match(home, /id="case-title"/);
  assert.match(home, /href="#contact"/);
});
test('new service example discloses fictional test data and non-deployment', () => {
  assert.match(html, /Synthetic prototype check:.*9 \/ 9 automated tests passed/);
  assert.match(html, /Live seller-account connection:/);
  assert.match(html, /not configured/);
  assert.match(html, /no calls to Gumroad or Airtable/);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
  assert.match(html, /mailto:info@reorkai\.com/);
});
test('sample sale is stored once on repeat notification, then refund changes same row', () => {
  const ui = setup();
  ui.newSale.click();
  assert.equal(ui.recordCount.textContent, '1 record');
  assert.equal(ui.rows.children.length, 1);
  ui.repeatSale.click();
  assert.equal(ui.recordCount.textContent, '1 record');
  assert.match(ui.result.textContent, /Duplicate notification detected/);
  ui.refundSale.click();
  assert.equal(ui.recordCount.textContent, '1 record');
  assert.equal(ui.rows.children[0].children[3].children[0].textContent, 'Refunded');
});
test('missed notification is flagged, not fabricated as a recovered sale', () => {
  const ui = setup();
  ui.missingSale.click();
  assert.equal(ui.recordCount.textContent, '0 records');
  assert.match(ui.result.textContent, /needs a separately scoped reconciliation check/);
});
test('refund before sale does not invent a transaction; reset clears sample records', () => {
  const ui = setup();
  ui.refundSale.click();
  assert.equal(ui.recordCount.textContent, '0 records');
  ui.newSale.click();
  ui.reset.click();
  assert.equal(ui.recordCount.textContent, '0 records');
  assert.match(ui.result.textContent, /Nothing was sent or stored/);
});
