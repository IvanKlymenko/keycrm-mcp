import { z } from 'zod';
import { buildQuery } from '../utils/validate.js';
import { idList, pageQuery, pagination, stringList } from '../utils/schemas.js';
import { KeyCrmError } from '../keycrm/errors.js';

export function registerStockTools(server, client, wrap) {
  server.tool(
    'get_stock',
    'Get stock and reserve levels per variant, broken down by warehouse. The per-warehouse entries also give the warehouse IDs needed by adjust_stock.',
    {
      offer_id: idList.optional().describe('Filter by offer (variant) ID(s)'),
      sku: stringList.optional().describe('Filter by variant SKU(s)'),
      warehouse_id: z.number().int().optional().describe('Only keep this warehouse in the per-warehouse breakdown'),
      details: z
        .boolean()
        .optional()
        .describe('Include the per-warehouse breakdown (default true)'),
      ...pagination,
    },
    wrap('get_stock', async (p) => {
      const details = p.warehouse_id !== undefined ? true : p.details ?? true;
      const qs = buildQuery({
        'filter[offers_id]': p.offer_id,
        'filter[offers_sku]': p.sku,
        'filter[details]': details,
        ...pageQuery(p),
      });
      const res = await client.get(`/offers/stocks${qs}`);
      if (p.warehouse_id === undefined || !Array.isArray(res?.data)) return res;
      // The API has no warehouse filter; narrow the breakdown client-side.
      return {
        ...res,
        data: res.data.map((offer) => ({
          ...offer,
          warehouse: (offer.warehouse ?? []).filter((w) => w.id === p.warehouse_id),
        })),
      };
    })
  );

  server.tool(
    'adjust_stock',
    'Set absolute stock quantities (not deltas) for one or more variants in a warehouse. keyCRM records a stock movement to reach each quantity.',
    {
      warehouse_id: z.number().int().describe('Warehouse ID (see get_stock)'),
      stocks: z
        .array(
          z.object({
            offer_id: z.number().int().optional().describe('Offer (variant) ID'),
            sku: z.string().optional().describe('Variant SKU (used when offer_id is not given)'),
            quantity: z.number().min(0).describe('New absolute quantity'),
          })
        )
        .min(1)
        .describe('Quantities to set'),
    },
    wrap('adjust_stock', async (p) => {
      const stocks = p.stocks.map((s, i) => {
        if (s.offer_id === undefined && s.sku === undefined) {
          throw new KeyCrmError('VALIDATION_ERROR', `stocks[${i}] needs offer_id or sku`);
        }
        const item = { quantity: s.quantity };
        if (s.offer_id !== undefined) item.id = s.offer_id;
        if (s.sku !== undefined) item.sku = s.sku;
        return item;
      });
      return client.put('/offers/stocks', { warehouse_id: p.warehouse_id, stocks });
    })
  );
}
