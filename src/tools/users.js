import { z } from 'zod';
import { between, buildQuery } from '../utils/validate.js';
import { dateRange, idList, pageQuery, pagination } from '../utils/schemas.js';

export function registerUserTools(server, client, wrap) {
  server.tool(
    'list_users',
    'List keyCRM users (managers). Their IDs are used as manager_id on orders, cards, customers and companies.',
    {
      user_id: idList.optional().describe('Filter by user ID(s)'),
      full_name: z.string().optional().describe('Filter by full name'),
      email: z.string().optional().describe('Filter by email'),
      phone: z.string().optional().describe('Filter by phone'),
      role_id: idList.optional().describe('Filter by role ID(s)'),
      status: z.enum(['active', 'pending', 'blocked']).optional().describe('Filter by account status'),
      created_between: dateRange.describe('Created date range'),
      last_logged_between: dateRange.describe('Last activity date range'),
      ...pagination,
    },
    wrap('list_users', async (p) => {
      const qs = buildQuery({
        'filter[id]': p.user_id,
        'filter[full_name]': p.full_name,
        'filter[email]': p.email,
        'filter[phone]': p.phone,
        'filter[role_id]': p.role_id,
        'filter[status]': p.status,
        'filter[created_between]': between(p.created_between),
        'filter[last_logged_between]': between(p.last_logged_between),
        ...pageQuery(p),
      });
      return client.get(`/users${qs}`);
    })
  );
}
