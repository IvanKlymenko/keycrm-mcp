import { KeyCrmError } from '../keycrm/errors.js';

export function requireAtLeastOne(obj, fields) {
  const provided = fields.filter((f) => obj[f] !== undefined && obj[f] !== null);
  if (provided.length === 0) {
    throw new KeyCrmError(
      'VALIDATION_ERROR',
      `At least one of the following fields must be provided: ${fields.join(', ')}`
    );
  }
}

export function requireConfirm(params, toolName) {
  if (!params.confirm) {
    throw new KeyCrmError(
      'VALIDATION_ERROR',
      `${toolName} requires confirm: true to execute`
    );
  }
}

/**
 * Builds a query string. Arrays are joined with commas, which is how keyCRM
 * accepts multiple values for one filter (e.g. filter[status_id]=1,4).
 */
export function buildQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) qs.set(key, value.join(','));
    } else {
      qs.set(key, String(value));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

/** Copies only the keys of `params` that are defined. */
export function pick(params, keys) {
  const out = {};
  for (const key of keys) {
    if (params[key] !== undefined) out[key] = params[key];
  }
  return out;
}

/** Copies every defined key of `obj`. */
export function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Formats a {from, to} range as keyCRM's `*_between` filter value. */
export function between(range) {
  return range ? `${range.from},${range.to}` : undefined;
}
