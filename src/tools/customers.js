import { z } from 'zod';
import { between, buildQuery, compact, pick, requireAtLeastOne, requireConfirm } from '../utils/validate.js';
import { customFields, dateRange, idList, include, pageQuery, pagination, stringList } from '../utils/schemas.js';

const BUYER_INCLUDES = ['manager', 'shipping', 'company', 'loyalty', 'custom_fields'];

const buyerFields = {
  birthday: z.string().optional().describe('Birthday, YYYY-MM-DD'),
  email: z.array(z.string().email()).optional().describe('Email addresses'),
  phone: z.array(z.string()).optional().describe('Phone numbers in international format with "+"'),
  note: z.string().optional().describe('Internal note'),
  discount: z.number().optional().describe('Personal discount, %'),
  company_id: z.number().int().optional().describe('Linked company ID'),
  manager_id: z.number().int().optional().describe('Responsible manager ID (see list_users)'),
  shipping: z
    .array(
      z.object({
        address: z.string().optional(),
        additional_address: z.string().optional(),
        city: z.string().optional(),
        region: z.string().optional().describe('Region / state'),
        zip_code: z.string().optional(),
        country: z.string().optional(),
        recipient_full_name: z.string().optional(),
        recipient_phone: z.string().optional(),
        warehouse_ref: z.string().optional().describe('Nova Poshta warehouse UUID'),
        shipping_service: z.string().optional().describe('Delivery service name'),
      })
    )
    .optional()
    .describe('Saved shipping addresses'),
  custom_fields: customFields,
};

const BUYER_KEYS = ['full_name', ...Object.keys(buyerFields)];

export function registerCustomerTools(server, client, wrap) {
  server.tool(
    'list_customers',
    'List customers (buyers) with optional filters. Date filters are in UTC.',
    {
      customer_id: idList.optional().describe('Filter by customer ID(s)'),
      phone: stringList.optional().describe('Filter by phone number(s)'),
      email: stringList.optional().describe('Filter by email(s)'),
      created_between: dateRange.describe('Created date range'),
      updated_between: dateRange.describe('Updated date range'),
      include: include(BUYER_INCLUDES),
      ...pagination,
    },
    wrap('list_customers', async (p) => {
      const qs = buildQuery({
        'filter[buyer_id]': p.customer_id,
        'filter[buyer_phone]': p.phone,
        'filter[buyer_email]': p.email,
        'filter[created_between]': between(p.created_between),
        'filter[updated_between]': between(p.updated_between),
        include: p.include,
        ...pageQuery(p),
      });
      return client.get(`/buyer${qs}`);
    })
  );

  server.tool(
    'get_customer',
    "Get a customer profile. For the customer's orders, call list_orders with buyer_phone or buyer_email.",
    {
      customer_id: z.number().int().describe('keyCRM customer ID'),
      include: include(BUYER_INCLUDES),
    },
    wrap('get_customer', async (p) =>
      client.get(`/buyer/${p.customer_id}${buildQuery({ include: p.include ?? BUYER_INCLUDES })}`)
    )
  );

  server.tool(
    'create_customer',
    'Create a new customer (buyer) record in keyCRM.',
    {
      full_name: z.string().describe('Customer full name'),
      ...buyerFields,
    },
    wrap('create_customer', async (p) => client.post('/buyer', pick(p, BUYER_KEYS)))
  );

  server.tool(
    'update_customer',
    'Update an existing customer record.',
    {
      customer_id: z.number().int().describe('keyCRM customer ID'),
      full_name: z.string().optional().describe('Customer full name'),
      ...buyerFields,
    },
    wrap('update_customer', async (p) => {
      requireAtLeastOne(p, BUYER_KEYS);
      return client.put(`/buyer/${p.customer_id}`, pick(p, BUYER_KEYS));
    })
  );

  server.tool(
    'import_customers',
    'Bulk import customer records into keyCRM. Requires confirm: true.',
    {
      customers: z
        .array(z.object({ full_name: z.string().describe('Customer full name'), ...buyerFields }))
        .min(1)
        .describe('Customers to create'),
      confirm: z.boolean().describe('Must be true to execute'),
    },
    wrap('import_customers', async (p) => {
      requireConfirm(p, 'import_customers');
      return client.post('/buyer/import', { buyers: p.customers.map(compact) });
    })
  );
}
