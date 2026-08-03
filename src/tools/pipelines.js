import { z } from 'zod';
import { buildQuery, requireAtLeastOne } from '../utils/validate.js';

const DEFAULT_LIMIT = parseInt(process.env.LIST_DEFAULT_LIMIT || '50', 10);

const contactSchema = z
  .object({
    full_name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })
  .optional();

export function registerPipelineTools(server, client, wrap) {
  server.tool(
    'list_pipelines',
    'List all pipelines with their IDs and names.',
    {},
    wrap('list_pipelines', () => client.get('/pipelines'))
  );

  server.tool(
    'list_pipeline_statuses',
    'List all stages for a specific pipeline with their IDs and names.',
    {
      pipeline_id: z.number().int().describe('Pipeline ID'),
    },
    wrap('list_pipeline_statuses', async (p) =>
      client.get(`/pipelines/${p.pipeline_id}/statuses`)
    )
  );

  server.tool(
    'list_pipeline_cards',
    'List pipeline cards with optional filters.',
    {
      pipeline_id: z.number().int().optional().describe('Filter by pipeline ID'),
      status_id: z.number().int().optional().describe('Filter by pipeline stage ID'),
      limit: z.number().int().min(1).max(200).optional().describe('Number of results to return'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
    },
    wrap('list_pipeline_cards', async (p) => {
      const limit = p.limit ?? DEFAULT_LIMIT;
      const page = p.offset ? Math.floor(p.offset / limit) + 1 : 1;
      const qs = buildQuery({
        'filter[pipeline_id]': p.pipeline_id,
        'filter[status_id]': p.status_id,
        limit,
        page,
      });
      return client.get(`/pipelines/cards${qs}`);
    })
  );

  server.tool(
    'get_pipeline_card',
    'Get full details for a single pipeline card.',
    {
      card_id: z.number().int().describe('Pipeline card ID'),
    },
    wrap('get_pipeline_card', async (p) =>
      client.get(`/pipelines/cards/${p.card_id}?include=products,payments,contact`)
    )
  );

  server.tool(
    'create_pipeline_card',
    'Create a new card in a pipeline.',
    {
      pipeline_id: z.number().int().describe('Pipeline ID'),
      status_id: z.number().int().describe('Initial stage ID'),
      title: z.string().optional().describe('Card title'),
      contact: contactSchema.describe('Contact details'),
      products: z
        .array(z.object({ offer_id: z.number().int(), quantity: z.number().int().min(1), price: z.number().optional() }))
        .optional()
        .describe('Array of product line items'),
      manager_comment: z.string().optional().describe('Internal note'),
    },
    wrap('create_pipeline_card', async (p) => {
      const body = { pipeline_id: p.pipeline_id, status_id: p.status_id };
      const optional = ['title', 'contact', 'products', 'manager_comment'];
      for (const key of optional) {
        if (p[key] !== undefined) body[key] = p[key];
      }
      return client.post('/pipelines/cards', body);
    })
  );

  server.tool(
    'update_pipeline_card',
    'Update an existing pipeline card (move stage, update contact, add notes, etc.).',
    {
      card_id: z.number().int().describe('Pipeline card ID'),
      status_id: z.number().int().optional().describe('New stage ID'),
      title: z.string().optional().describe('Updated title'),
      manager_comment: z.string().optional().describe('Updated internal note'),
      contact: contactSchema.describe('Updated contact details'),
    },
    wrap('update_pipeline_card', async (p) => {
      const { card_id, ...fields } = p;
      requireAtLeastOne(fields, ['status_id', 'title', 'manager_comment', 'contact']);
      const body = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) body[k] = v;
      }
      return client.put(`/pipelines/cards/${card_id}`, body);
    })
  );
}
