import { lookup } from 'dns/promises';
import { readFile, realpath, stat } from 'fs/promises';
import net from 'net';
import path from 'path';
import { z } from 'zod';
import { buildQuery } from '../utils/validate.js';
import { pageQuery, pagination, sort } from '../utils/schemas.js';
import { KeyCrmError } from '../keycrm/errors.js';

const DOWNLOAD_TIMEOUT = 30_000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function uploadError(message) {
  return new KeyCrmError('VALIDATION_ERROR', message);
}

function isPrivateAddress(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * The server fetches the URL itself, so refuse loopback, private and link-local
 * targets (e.g. cloud metadata endpoints) unless explicitly allowed.
 */
async function assertFetchable(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw uploadError(`Only http(s) URLs can be uploaded, got ${url.protocol}`);
  }
  if (process.env.KEYCRM_ALLOW_PRIVATE_URLS === 'true') return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw uploadError(`Refusing to download from private address ${url.hostname}`);
  }
}

async function download(rawUrl) {
  let url = new URL(rawUrl);
  for (let hop = 0; ; hop++) {
    await assertFetchable(url);
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) throw uploadError(`Too many redirects downloading ${rawUrl}`);
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw uploadError(`Could not download ${url}: HTTP ${res.status}`);
    if (Number(res.headers.get('content-length')) > MAX_UPLOAD_BYTES) {
      throw uploadError(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
    }
    const data = await res.arrayBuffer();
    if (data.byteLength > MAX_UPLOAD_BYTES) {
      throw uploadError(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
    }
    const type = res.headers.get('content-type') || 'application/octet-stream';
    const name = decodeURIComponent(path.basename(url.pathname)) || 'file';
    return { blob: new Blob([data], { type }), name };
  }
}

/**
 * Local uploads are disabled unless KEYCRM_UPLOAD_DIR is set, and then confined to
 * that directory, so the model cannot be steered into uploading arbitrary local files.
 */
async function readLocal(filePath) {
  const uploadDir = process.env.KEYCRM_UPLOAD_DIR;
  if (!uploadDir) {
    throw uploadError('Local file uploads are disabled. Set KEYCRM_UPLOAD_DIR to allow uploads from that directory.');
  }
  let root;
  let real;
  try {
    root = await realpath(uploadDir);
    real = await realpath(path.resolve(root, filePath));
  } catch (e) {
    throw uploadError(`Could not read ${filePath}: ${e.message}`);
  }
  if (!real.startsWith(root + path.sep)) {
    throw uploadError(`${filePath} is outside KEYCRM_UPLOAD_DIR`);
  }
  if ((await stat(real)).size > MAX_UPLOAD_BYTES) {
    throw uploadError(`File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`);
  }
  return { blob: new Blob([await readFile(real)]), name: path.basename(real) };
}

export function registerStorageTools(server, client, wrap) {
  server.tool(
    'upload_file',
    'Upload a file to keyCRM Storage from a public URL or a local path. Returns the stored file, whose id can be passed to attach_order_file / attach_pipeline_card_file.',
    {
      url: z.string().url().optional().describe('Publicly accessible URL of the file'),
      file_path: z
        .string()
        .optional()
        .describe('Path of a local file inside KEYCRM_UPLOAD_DIR (used when url is not given; disabled if that is unset)'),
      filename: z.string().optional().describe('Filename to store the file under'),
    },
    wrap('upload_file', async (p) => {
      if (!p.url && !p.file_path) {
        throw new KeyCrmError('VALIDATION_ERROR', 'Either url or file_path is required');
      }
      const { blob, name } = p.url ? await download(p.url) : await readLocal(p.file_path);
      const form = new FormData();
      form.append('file', blob, p.filename ?? name);
      return client.post('/storage/upload', form);
    })
  );

  server.tool(
    'list_files',
    'List all files uploaded to keyCRM Storage. Use list_entity_files for the files of one order or pipeline card.',
    { sort, ...pagination },
    wrap('list_files', async (p) => client.get(`/storage${buildQuery({ sort: p.sort, ...pageQuery(p) })}`))
  );

  server.tool(
    'list_entity_files',
    'List the files attached to an order or a pipeline card.',
    {
      entity_type: z.enum(['order', 'pipelines']).describe('"order" or "pipelines" (pipeline card)'),
      entity_id: z.number().int().describe('Order ID or pipeline card ID'),
    },
    wrap('list_entity_files', async (p) =>
      client.get(`/storage/attachment/${p.entity_type}/${p.entity_id}`)
    )
  );
}
