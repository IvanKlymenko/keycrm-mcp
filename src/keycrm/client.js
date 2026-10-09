import { KeyCrmError } from './errors.js';

const DEFAULT_TIMEOUT = 10_000;
const UPLOAD_TIMEOUT = 60_000;
const MAX_RETRIES = 3;
// keyCRM allows 20 requests per minute per API key. Requests are paced client-side to
// stay under that; the 429 backoff only covers other consumers of the same key.
const RATE_LIMIT = Math.max(1, parseInt(process.env.KEYCRM_RATE_LIMIT || '20', 10) || 20);
const RATE_WINDOW = 60_000;
const RETRY_BASE_DELAY = 5_000;
const MAX_RETRY_DELAY = 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function retryDelay(res, retryCount) {
  const retryAfter = Number(res.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, MAX_RETRY_DELAY);
  }
  return Math.min(Math.pow(2, retryCount) * RETRY_BASE_DELAY, MAX_RETRY_DELAY);
}

export function createClient() {
  const apiKey = process.env.KEYCRM_API_KEY;
  const baseUrl = (process.env.KEYCRM_API_URL || 'https://openapi.keycrm.app/v1').replace(/\/$/, '');

  if (!apiKey) {
    throw new KeyCrmError('KEYCRM_AUTH_ERROR', 'KEYCRM_API_KEY is not set');
  }

  // Start times of requests sent within the last RATE_WINDOW, oldest first.
  const sent = [];
  let queue = Promise.resolve();

  /** Resolves once a request may be sent without exceeding RATE_LIMIT per RATE_WINDOW. */
  function throttle() {
    queue = queue.then(async () => {
      for (;;) {
        const now = Date.now();
        while (sent.length > 0 && now - sent[0] >= RATE_WINDOW) sent.shift();
        if (sent.length < RATE_LIMIT) {
          sent.push(now);
          return;
        }
        await sleep(RATE_WINDOW - (now - sent[0]));
      }
    });
    return queue;
  }

  async function request(method, path, body = null, retryCount = 0) {
    await throttle();
    const url = `${baseUrl}${path}`;
    const isMultipart = body instanceof FormData;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), isMultipart ? UPLOAD_TIMEOUT : DEFAULT_TIMEOUT);

    try {
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      };
      // For FormData, fetch sets the multipart Content-Type with its boundary itself.
      if (body !== null && !isMultipart) headers['Content-Type'] = 'application/json';

      const options = { method, headers, signal: controller.signal };
      if (body !== null) options.body = isMultipart ? body : JSON.stringify(body);

      const res = await fetch(url, options);

      if (res.status === 429) {
        if (retryCount < MAX_RETRIES) {
          clearTimeout(timeout);
          await sleep(retryDelay(res, retryCount));
          return request(method, path, body, retryCount + 1);
        }
        throw new KeyCrmError('KEYCRM_RATE_LIMIT', 'Rate limit exceeded after retries', 429);
      }

      if (res.status === 401 || res.status === 403) {
        throw new KeyCrmError('KEYCRM_AUTH_ERROR', 'Invalid or missing API key', res.status);
      }

      if (!res.ok) {
        let detail = null;
        try {
          const errBody = await res.json();
          // 422 responses carry per-field messages in `errors`.
          detail = errBody.errors
            ? { message: errBody.message, errors: errBody.errors }
            : errBody.message || errBody.error || JSON.stringify(errBody);
        } catch {
          // ignore
        }
        throw new KeyCrmError('KEYCRM_API_ERROR', `API error ${res.status}`, res.status, detail);
      }

      if (res.status === 204) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new KeyCrmError('KEYCRM_TIMEOUT', 'Request timed out');
      }
      if (err instanceof KeyCrmError) throw err;
      throw new KeyCrmError('INTERNAL_ERROR', err.message);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Follows `next_page_url` from page 1 and returns every item, stopping once
   * `max` items have been collected.
   */
  async function getAll(path, query = {}, max = Infinity) {
    const items = [];
    let page = 1;
    while (items.length < max) {
      const qs = new URLSearchParams({ ...query, limit: '50', page: String(page) });
      const res = await request('GET', `${path}?${qs}`);
      items.push(...(res?.data ?? []));
      if (!res?.next_page_url || !res?.data?.length) break;
      page += 1;
    }
    return items.slice(0, max);
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body = null) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
    getAll,
  };
}
