import { z } from 'zod';
import { buildQuery } from '../utils/validate.js';

const DEFAULT_LIMIT = parseInt(process.env.LIST_DEFAULT_LIMIT || '50', 10);

export function registerPaymentTools(server, client, wrap) {
  server.tool(
    'list_external_transactions',
    'List external payment transactions recorded in keyCRM.',
    {
      limit: z.number().int().min(1).max(200).optional().describe('Number of results to return'),
      offset: z.number().int().min(0).optional().describe('Pagination offset'),
    },
    wrap('list_external_transactions', async (p) => {
      const limit = p.limit ?? DEFAULT_LIMIT;
      const page = p.offset ? Math.floor(p.offset / limit) + 1 : 1;
      return client.get(`/payments/external-transactions${buildQuery({ limit, page })}`);
    })
  );

  server.tool(
    'attach_external_transaction',
    'Attach an external transaction to an existing payment record in keyCRM.',
    {
      payment_id: z.number().int().describe('keyCRM payment ID'),
      transaction_id: z.string().describe('External transaction identifier'),
      amount: z.number().positive().describe('Transaction amount'),
      description: z.string().optional().describe('Optional description'),
    },
    wrap('attach_external_transaction', async (p) => {
      const body = {
        transaction_id: p.transaction_id,
        amount: p.amount,
      };
      if (p.description !== undefined) body.description = p.description;
      return client.post(`/payments/${p.payment_id}/external-transactions`, body);
    })
  );
}
