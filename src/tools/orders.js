import { z } from 'zod';
import { between, buildQuery, compact, pick, requireAtLeastOne, requireConfirm } from '../utils/validate.js';
import {
  customFields,
  dateRange,
  idList,
  include,
  pageQuery,
  pagination,
  payment,
  paymentStatus,
  productProperties,
  sort,
  stringList,
} from '../utils/schemas.js';
import { KeyCrmError } from '../keycrm/errors.js';

const ORDER_INCLUDES = [
  'buyer',
  'products.offer',
  'manager',
  'tags',
  'status',
  'marketing',
  'payments',
  'shipping.lastHistory',
  'shipping.deliveryService',
  'expenses',
  'custom_fields',
  'assigned',
];

const shippingFields = {
  delivery_service_id: z.number().int().optional().describe('Delivery service ID (see list_delivery_services)'),
  tracking_code: z.string().optional().describe('Tracking number'),
  shipping_address_city: z.string().optional(),
  shipping_address_country: z.string().optional(),
  shipping_address_region: z.string().optional().describe('Region / state'),
  shipping_address_zip: z.string().optional(),
  shipping_secondary_line: z.string().optional().describe('Address line'),
  shipping_receive_point: z.string().optional().describe('Pickup point, e.g. "Склад #12"'),
  recipient_full_name: z.string().optional().describe('Recipient name, if different from the buyer'),
  recipient_phone: z.string().optional().describe('Recipient phone in international format'),
  warehouse_ref: z.string().optional().describe('Nova Poshta warehouse UUID (requires delivery_service_id)'),
  shipping_date: z.string().optional().describe('Shipping date, YYYY-MM-DD'),
};

const createShipping = z
  .object({ ...shippingFields, shipping_service: z.string().optional().describe('Delivery service name') })
  .optional()
  .describe('Shipping details');

const updateShipping = z.object(shippingFields).optional().describe('Shipping details to update');

const createProduct = z.object({
  sku: z.string().optional().describe('SKU of a catalogue variant; omit for a one-off item'),
  name: z.string().optional().describe('Item name (needed for one-off items)'),
  price: z.number().optional().describe('Unit price'),
  purchased_price: z.number().optional().describe('Unit purchase price'),
  discount_percent: z.number().optional(),
  discount_amount: z.number().optional(),
  quantity: z.number().optional().describe('Quantity'),
  unit_type: z.string().optional(),
  comment: z.string().optional(),
  picture: z.string().optional().describe('Image URL'),
  properties: productProperties,
});

const orderFields = {
  source_id: z.number().int().describe('Order source ID (see list_sources)'),
  source_uuid: z.string().optional().describe('Order number in the source system'),
  buyer: z
    .object({
      full_name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional().describe('International format with "+"'),
    })
    .describe('Buyer contact; keyCRM matches or creates the customer'),
  buyer_comment: z.string().optional(),
  manager_id: z.number().int().optional().describe('Responsible manager ID (see list_users)'),
  manager_comment: z.string().optional(),
  promocode: z.string().optional(),
  discount_percent: z.number().optional(),
  discount_amount: z.number().optional(),
  shipping_price: z.number().optional(),
  wrap_price: z.number().optional().describe('Gift wrap price'),
  gift_message: z.string().optional(),
  is_gift: z.boolean().optional(),
  gift_wrap: z.boolean().optional(),
  taxes: z.number().optional(),
  ordered_at: z.string().optional().describe('UTC "YYYY-MM-DD HH:MM:SS"; defaults to now'),
  shipping: createShipping,
  marketing: z
    .object({
      utm_source: z.string().optional(),
      utm_medium: z.string().optional(),
      utm_campaign: z.string().optional(),
      utm_term: z.string().optional(),
      utm_content: z.string().optional(),
    })
    .optional(),
  products: z.array(createProduct).optional().describe('Line items'),
  payments: z.array(payment).optional().describe('Payments to record on the order'),
  custom_fields: customFields,
};

const ORDER_KEYS = Object.keys(orderFields);

function requirePaymentMethod(p) {
  if (p.payment_method_id === undefined && p.payment_method === undefined) {
    throw new KeyCrmError('VALIDATION_ERROR', 'Either payment_method_id or payment_method is required');
  }
}

export function registerOrderTools(server, client, wrap) {
  server.tool(
    'list_orders',
    'List orders with optional filters. Date filters are in UTC.',
    {
      status_id: idList.optional().describe('Filter by status ID(s)'),
      source_id: idList.optional().describe('Filter by source ID(s)'),
      source_uuid: z.string().optional().describe('Filter by order number in the source system'),
      buyer_phone: stringList.optional().describe('Filter by buyer phone(s)'),
      buyer_email: stringList.optional().describe('Filter by buyer email(s)'),
      payment_status: z
        .array(z.enum(['paid', 'overpaid', 'part_paid', 'not_paid']))
        .optional()
        .describe('Filter by payment status'),
      has_tracking_code: z.boolean().optional().describe('Filter by whether a tracking code is set'),
      created_between: dateRange.describe('Created date range'),
      updated_between: dateRange.describe('Updated date range'),
      shipping_between: dateRange.describe('Shipping date range'),
      include: include(ORDER_INCLUDES),
      sort,
      ...pagination,
    },
    wrap('list_orders', async (p) => {
      const qs = buildQuery({
        'filter[status_id]': p.status_id,
        'filter[source_id]': p.source_id,
        'filter[source_uuid]': p.source_uuid,
        'filter[buyer_phone]': p.buyer_phone,
        'filter[buyer_email]': p.buyer_email,
        'filter[payment_status]': p.payment_status,
        'filter[has_tracking_code]': p.has_tracking_code,
        'filter[created_between]': between(p.created_between),
        'filter[updated_between]': between(p.updated_between),
        'filter[shipping_between]': between(p.shipping_between),
        include: p.include,
        sort: p.sort,
        ...pageQuery(p),
      });
      return client.get(`/order${qs}`);
    })
  );

  server.tool(
    'get_order',
    'Get a single order. By default includes buyer, line items, manager, tags, status, payments, shipping, expenses and custom fields.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      include: include(ORDER_INCLUDES),
    },
    wrap('get_order', async (p) => {
      const inc = p.include ?? ORDER_INCLUDES.filter((i) => i !== 'shipping.lastHistory');
      return client.get(`/order/${p.order_id}${buildQuery({ include: inc })}`);
    })
  );

  server.tool(
    'create_order',
    'Create a new order. Line items reference catalogue variants by SKU. Requires confirm: true.',
    {
      ...orderFields,
      confirm: z.boolean().describe('Must be true to execute'),
    },
    wrap('create_order', async (p) => {
      requireConfirm(p, 'create_order');
      return client.post('/order', pick(p, ORDER_KEYS));
    })
  );

  server.tool(
    'import_orders',
    'Create many orders in one request. Requires confirm: true.',
    {
      orders: z
        .array(
          z.object({
            ...orderFields,
            shipping: z.object(shippingFields).optional().describe('Shipping details'),
          }).omit({ manager_id: true, gift_message: true, is_gift: true, gift_wrap: true })
        )
        .min(1)
        .describe('Orders to create (create_order fields, except manager_id, gift options and shipping_service)'),
      confirm: z.boolean().describe('Must be true to execute'),
    },
    wrap('import_orders', async (p) => {
      requireConfirm(p, 'import_orders');
      return client.post('/order/import', { orders: p.orders.map(compact) });
    })
  );

  server.tool(
    'update_order',
    'Update an existing order. Line items are matched by order-line id or sku; items that match neither are added as new lines. Setting a tracking code on an order that already has one fails.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      status_id: z.number().int().optional().describe('New status ID (see list_order_statuses)'),
      buyer_comment: z.string().optional(),
      manager_comment: z.string().optional(),
      discount_percent: z.number().optional(),
      discount_amount: z.number().optional(),
      products: z
        .array(
          z.object({
            id: z.number().int().optional().describe('Order line ID (not the catalogue ID); identifies the line'),
            sku: z.string().optional().describe('SKU; identifies the line when id is not given'),
            name: z.string().optional().describe('Only updated for one-off items'),
            comment: z.string().optional(),
            price: z.number().optional(),
            purchased_price: z.number().optional(),
            discount_amount: z.number().optional(),
            discount_percent: z.number().optional(),
            quantity: z.number().optional(),
            product_status_id: z.number().int().optional().describe('Line status ID (see list_product_statuses)'),
          })
        )
        .optional()
        .describe('Line items to update or add'),
      shipping: updateShipping,
      custom_fields: customFields,
    },
    wrap('update_order', async (p) => {
      const keys = [
        'status_id',
        'buyer_comment',
        'manager_comment',
        'discount_percent',
        'discount_amount',
        'products',
        'shipping',
        'custom_fields',
      ];
      requireAtLeastOne(p, keys);
      return client.put(`/order/${p.order_id}`, pick(p, keys));
    })
  );

  server.tool(
    'update_order_status',
    'Move an order to a different status.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      status_id: z.number().int().describe('New status ID (see list_order_statuses)'),
    },
    wrap('update_order_status', async (p) =>
      client.put(`/order/${p.order_id}`, { status_id: p.status_id })
    )
  );

  server.tool(
    'add_order_payment',
    'Record a payment on an existing order. Pass payment_method_id or payment_method.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      ...payment.shape,
    },
    wrap('add_order_payment', async (p) => {
      requirePaymentMethod(p);
      const { order_id, ...fields } = p;
      return client.post(`/order/${order_id}/payment`, compact(fields));
    })
  );

  server.tool(
    'update_order_payment',
    "Change a payment's status or description on an order.",
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      payment_id: z.number().int().describe('Payment ID'),
      status: paymentStatus.optional().describe('New payment status'),
      description: z.string().optional().describe('Payment comment'),
    },
    wrap('update_order_payment', async (p) => {
      requireAtLeastOne(p, ['status', 'description']);
      return client.put(`/order/${p.order_id}/payment/${p.payment_id}`, pick(p, ['status', 'description']));
    })
  );

  server.tool(
    'add_order_expense',
    'Record an expense on an existing order. Pass expense_type_id or expense_type.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      amount: z.number().describe('Expense amount'),
      expense_type_id: z.number().int().optional().describe('Expense type ID (see list_expense_types)'),
      expense_type: z.string().optional().describe('Expense type name'),
      description: z.string().optional().describe('Expense comment'),
      payment_date: z.string().optional().describe('UTC "YYYY-MM-DD HH:MM:SS"; defaults to now'),
    },
    wrap('add_order_expense', async (p) => {
      if (p.expense_type_id === undefined && p.expense_type === undefined) {
        throw new KeyCrmError('VALIDATION_ERROR', 'Either expense_type_id or expense_type is required');
      }
      const { order_id, ...fields } = p;
      return client.post(`/order/${order_id}/expense`, compact(fields));
    })
  );

  server.tool(
    'update_order_expense',
    'Cancel an order expense or change its description.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      expense_id: z.number().int().describe('Expense ID'),
      status: z.enum(['canceled']).optional().describe('Set to "canceled" to cancel the expense'),
      description: z.string().optional().describe('Expense comment'),
    },
    wrap('update_order_expense', async (p) => {
      requireAtLeastOne(p, ['status', 'description']);
      return client.put(`/order/${p.order_id}/expense/${p.expense_id}`, pick(p, ['status', 'description']));
    })
  );

  server.tool(
    'add_order_tag',
    'Attach a tag to an existing order.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      tag_id: z.number().int().describe('Tag ID (see list_tags)'),
    },
    wrap('add_order_tag', async (p) => client.post(`/order/${p.order_id}/tag/${p.tag_id}`))
  );

  server.tool(
    'remove_order_tag',
    'Remove a tag from an existing order.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      tag_id: z.number().int().describe('Tag ID'),
    },
    wrap('remove_order_tag', async (p) => client.delete(`/order/${p.order_id}/tag/${p.tag_id}`))
  );

  server.tool(
    'attach_order_file',
    'Attach an uploaded file (see upload_file) to an order.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      file_id: z.number().int().describe('Storage file ID'),
    },
    wrap('attach_order_file', async (p) => client.post(`/order/${p.order_id}/attachment/${p.file_id}`))
  );

  server.tool(
    'detach_order_file',
    'Remove a file from an order.',
    {
      order_id: z.number().int().describe('keyCRM order ID'),
      file_id: z.number().int().describe('Storage file ID'),
    },
    wrap('detach_order_file', async (p) => client.delete(`/order/${p.order_id}/attachment/${p.file_id}`))
  );
}
