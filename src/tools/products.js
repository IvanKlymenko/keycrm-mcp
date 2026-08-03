import { z } from 'zod';
import { buildQuery, requireAtLeastOne, requireConfirm } from '../utils/validate.js';
import { KeyCrmError } from '../keycrm/errors.js';

const DEFAULT_LIMIT = parseInt(process.env.LIST_DEFAULT_LIMIT || '50', 10);

export function registerProductTools(server, client, wrap) {
  server.tool(
    'list_products',
    'List products from the keyCRM catalogue with optional filters.',
    {
      category_id: z.number().int().optional().describe('Filter by category ID'),
      status: z.enum(['draft', 'published', 'archived']).optional().describe('Filter by status'),
      query: z.string().optional().describe('Search by product name'),
      limit: z.number().int().min(1).max(200).optional().describe('Number of results to return'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
    },
    wrap('list_products', async (p) => {
      const limit = p.limit ?? DEFAULT_LIMIT;
      const page = p.offset ? Math.floor(p.offset / limit) + 1 : 1;
      const qs = buildQuery({
        'filter[category_id]': p.category_id,
        'filter[status]': p.status,
        'filter[name]': p.query,
        limit,
        page,
      });
      return client.get(`/products${qs}`);
    })
  );

  server.tool(
    'get_product',
    'Get full details for a single product including all variants and stock levels.',
    {
      product_id: z.number().int().describe('keyCRM product ID'),
    },
    wrap('get_product', async (p) => client.get(`/products/${p.product_id}?include=customFields`))
  );

  server.tool(
    'create_product',
    'Create a new product in the keyCRM catalogue.',
    {
      name: z.string().describe('Product name'),
      category_id: z.number().int().optional().describe('Category ID'),
      description: z.string().optional().describe('Product description'),
      price: z.number().optional().describe('Base price'),
      sku: z.string().optional().describe('Product SKU'),
      status: z.enum(['draft', 'published']).optional().describe('Initial status'),
    },
    wrap('create_product', async (p) => {
      const body = { name: p.name };
      if (p.category_id !== undefined) body.category_id = p.category_id;
      if (p.description !== undefined) body.description = p.description;
      if (p.price !== undefined) body.price = p.price;
      if (p.sku !== undefined) body.sku = p.sku;
      if (p.status !== undefined) body.status = p.status;
      return client.post('/products', body);
    })
  );

  server.tool(
    'update_product',
    'Update one or more fields on an existing product.',
    {
      product_id: z.number().int().describe('keyCRM product ID'),
      name: z.string().optional().describe('Product name'),
      description: z.string().optional().describe('Product description'),
      price: z.number().optional().describe('Product price'),
      category_id: z.number().int().optional().describe('Category ID'),
      sku: z.string().optional().describe('Product SKU'),
    },
    wrap('update_product', async (p) => {
      const { product_id, ...fields } = p;
      requireAtLeastOne(fields, ['name', 'description', 'price', 'category_id', 'sku']);
      const body = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) body[k] = v;
      }
      return client.put(`/products/${product_id}`, body);
    })
  );

  server.tool(
    'publish_product',
    "Change a product's status from draft to published.",
    {
      product_id: z.number().int().describe('keyCRM product ID'),
    },
    wrap('publish_product', async (p) =>
      client.put(`/products/${p.product_id}`, { status: 'published' })
    )
  );

  server.tool(
    'unpublish_product',
    "Change a product's status from published back to draft.",
    {
      product_id: z.number().int().describe('keyCRM product ID'),
    },
    wrap('unpublish_product', async (p) =>
      client.put(`/products/${p.product_id}`, { status: 'draft' })
    )
  );

  server.tool(
    'archive_product',
    'Archive a product. Reversible — archived products can be unarchived at any time.',
    {
      product_id: z.number().int().describe('keyCRM product ID'),
    },
    wrap('archive_product', async (p) =>
      client.put(`/products/${p.product_id}`, { status: 'archived' })
    )
  );

  server.tool(
    'update_product_photo',
    'Replace or add a photo on an existing product from a public URL.',
    {
      product_id: z.number().int().describe('keyCRM product ID'),
      photo_url: z.string().url().describe('Publicly accessible URL of the new photo'),
      replace_existing: z.boolean().optional().describe('If true, replaces all existing photos'),
    },
    wrap('update_product_photo', async (p) => {
      const uploaded = await client.post('/storage/upload', { url: p.photo_url });
      const fileId = uploaded?.id ?? uploaded?.file_id;
      if (!fileId) throw new Error('Storage upload did not return a file ID');

      const body = p.replace_existing
        ? { attachments: [{ id: fileId }] }
        : { attachments_append: [{ id: fileId }] };

      const result = await client.put(`/products/${p.product_id}`, body);
      return { file_id: fileId, product: result };
    })
  );

  server.tool(
    'bulk_update_products',
    'Apply a field update to multiple products matching a filter. Call with dry_run:true first to preview, then dry_run:false and confirm:true to execute.',
    {
      filter: z.object({
        category_id: z.number().int().optional(),
        status: z.enum(['draft', 'published', 'archived']).optional(),
        query: z.string().optional(),
      }).describe('Filter defining which products to update'),
      update: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        price: z.number().optional(),
        category_id: z.number().int().optional(),
        sku: z.string().optional(),
        status: z.enum(['draft', 'published', 'archived']).optional(),
      }).describe('Fields to update'),
      dry_run: z.boolean().describe('If true, returns preview without making changes'),
      confirm: z.boolean().optional().describe('Must be true to execute when dry_run is false'),
    },
    wrap('bulk_update_products', async (p) => {
      if (!p.dry_run && !p.confirm) {
        throw new KeyCrmError('VALIDATION_ERROR', 'bulk_update_products requires confirm: true to execute');
      }

      const qs = buildQuery({
        'filter[category_id]': p.filter.category_id,
        'filter[status]': p.filter.status,
        'filter[name]': p.filter.query,
        limit: 200,
      });
      const listing = await client.get(`/products${qs}`);
      const products = listing?.data ?? listing ?? [];

      if (p.dry_run) {
        return {
          dry_run: true,
          count: products.length,
          products: products.map((pr) => ({ id: pr.id, name: pr.name, status: pr.status })),
        };
      }

      const updateBody = {};
      for (const [k, v] of Object.entries(p.update)) {
        if (v !== undefined) updateBody[k] = v;
      }

      const results = await Promise.all(
        products.map((pr) =>
          client
            .put(`/products/${pr.id}`, updateBody)
            .then(() => ({ id: pr.id, ok: true }))
            .catch((e) => ({ id: pr.id, ok: false, error: e.message }))
        )
      );

      return { updated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
    })
  );
}
