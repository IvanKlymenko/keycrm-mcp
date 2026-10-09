import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createClient } from './keycrm/client.js';
import { normalizeError } from './keycrm/errors.js';
import { logger } from './utils/logger.js';
import { registerProductTools } from './tools/products.js';
import { registerOfferTools } from './tools/offers.js';
import { registerCategoryTools } from './tools/categories.js';
import { registerStockTools } from './tools/stock.js';
import { registerOrderTools } from './tools/orders.js';
import { registerOrderReferenceTools } from './tools/order-reference.js';
import { registerPaymentTools } from './tools/payments.js';
import { registerCustomerTools } from './tools/customers.js';
import { registerPipelineTools } from './tools/pipelines.js';
import { registerStorageTools } from './tools/storage.js';
import { registerCustomFieldTools } from './tools/custom-fields.js';
import { registerCompanyTools } from './tools/companies.js';
import { registerUserTools } from './tools/users.js';
import { registerCallTools } from './tools/calls.js';

export function createServer() {
  const server = new McpServer({ name: 'keycrm-mcp', version: '1.0.0' });
  const client = createClient();

  /**
   * Wraps a tool handler with timing, logging, and error normalisation.
   * Returns a handler that always resolves — errors become MCP text content.
   */
  function wrap(toolName, fn) {
    return async (params) => {
      const start = Date.now();
      try {
        const result = await fn(params);
        logger.toolCall({ tool: toolName, params, duration: Date.now() - start, status: 'ok' });
        return {
          content: [{ type: 'text', text: JSON.stringify(result ?? null, null, 2) }],
        };
      } catch (err) {
        const normalized = normalizeError(err);
        logger.toolCall({
          tool: toolName,
          params,
          duration: Date.now() - start,
          status: 'error',
          code: normalized.code,
          message: normalized.message,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(normalized.toJSON(), null, 2) }],
          isError: true,
        };
      }
    };
  }

  registerProductTools(server, client, wrap);
  registerOfferTools(server, client, wrap);
  registerCategoryTools(server, client, wrap);
  registerStockTools(server, client, wrap);
  registerOrderTools(server, client, wrap);
  registerOrderReferenceTools(server, client, wrap);
  registerPaymentTools(server, client, wrap);
  registerCustomerTools(server, client, wrap);
  registerPipelineTools(server, client, wrap);
  registerStorageTools(server, client, wrap);
  registerCustomFieldTools(server, client, wrap);
  registerCompanyTools(server, client, wrap);
  registerUserTools(server, client, wrap);
  registerCallTools(server, client, wrap);

  return server;
}
