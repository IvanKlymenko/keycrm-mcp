import { z } from 'zod';
import { buildQuery, compact, pick, requireAtLeastOne, requireConfirm } from '../utils/validate.js';
import { customFields, idList, include, pageQuery, pagination } from '../utils/schemas.js';
import { KeyCrmError } from '../keycrm/errors.js';

const MAX_PICTURES = 6;

const productFields = {
  description: z.string().optional().describe('Product description'),
  pictures: z
    .array(z.string().url())
    .max(MAX_PICTURES)
    .optional()
    .describe(`Image URLs (max ${MAX_PICTURES}); the first is the main image`),
  currency_code: z.string().optional().describe('Currency code, e.g. "UAH"'),
  sku: z.string().optional().describe('Product SKU'),
  barcode: z.string().optional().describe('Barcode'),
  price: z.number().optional().describe('Price per unit'),
  purchased_price: z.number().optional().describe('Purchase price per unit'),
  unit_type: z.string().optional().describe('Unit of measure, e.g. "кг"'),
  weight: z.number().optional().describe('Default weight'),
  length: z.number().optional().describe('Default length'),
  width: z.number().optional().describe('Default width'),
  height: z.number().optional().describe('Default height'),
  category_id: z.number().int().optional().describe('Category ID'),
  custom_fields: customFields,
};

const PRODUCT_KEYS = ['name', ...Object.keys(productFields)];

const productInclude = include(['custom_fields']);

function productFilterQuery(f) {
  return compact({
    'filter[product_id]': f.product_id,
    'filter[category_id]': f.category_id,
    'filter[is_archived]': f.is_archived,
  });
}

export function registerProductTools(server, client, wrap) {
  server.tool(
    'list_products',
    'List products from the keyCRM catalogue. Use list_offers for variants and get_stock for stock levels.',
    {
      product_id: idList.optional().describe('Filter by product ID(s)'),
      category_id: idList.optional().describe('Filter by category ID(s)'),
      is_archived: z.boolean().optional().describe('Filter by archived state'),
      include: productInclude,
      ...pagination,
    },
    wrap('list_products', async (p) => {
      const qs = buildQuery({ ...productFilterQuery(p), include: p.include, ...pageQuery(p) });
      return client.get(`/products${qs}`);
    })
  );

  server.tool(
    'get_product',
    'Get a single product. Variants are listed by list_offers (filter by product_id); stock by get_stock.',
    {
      product_id: z.number().int().describe('keyCRM product ID'),
      include: productInclude,
    },
    wrap('get_product', async (p) =>
      client.get(`/products/${p.product_id}${buildQuery({ include: p.include ?? ['custom_fields'] })}`)
    )
  );

  server.tool(
    'create_product',
    'Create a new product (without variants) in the keyCRM catalogue. Add variants with create_offer.',
    {
      name: z.string().describe('Product name'),
      ...productFields,
    },
    wrap('create_product', async (p) => client.post('/products', pick(p, PRODUCT_KEYS)))
  );

  server.tool(
    'update_product',
    'Update one or more fields on an existing product.',
    {
      product_id: z.number().int().describe('keyCRM product ID'),
      name: z.string().optional().describe('Product name'),
      ...productFields,
    },
    wrap('update_product', async (p) => {
      requireAtLeastOne(p, PRODUCT_KEYS);
      return client.put(`/products/${p.product_id}`, pick(p, PRODUCT_KEYS));
    })
  );

  server.tool(
    'import_products',
    'Create many products in one request. Requires confirm: true.',
    {
      products: z
        .array(z.object({ name: z.string().describe('Product name'), ...productFields }))
        .min(1)
        .describe('Products to create'),
      confirm: z.boolean().describe('Must be true to execute'),
    },
    wrap('import_products', async (p) => {
      requireConfirm(p, 'import_products');
      return client.post('/products/import', { products: p.products.map(compact) });
    })
  );

  server.tool(
    'update_product_photo',
    `Add or replace a product photo from a public URL. Reads the current images and writes back the full list; a product holds at most ${MAX_PICTURES} images, the first being the main one.`,
    {
      product_id: z.number().int().describe('keyCRM product ID'),
      photo_url: z.string().url().describe('Publicly accessible URL of the photo'),
      replace_existing: z.boolean().optional().describe('If true, replaces all existing photos with this one'),
      make_main: z.boolean().optional().describe('If true, puts this photo first (main image) when appending'),
    },
    wrap('update_product_photo', async (p) => {
      let pictures = [p.photo_url];
      if (!p.replace_existing) {
        const product = await client.get(`/products/${p.product_id}`);
        const existing = (product?.attachments_data ?? []).filter((url) => url !== p.photo_url);
        pictures = p.make_main ? [p.photo_url, ...existing] : [...existing, p.photo_url];
        if (pictures.length > MAX_PICTURES) {
          throw new KeyCrmError(
            'VALIDATION_ERROR',
            `Product already has ${existing.length} photos; the limit is ${MAX_PICTURES}. Use replace_existing or update_product with an explicit pictures list.`
          );
        }
      }
      return client.put(`/products/${p.product_id}`, { pictures });
    })
  );

  server.tool(
    'bulk_update_products',
    'Apply the same field update to every product matching a filter. Call with dry_run:true first to preview, then dry_run:false and confirm:true to execute. Updates run sequentially (keyCRM allows 20 requests/minute).',
    {
      filter: z
        .object({
          product_id: idList.optional(),
          category_id: idList.optional(),
          is_archived: z.boolean().optional(),
        })
        .describe('Which products to update; at least one filter is required'),
      update: z
        .object({
          name: z.string().optional(),
          description: z.string().optional(),
          price: z.number().optional(),
          purchased_price: z.number().optional(),
          currency_code: z.string().optional(),
          unit_type: z.string().optional(),
          category_id: z.number().int().optional(),
          custom_fields: customFields,
        })
        .describe('Fields to set on every matched product'),
      max_products: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Safety cap on the number of products touched (default 100)'),
      dry_run: z.boolean().describe('If true, returns preview without making changes'),
      confirm: z.boolean().optional().describe('Must be true to execute when dry_run is false'),
    },
    wrap('bulk_update_products', async (p) => {
      requireAtLeastOne(p.filter, ['product_id', 'category_id', 'is_archived']);
      const updateBody = compact(p.update);
      if (Object.keys(updateBody).length === 0) {
        throw new KeyCrmError('VALIDATION_ERROR', 'update must set at least one field');
      }
      if (!p.dry_run) requireConfirm(p, 'bulk_update_products');

      const max = p.max_products ?? 100;
      // Fetch one extra so we can tell the caller the cap was hit.
      const products = await client.getAll('/products', productFilterQuery(p.filter), max + 1);
      const truncated = products.length > max;
      const targets = products.slice(0, max);

      if (p.dry_run) {
        return {
          dry_run: true,
          count: targets.length,
          truncated,
          update: updateBody,
          products: targets.map((pr) => ({ id: pr.id, name: pr.name, sku: pr.sku, category_id: pr.category_id })),
        };
      }

      const results = [];
      for (const pr of targets) {
        try {
          await client.put(`/products/${pr.id}`, updateBody);
          results.push({ id: pr.id, ok: true });
        } catch (e) {
          results.push({ id: pr.id, ok: false, error: e.message, detail: e.detail ?? null });
        }
      }

      return {
        updated: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok),
        truncated,
      };
    })
  );
}
