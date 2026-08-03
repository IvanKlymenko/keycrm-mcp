import { z } from 'zod';

export function registerOrderReferenceTools(server, client, wrap) {
  server.tool(
    'list_order_statuses',
    'List all available order statuses with their IDs and names.',
    {},
    wrap('list_order_statuses', () => client.get('/order/status'))
  );

  server.tool(
    'list_payment_methods',
    'List all available payment methods with their IDs and names.',
    {},
    wrap('list_payment_methods', () => client.get('/order/payment-method'))
  );

  server.tool(
    'list_sources',
    'List all available order sources (e.g. WooCommerce, POS, Telegram) with their IDs and names.',
    {},
    wrap('list_sources', () => client.get('/order/source'))
  );

  server.tool(
    'list_tags',
    'List all available order tags with their IDs and names.',
    {},
    wrap('list_tags', () => client.get('/order/tag'))
  );

  server.tool(
    'list_delivery_services',
    'List all available delivery services with their IDs and names.',
    {},
    wrap('list_delivery_services', () => client.get('/order/delivery-service'))
  );
}
