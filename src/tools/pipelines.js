import { z } from 'zod';
import { between, buildQuery, compact, pick, requireAtLeastOne } from '../utils/validate.js';
import {
  customFields,
  dateRange,
  idList,
  include,
  pageQuery,
  pagination,
  payment,
  paymentStatus,
} from '../utils/schemas.js';
import { KeyCrmError } from '../keycrm/errors.js';

const CARD_INCLUDES = ['contact.client', 'products', 'manager', 'status', 'payments', 'custom_fields'];

const cardProduct = z.object({
  sku: z.string().optional().describe('SKU of a catalogue variant'),
  name: z.string().optional().describe('Item name'),
  price: z.number().optional().describe('Unit price'),
  quantity: z.number().optional(),
  unit_type: z.string().optional(),
  picture: z.string().optional().describe('Image URL'),
});

const CREATE_KEYS = [
  'pipeline_id',
  'title',
  'source_id',
  'manager_comment',
  'manager_id',
  'communicate_at',
  'contact',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'products',
  'payments',
  'custom_fields',
];

const UPDATE_KEYS = [
  'title',
  'note',
  'status_id',
  'source_id',
  'client_id',
  'manager_id',
  'communicate_at',
  'products',
  'custom_fields',
];

export function registerPipelineTools(server, client, wrap) {
  server.tool(
    'list_pipelines',
    'List pipelines with their IDs and names.',
    { ...pagination },
    wrap('list_pipelines', async (p) => client.get(`/pipelines${buildQuery(pageQuery(p))}`))
  );

  server.tool(
    'list_pipeline_statuses',
    'List the stages of a pipeline with their IDs and names.',
    {
      pipeline_id: z.number().int().describe('Pipeline ID'),
      ...pagination,
    },
    wrap('list_pipeline_statuses', async (p) =>
      client.get(`/pipelines/${p.pipeline_id}/statuses${buildQuery(pageQuery(p))}`)
    )
  );

  server.tool(
    'list_pipeline_cards',
    'List pipeline cards with optional filters. Date filters are in UTC.',
    {
      pipeline_id: idList.optional().describe('Filter by pipeline ID(s)'),
      status_id: idList.optional().describe('Filter by stage ID(s)'),
      source_id: idList.optional().describe('Filter by source ID(s)'),
      created_between: dateRange.describe('Created date range'),
      updated_between: dateRange.describe('Updated date range'),
      include: include(CARD_INCLUDES),
      ...pagination,
    },
    wrap('list_pipeline_cards', async (p) => {
      const qs = buildQuery({
        'filter[pipeline_id]': p.pipeline_id,
        'filter[status_id]': p.status_id,
        'filter[source_id]': p.source_id,
        'filter[created_between]': between(p.created_between),
        'filter[updated_between]': between(p.updated_between),
        include: p.include,
        ...pageQuery(p),
      });
      return client.get(`/pipelines/cards${qs}`);
    })
  );

  server.tool(
    'get_pipeline_card',
    'Get a single pipeline card. By default includes contact, products, manager, status, payments and custom fields.',
    {
      card_id: z.number().int().describe('Pipeline card ID'),
      include: include(CARD_INCLUDES),
    },
    wrap('get_pipeline_card', async (p) =>
      client.get(`/pipelines/cards/${p.card_id}${buildQuery({ include: p.include ?? CARD_INCLUDES })}`)
    )
  );

  server.tool(
    'create_pipeline_card',
    'Create a new card in a pipeline. The create endpoint takes no stage, so when status_id is given the card is moved there right after creation.',
    {
      contact: z
        .object({
          client_id: z.number().int().optional().describe('Existing customer ID; other contact fields are then ignored'),
          full_name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional().describe('International format with "+"'),
        })
        .describe('Contact for the card'),
      pipeline_id: z.number().int().optional().describe('Pipeline ID (defaults to the first pipeline)'),
      status_id: z.number().int().optional().describe('Stage to move the card to after creation'),
      title: z.string().optional().describe('Card title (defaults to the card ID)'),
      source_id: z.number().int().optional().describe('Source ID'),
      manager_id: z.number().int().optional().describe('Responsible manager ID'),
      manager_comment: z.string().optional().describe('Manager comment'),
      communicate_at: z.string().optional().describe('Next contact time, UTC "YYYY-MM-DD HH:MM:SS"'),
      utm_source: z.string().optional(),
      utm_medium: z.string().optional(),
      utm_campaign: z.string().optional(),
      utm_term: z.string().optional(),
      utm_content: z.string().optional(),
      products: z.array(cardProduct).optional().describe('Products on the card'),
      payments: z.array(payment).optional().describe('Payments to record on the card'),
      custom_fields: customFields,
    },
    wrap('create_pipeline_card', async (p) => {
      const card = await client.post('/pipelines/cards', pick(p, CREATE_KEYS));
      if (p.status_id === undefined || !card?.id) return card;
      try {
        return await client.put(`/pipelines/cards/${card.id}`, { status_id: p.status_id });
      } catch (e) {
        throw new KeyCrmError(
          e.code ?? 'KEYCRM_API_ERROR',
          `Card ${card.id} was created but moving it to status ${p.status_id} failed: ${e.message}`,
          e.status ?? null,
          e.detail ?? null
        );
      }
    })
  );

  server.tool(
    'update_pipeline_card',
    'Update a pipeline card. To move it to another pipeline, pass a status_id that belongs to that pipeline. products are always appended, never updated.',
    {
      card_id: z.number().int().describe('Pipeline card ID'),
      status_id: z.number().int().optional().describe('New stage ID'),
      title: z.string().optional().describe('Card title'),
      note: z.string().optional().describe('Card note'),
      source_id: z.number().int().optional().describe('Source ID'),
      client_id: z.number().int().optional().describe('Link the card to this existing customer'),
      manager_id: z.number().int().optional().describe('Responsible manager ID'),
      communicate_at: z.string().optional().describe('Next contact time, UTC "YYYY-MM-DD HH:MM:SS"'),
      products: z.array(cardProduct.omit({ unit_type: true })).optional().describe('Products to add to the card'),
      custom_fields: customFields,
    },
    wrap('update_pipeline_card', async (p) => {
      requireAtLeastOne(p, UPDATE_KEYS);
      return client.put(`/pipelines/cards/${p.card_id}`, pick(p, UPDATE_KEYS));
    })
  );

  server.tool(
    'add_pipeline_card_payment',
    'Record a payment on a pipeline card. Pass payment_method_id or payment_method.',
    {
      card_id: z.number().int().describe('Pipeline card ID'),
      ...payment.shape,
    },
    wrap('add_pipeline_card_payment', async (p) => {
      if (p.payment_method_id === undefined && p.payment_method === undefined) {
        throw new KeyCrmError('VALIDATION_ERROR', 'Either payment_method_id or payment_method is required');
      }
      const { card_id, ...fields } = p;
      return client.post(`/pipelines/cards/${card_id}/payment`, compact(fields));
    })
  );

  server.tool(
    'update_pipeline_card_payment',
    "Change a payment's status or description on a pipeline card.",
    {
      card_id: z.number().int().describe('Pipeline card ID'),
      payment_id: z.number().int().describe('Payment ID'),
      status: paymentStatus.optional().describe('New payment status'),
      description: z.string().optional().describe('Payment comment'),
    },
    wrap('update_pipeline_card_payment', async (p) => {
      requireAtLeastOne(p, ['status', 'description']);
      return client.put(
        `/pipelines/cards/${p.card_id}/payment/${p.payment_id}`,
        pick(p, ['status', 'description'])
      );
    })
  );

  server.tool(
    'attach_pipeline_card_file',
    'Attach an uploaded file (see upload_file) to a pipeline card.',
    {
      card_id: z.number().int().describe('Pipeline card ID'),
      file_id: z.number().int().describe('Storage file ID'),
    },
    wrap('attach_pipeline_card_file', async (p) =>
      client.post(`/pipelines/cards/${p.card_id}/attachment/${p.file_id}`)
    )
  );

  server.tool(
    'detach_pipeline_card_file',
    'Remove a file from a pipeline card.',
    {
      card_id: z.number().int().describe('Pipeline card ID'),
      file_id: z.number().int().describe('Storage file ID'),
    },
    wrap('detach_pipeline_card_file', async (p) =>
      client.delete(`/pipelines/cards/${p.card_id}/attachment/${p.file_id}`)
    )
  );
}
