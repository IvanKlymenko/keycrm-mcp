import { z } from 'zod';
import { buildQuery } from '../utils/validate.js';

export function registerStockTools(server, client, wrap) {
  server.tool(
    'get_stock',
    'Get stock levels for a specific SKU across all warehouses, or for a single warehouse.',
    {
      sku: z.string().describe('Product variant SKU'),
      warehouse_id: z.number().int().optional().describe('If provided, returns stock for this warehouse only'),
    },
    wrap('get_stock', async (p) => {
      const qs = buildQuery({
        'filter[sku]': p.sku,
        'filter[warehouse_id]': p.warehouse_id,
      });
      return client.get(`/offers/stocks${qs}`);
    })
  );

  server.tool(
    'adjust_stock',
    'Set the absolute stock quantity for a SKU in a specific warehouse.',
    {
      sku: z.string().describe('Product variant SKU'),
      warehouse_id: z.number().int().describe('Warehouse to adjust stock in'),
      quantity: z.number().int().min(0).describe('New absolute stock quantity'),
      reason: z.string().optional().describe('Optional note explaining the adjustment'),
    },
    wrap('adjust_stock', async (p) => {
      const body = {
        sku: p.sku,
        warehouse_id: p.warehouse_id,
        quantity: p.quantity,
      };
      if (p.reason !== undefined) body.reason = p.reason;
      return client.put('/offers/stocks', [body]);
    })
  );
}
