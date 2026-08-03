import { z } from 'zod';
import { buildQuery, requireAtLeastOne, requireConfirm } from '../utils/validate.js';

const DEFAULT_LIMIT = parseInt(process.env.LIST_DEFAULT_LIMIT || '50', 10);

const shippingSchema = z
  .object({
    delivery_service_id: z.number().int().optional(),
    tracking_code: z.string().optional(),
    recipient_full_name: z.string().optional(),
    recipient_phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
    warehouse_ref: z.string().optional(),
  })
  .optional();

export function registerOrderTools(server, client, wrap) {
  server.tool(
    'list_orders',
    'List orders with optional filters.',
    {
      status_id: z.number().int().optional().describe('Filter by order status ID'),
      date_from: z.string().optional().describe('Filter orders created from this date (YYYY-MM-DD)'),
      date_to: z.string().optional().describe('Filter orders created up to this date (YYYY-MM-DD)'),
      source_id: z.number().int().optional().describe('Filter by source ID'),
      warehouse_id: z.number().int().optional().describe('Filter by fulfillment warehouse'),
      limit: z.number().int().min(1).max(200).optional().describe('Number of results to return'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
    },
    wrap('list_orders', async (p) => {
      const limit = p.limit ?? DEFAULT_LIMIT;
      const page = p.offset ? Math.floor(p.offset / limit) + 1 : 1;
      const qs = buildQuery({
        'filter[status_id]': p.status_id,
        'filter[created_at][from]': p.date_from,
        'filter[created_at][to]': p.date_to,
        'filter[source_id]': p.source_id,
        'filter[warehouse_id]': p.warehouse_id,
        limit,
        page,
      });
      return client.get(`/order${qs}`);
    })
  );

  server.tool(
    'get_order',
    'Get full details for a single order including line items, customer, payments, and status history.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
    },
    wrap('get_order', async (p) =>
      client.get(`/order/${p.order_id}?include=products,buyer,payments,tags,status,shipping`)
    )
  );

  server.tool(
    'create_order',
    'Create a new order in keyCRM. Requires confirm: true.',
    {
      buyer_id: z.number().int().optional().describe('Existing buyer ID'),
      buyer_comment: z.string().optional().describe('Comment from the buyer'),
      manager_comment: z.string().optional().describe('Internal manager comment'),
      source_id: z.number().int().optional().describe('Source ID'),
      status_id: z.number().int().optional().describe('Initial status ID'),
      payment_method_id: z.number().int().optional().describe('Payment method ID'),
      warehouse_id: z.number().int().optional().describe('Fulfillment warehouse ID'),
      products: z
        .array(
          z.object({
            offer_id: z.number().int().describe('Offer (variant) ID'),
            quantity: z.number().int().min(1).describe('Quantity'),
            price: z.number().optional().describe('Sale price override'),
          })
        )
        .min(1)
        .describe('Array of line item objects'),
      shipping: shippingSchema.describe('Shipping details'),
      confirm: z.boolean().describe('Must be true to execute'),
    },
    wrap('create_order', async (p) => {
      requireConfirm(p, 'create_order');
      const body = { products: p.products };
      const optional = ['buyer_id', 'buyer_comment', 'manager_comment', 'source_id', 'status_id', 'payment_method_id', 'warehouse_id', 'shipping'];
      for (const key of optional) {
        if (p[key] !== undefined) body[key] = p[key];
      }
      return client.post('/order', body);
    })
  );

  server.tool(
    'update_order',
    'Update fields on an existing order.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      manager_comment: z.string().optional().describe('Internal manager comment'),
      buyer_comment: z.string().optional().describe('Buyer comment'),
      shipping: shippingSchema.describe('Updated shipping details'),
      payment_method_id: z.number().int().optional().describe('Payment method ID'),
    },
    wrap('update_order', async (p) => {
      const { order_id, ...fields } = p;
      requireAtLeastOne(fields, ['manager_comment', 'buyer_comment', 'shipping', 'payment_method_id']);
      const body = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) body[k] = v;
      }
      return client.put(`/order/${order_id}`, body);
    })
  );

  server.tool(
    'update_order_status',
    'Update the status of an order.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      status_id: z.number().int().describe('New status ID'),
      note: z.string().optional().describe('Optional internal note'),
    },
    wrap('update_order_status', async (p) => {
      const body = { status_id: p.status_id };
      if (p.note !== undefined) body.note = p.note;
      return client.put(`/order/${p.order_id}`, body);
    })
  );

  server.tool(
    'add_order_payment',
    'Record a payment against an existing order.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      amount: z.number().positive().describe('Payment amount'),
      payment_method_id: z.number().int().optional().describe('Payment method ID'),
      description: z.string().optional().describe('Optional payment note'),
    },
    wrap('add_order_payment', async (p) => {
      const body = { amount: p.amount };
      if (p.payment_method_id !== undefined) body.payment_method_id = p.payment_method_id;
      if (p.description !== undefined) body.description = p.description;
      return client.post(`/order/${p.order_id}/payment`, body);
    })
  );

  server.tool(
    'add_order_tag',
    'Attach a tag to an existing order.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      tag_id: z.number().int().describe('Tag ID'),
    },
    wrap('add_order_tag', async (p) =>
      client.post(`/order/${p.order_id}/tag/${p.tag_id}`)
    )
  );

  server.tool(
    'remove_order_tag',
    'Remove a tag from an existing order.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      tag_id: z.number().int().describe('Tag ID'),
    },
    wrap('remove_order_tag', async (p) =>
      client.delete(`/order/${p.order_id}/tag/${p.tag_id}`)
    )
  );
}
