import { z } from 'zod';
import { buildQuery } from '../utils/validate.js';
import { sort } from '../utils/schemas.js';

export function registerCustomFieldTools(server, client, wrap) {
  server.tool(
    'list_custom_fields',
    'List custom fields configured in keyCRM with their UUIDs, names, types and (optionally) list options.',
    {
      model: z
        .array(z.enum(['order', 'lead', 'client', 'crm_product']))
        .optional()
        .describe('Only fields of these entities (lead = pipeline card, client = customer, crm_product = product)'),
      include_options: z.boolean().optional().describe('Include options of select fields (default true)'),
      sort,
    },
    wrap('list_custom_fields', async (p) => {
      const qs = buildQuery({
        'filter[model]': p.model,
        include: p.include_options === false ? undefined : 'options',
        sort: p.sort,
      });
      return client.get(`/custom-fields${qs}`);
    })
  );
}
