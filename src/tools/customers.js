import { z } from 'zod';
import { buildQuery, requireAtLeastOne, requireConfirm } from '../utils/validate.js';

const DEFAULT_LIMIT = parseInt(process.env.LIST_DEFAULT_LIMIT || '50', 10);

export function registerCustomerTools(server, client, wrap) {
  server.tool(
    'list_customers',
    'List customers with optional search.',
    {
      query: z.string().optional().describe('Search by name, email, or phone'),
      limit: z.number().int().min(1).max(200).optional().describe('Number of results to return'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
    },
    wrap('list_customers', async (p) => {
      const limit = p.limit ?? DEFAULT_LIMIT;
      const page = p.offset ? Math.floor(p.offset / limit) + 1 : 1;
      const qs = buildQuery({ 'filter[query]': p.query, limit, page });
      return client.get(`/buyer${qs}`);
    })
  );

  server.tool(
    'get_customer',
    'Get a customer profile including full order history.',
    {
      customer_id: z.number().int().describe('keyCRM customer ID'),
    },
    wrap('get_customer', async (p) =>
      client.get(`/buyer/${p.customer_id}?include=company,loyalty,customFields`)
    )
  );

  server.tool(
    'create_customer',
    'Create a new customer (buyer) record in keyCRM.',
    {
      full_name: z.string().describe('Customer full name'),
      email: z.string().email().optional().describe('Email address'),
      phone: z.string().optional().describe('Phone number'),
      comment: z.string().optional().describe('Internal note'),
    },
    wrap('create_customer', async (p) => {
      const body = { full_name: p.full_name };
      if (p.email !== undefined) body.email = p.email;
      if (p.phone !== undefined) body.phone = p.phone;
      if (p.comment !== undefined) body.comment = p.comment;
      return client.post('/buyer', body);
    })
  );

  server.tool(
    'update_customer',
    'Update an existing customer record.',
    {
      customer_id: z.number().int().describe('keyCRM customer ID'),
      full_name: z.string().optional().describe('Customer full name'),
      email: z.string().email().optional().describe('Email address'),
      phone: z.string().optional().describe('Phone number'),
      comment: z.string().optional().describe('Internal note'),
    },
    wrap('update_customer', async (p) => {
      const { customer_id, ...fields } = p;
      requireAtLeastOne(fields, ['full_name', 'email', 'phone', 'comment']);
      const body = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) body[k] = v;
      }
      return client.put(`/buyer/${customer_id}`, body);
    })
  );

  server.tool(
    'import_customers',
    'Bulk import a list of customer records into keyCRM. Requires confirm: true.',
    {
      customers: z
        .array(
          z.object({
            full_name: z.string().describe('Customer full name'),
            email: z.string().email().optional(),
            phone: z.string().optional(),
          })
        )
        .min(1)
        .describe('Array of customer objects'),
      confirm: z.boolean().describe('Must be true to execute'),
    },
    wrap('import_customers', async (p) => {
      requireConfirm(p, 'import_customers');
      return client.post('/buyer/import', { buyers: p.customers });
    })
  );
}
