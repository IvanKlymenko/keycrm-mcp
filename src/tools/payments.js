import { z } from 'zod';
import { between, buildQuery } from '../utils/validate.js';
import { dateRange, idList, pageQuery, pagination, stringList } from '../utils/schemas.js';
import { KeyCrmError } from '../keycrm/errors.js';

export function registerPaymentTools(server, client, wrap) {
  server.tool(
    'list_external_transactions',
    'List external payment transactions (e.g. bank or payment gateway) recorded in keyCRM.',
    {
      transaction_id: idList.optional().describe('Filter by keyCRM transaction ID(s)'),
      transaction_uuid: stringList.optional().describe('Filter by external transaction identifier(s)'),
      gateway_id: idList.optional().describe('Filter by payment gateway ID(s)'),
      is_attached: z.boolean().optional().describe('Filter by whether the transaction is attached to an order'),
      created_between: dateRange.describe('Created date range'),
      ...pagination,
    },
    wrap('list_external_transactions', async (p) => {
      const qs = buildQuery({
        'filter[id]': p.transaction_id,
        'filter[transaction_uuid]': p.transaction_uuid,
        'filter[gateway_id]': p.gateway_id,
        'filter[is_attached]': p.is_attached,
        'filter[created_between]': between(p.created_between),
        ...pageQuery(p),
      });
      return client.get(`/payments/external-transactions${qs}`);
    })
  );

  server.tool(
    'attach_external_transaction',
    'Attach an external transaction to a payment. Identify the transaction by transaction_id or transaction_uuid (see list_external_transactions).',
    {
      payment_id: z.number().int().describe('keyCRM payment ID'),
      transaction_id: z.number().int().optional().describe('keyCRM ID of the external transaction'),
      transaction_uuid: z.string().optional().describe('External identifier of the transaction'),
    },
    wrap('attach_external_transaction', async (p) => {
      const body = {};
      if (p.transaction_id !== undefined) body.transaction_id = p.transaction_id;
      if (p.transaction_uuid !== undefined) body.transaction_uuid = p.transaction_uuid;
      if (Object.keys(body).length === 0) {
        throw new KeyCrmError('VALIDATION_ERROR', 'Either transaction_id or transaction_uuid is required');
      }
      return client.post(`/payments/${p.payment_id}/external-transactions`, body);
    })
  );
}
