import { z } from 'zod';
import { buildQuery, compact } from '../utils/validate.js';
import { idList, include, pageQuery, pagination, productProperties, sort, stringList } from '../utils/schemas.js';
import { KeyCrmError } from '../keycrm/errors.js';

const offerFields = {
  price: z.number().optional().describe('Variant price'),
  purchased_price: z.number().optional().describe('Variant purchase price'),
  weight: z.number().optional().describe('Weight'),
  length: z.number().optional().describe('Length'),
  width: z.number().optional().describe('Width'),
  height: z.number().optional().describe('Height'),
  image_url: z.string().url().optional().describe('Variant image URL'),
};

export function registerOfferTools(server, client, wrap) {
  server.tool(
    'list_offers',
    'List product variants (offers) with optional filters.',
    {
      offer_id: idList.optional().describe('Filter by offer ID(s)'),
      product_id: idList.optional().describe('Filter by parent product ID(s)'),
      sku: stringList.optional().describe('Filter by exact SKU(s)'),
      is_archived: z.boolean().optional().describe('Filter by archived state'),
      include: include(['product']),
      sort,
      ...pagination,
    },
    wrap('list_offers', async (p) => {
      const qs = buildQuery({
        'filter[id]': p.offer_id,
        'filter[product_id]': p.product_id,
        'filter[sku]': p.sku,
        'filter[is_archived]': p.is_archived,
        include: p.include,
        sort: p.sort,
        ...pageQuery(p),
      });
      return client.get(`/offers${qs}`);
    })
  );

  server.tool(
    'create_offer',
    'Create one or more variants for an existing product.',
    {
      product_id: z.number().int().describe('Parent product ID'),
      offers: z
        .array(
          z.object({
            sku: z.string().optional().describe('Variant SKU'),
            ...offerFields,
            barcode: z.string().optional().describe('Variant barcode'),
            properties: productProperties,
          })
        )
        .min(1)
        .max(100)
        .describe('Variants to create (max 100 per request)'),
    },
    wrap('create_offer', async (p) =>
      client.post(`/products/${p.product_id}/offers`, { offers: p.offers.map(compact) })
    )
  );

  server.tool(
    'update_offer',
    'Update price, purchase price, image, weight or dimensions on one or more variants in a single request. Each variant is identified by id or sku; SKUs and properties cannot be changed via the API.',
    {
      offers: z
        .array(
          z.object({
            id: z.number().int().optional().describe('Offer ID'),
            sku: z.string().optional().describe('Variant SKU (identifies the variant when id is not given)'),
            ...offerFields,
          })
        )
        .min(1)
        .max(10000)
        .describe('Variant updates'),
    },
    wrap('update_offer', async (p) => {
      const offers = p.offers.map(compact);
      offers.forEach((o, i) => {
        if (o.id === undefined && o.sku === undefined) {
          throw new KeyCrmError('VALIDATION_ERROR', `offers[${i}] needs id or sku`);
        }
        const fields = Object.keys(o).filter((k) => k !== 'id' && k !== 'sku');
        if (fields.length === 0) {
          throw new KeyCrmError('VALIDATION_ERROR', `offers[${i}] has no fields to update`);
        }
      });
      return client.put('/offers', { offers });
    })
  );
}
