'use strict';
/*
 * REORK ReceiptCheck browser core, version 0.1.
 * Data stays in the browser. This library makes no network requests.
 * Compare expected business records with records reported by a downstream system.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReorkReceiptCheck = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const MAX_BYTES = 1024 * 1024;
  const MAX_ROWS = 5000;
  const FIELDS = new Set(['id', 'amount', 'currency', 'status']);
  function parseCsv(input) {
    if (typeof input !== 'string') throw Error('CSV text is required.');
    if (input.length > MAX_BYTES) throw Error('CSV is larger than the 1 MB beta limit.');
    const s = input.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', quoted = false, endedQuote = false, startingField = true;
    function finishField() {
      row.push(field); field = ''; startingField = true; endedQuote = false;
    }
    function finishRow() {
      finishField();
      if (row.some(x => x.trim() !== '')) {
        rows.push(row);
        if (rows.length > MAX_ROWS + 1) throw Error('Limit: 5,000 data rows per file.');
      }
      row = [];
    }
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else { quoted = false; endedQuote = true; }
        } else field += c;
      } else if (c === ',') finishField();
      else if (c === '\r' || c === '\n') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        finishRow();
      } else if (c === '"' && startingField && !endedQuote) {
        quoted = true; startingField = false;
      } else if (endedQuote && (c === ' ' || c === '\t')) {
        // whitespace after a quoted field is accepted; it is not field data
      } else if (endedQuote || c === '"') throw Error('Invalid quotation mark in CSV field.');
      else { field += c; startingField = false; }
    }
    if (quoted) throw Error('Unclosed quotation mark in CSV.');
    if (row.length || field.length || endedQuote) finishRow();
    if (rows.length < 2) throw Error('CSV must have a header and at least one record.');
    const columns = rows.shift().map(x => x.trim().toLowerCase());
    if (!columns.includes('id')) throw Error('A column named "id" is required in both CSV files.');
    if (new Set(columns).size !== columns.length) throw Error('Duplicate CSV column names.');
    const indexes = {};
    columns.forEach((name, i) => { if (FIELDS.has(name)) indexes[name] = i; });
    const records = rows.map((cells, index) => {
      if (cells.length !== columns.length) throw Error('Column mismatch at data row ' + (index + 1) + '.');
      const rec = {};
      for (const name of Object.keys(indexes)) rec[name] = cells[indexes[name]].trim();
      if (!rec.id) throw Error('Missing ID at data row ' + (index + 1) + '.');
      if (rec.id.length > 240) throw Error('ID too long at data row ' + (index + 1) + '.');
      return rec;
    });
    return { columns: Object.keys(indexes), records };
  }
  function money(value) {
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
    const negative = value.startsWith('-');
    const a = (negative ? value.slice(1) : value).split('.');
    const cents = BigInt(a[0]) * 100n + BigInt((a[1] || '').padEnd(2, '0'));
    return (negative ? -cents : cents).toString();
  }
  function normalize(field, value) {
    if (field === 'amount') return money(value);
    if (field === 'currency' || field === 'status') return value.trim().toUpperCase();
    return value;
  }
  function compare(expected, delivered) {
    if (!expected || !delivered) throw Error('Provide both parsed CSV files.');
    const fields = ['amount', 'currency', 'status'].filter(f => expected.columns.includes(f) || delivered.columns.includes(f));
    function indexRecords(list) {
      const map = new Map();
      for (const rec of list.records) {
        const arr = map.get(rec.id) || [];
        arr.push(rec);
        map.set(rec.id, arr);
      }
      return map;
    }
    const a = indexRecords(expected);
    const b = indexRecords(delivered);
    const ids = new Set([...a.keys(), ...b.keys()]);
    const issues = [];
    let matched = 0;
    for (const id of ids) {
      const left = a.get(id) || [], right = b.get(id) || [];
      if (left.length > 1 || right.length > 1) {
        issues.push({ id, type: 'DUPLICATE_ID', detail: 'Source occurrences: ' + left.length + '; destination occurrences: ' + right.length });
      } else if (!left.length) {
        issues.push({ id, type: 'UNEXPECTED', detail: 'Appears only in destination.' });
      } else if (!right.length) {
        issues.push({ id, type: 'MISSING', detail: 'Appears only in expected source.' });
      } else {
        const changed = fields.filter(f => {
          const oldVal = left[0][f], newVal = right[0][f];
          if (oldVal === undefined || newVal === undefined) return true;
          const l = normalize(f, oldVal), r = normalize(f, newVal);
          if (l === null || r === null) return oldVal !== newVal || oldVal.length > 0;
          return l !== r;
        });
        if (changed.length) {
          issues.push({ id, type: 'MISMATCH', detail: 'Different or missing field(s): ' + changed.join(', ') });
        } else matched++;
      }
    }
    const counts = { expected: expected.records.length, delivered: delivered.records.length, matched, missing: 0, unexpected: 0, mismatch: 0, duplicate: 0 };
    for (const item of issues) {
      if (item.type === 'MISSING') counts.missing++;
      if (item.type === 'UNEXPECTED') counts.unexpected++;
      if (item.type === 'MISMATCH') counts.mismatch++;
      if (item.type === 'DUPLICATE_ID') counts.duplicate++;
    }
    issues.sort((x,y) => x.type.localeCompare(y.type) || x.id.localeCompare(y.id));
    return { counts, issues };
  }
  function quoteCsv(value) {
    let s = String(value);
    // Prevent spreadsheet formula execution in Excel/Sheets exported files.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function exportIssues(issues) {
    return '\uFEFF' + ['id,type,detail', ...issues.map(x => [x.id, x.type, x.detail].map(quoteCsv).join(','))].join('\r\n') + '\r\n';
  }
  return { parseCsv, compare, exportIssues, MAX_BYTES, MAX_ROWS };
});
