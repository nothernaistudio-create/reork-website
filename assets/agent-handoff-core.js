/* REORK Handoff Terms Check v0.1. Copyright 2026 REORK AI.
   Input consistency only. No signatures, identities, escrow, law, or performance proof. */
(function (root) {
  'use strict';
  const FIELDS = [
    'jobId','buyerAgent','sellerAgent','buyerCountry','sellerCountry',
    'deliverable','currency','amountMinor','dueUtc','acceptanceCriteria',
    'dataRules','approvalRequired'
  ];
  const TEXT = FIELDS.filter(k => k !== 'amountMinor' && k !== 'acceptanceCriteria' && k !== 'approvalRequired');
  const canonical = (v) => Array.isArray(v) ? [...v].map(s => s.trim()).sort() : v;
  const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  function validate(raw, side) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return [side + ': expected one JSON object.'];
    }
    const errors = [];
    for (const key of TEXT) {
      if (typeof raw[key] !== 'string' || !raw[key].trim() || raw[key].length > 1000) {
        errors.push(side + ': ' + key + ' must be nonempty text (max 1,000 characters).');
      }
    }
    if (!Number.isSafeInteger(raw.amountMinor) || raw.amountMinor < 1 || raw.amountMinor > 100000000000) {
      errors.push(side + ': amountMinor must be a positive safe integer in minor currency units.');
    }
    if (typeof raw.currency === 'string' && !/^[A-Z]{3}$/.test(raw.currency)) {
      errors.push(side + ': currency must be a three-letter uppercase code.');
    }
    for (const country of ['buyerCountry','sellerCountry']) {
      if (typeof raw[country] === 'string' && !/^[A-Z]{2}$/.test(raw[country])) {
        errors.push(side + ': ' + country + ' must be a two-letter uppercase code.');
      }
    }
    if (typeof raw.dueUtc === 'string' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(raw.dueUtc)) {
      errors.push(side + ': dueUtc must be an explicit UTC timestamp (YYYY-MM-DDTHH:mm:ssZ).');
    } else if (typeof raw.dueUtc === 'string' && Number.isNaN(Date.parse(raw.dueUtc))) {
      errors.push(side + ': dueUtc must be a valid timestamp.');
    }
    if (!Array.isArray(raw.acceptanceCriteria) || !raw.acceptanceCriteria.length ||
        raw.acceptanceCriteria.length > 20 ||
        raw.acceptanceCriteria.some(s => typeof s !== 'string' || !s.trim() || s.length > 500)) {
      errors.push(side + ': acceptanceCriteria must contain 1 to 20 nonempty strings, each max 500 characters.');
    } else if (new Set(raw.acceptanceCriteria.map(s => s.trim())).size !== raw.acceptanceCriteria.length) {
      errors.push(side + ': acceptanceCriteria contains duplicates.');
    }
    if (typeof raw.approvalRequired !== 'boolean') {
      errors.push(side + ': approvalRequired must be boolean.');
    }
    return errors;
  }
  function check(buyer, supplier) {
    const errors = [...validate(buyer, 'Buyer'), ...validate(supplier, 'Supplier')];
    if (errors.length) return {status:'INVALID_INPUT', issues:errors, matchingFields:[], comparedFields:FIELDS.length, version:'0.1.0'};
    const issues = [];
    const matches = [];
    for (const key of FIELDS) {
      if (equal(buyer[key], supplier[key])) {
        matches.push(key);
      } else {
        issues.push('DIFFERENT ' + key + ': buyer and supplier descriptions do not match.');
      }
    }
    if (buyer.approvalRequired !== true || supplier.approvalRequired !== true) {
      issues.push('APPROVAL_REQUIRED: both parties must require explicit human approval.');
    }
    return {status: issues.length ? 'HOLD' : 'READY_FOR_HUMAN_REVIEW',
      issues,matchingFields:matches,comparedFields:FIELDS.length,version:'0.1.0',
      limits:'Compares claims supplied by two inputs. Does NOT authenticate parties, prove delivery or honesty, transfer money, adjudicate law, or authorize action.'};
  }
  const api = {check,validate,FIELDS};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.REORKHandoff = api;
})(typeof globalThis === 'object' ? globalThis : this);
