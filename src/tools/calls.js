import { z } from 'zod';
import { between, buildQuery } from '../utils/validate.js';
import { dateRange, idList, include, pageQuery, pagination, stringList } from '../utils/schemas.js';

export function registerCallTools(server, client, wrap) {
  server.tool(
    'list_calls',
    'List telephony calls logged in keyCRM. Date filters are in UTC.',
    {
      type: z.enum(['incoming', 'outgoing']).optional().describe('Call direction'),
      client_id: idList.optional().describe('Filter by customer ID(s)'),
      client_phone: stringList.optional().describe('Filter by customer phone(s)'),
      manager_id: idList.optional().describe('Filter by manager ID(s)'),
      lead_id: idList.optional().describe('Filter by pipeline card ID(s)'),
      reference_id: idList.optional().describe('Filter by reference ID(s)'),
      created_between: dateRange.describe('Created date range'),
      include: include(['manager', 'service', 'lead', 'client']),
      ...pagination,
    },
    wrap('list_calls', async (p) => {
      const qs = buildQuery({
        'filter[type]': p.type,
        'filter[client_id]': p.client_id,
        'filter[client_phone]': p.client_phone,
        'filter[manager_id]': p.manager_id,
        'filter[lead_id]': p.lead_id,
        'filter[reference_id]': p.reference_id,
        'filter[created_between]': between(p.created_between),
        include: p.include,
        ...pageQuery(p),
      });
      return client.get(`/calls${qs}`);
    })
  );
}
