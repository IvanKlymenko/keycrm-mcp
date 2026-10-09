import { buildQuery } from '../utils/validate.js';
import { pageQuery, pagination, sort } from '../utils/schemas.js';

const REFERENCE_LISTS = [
  ['list_order_statuses', '/order/status', 'List order statuses with their IDs and names.'],
  ['list_payment_methods', '/order/payment-method', 'List payment methods with their IDs and names.'],
  ['list_sources', '/order/source', 'List order sources (e.g. WooCommerce, POS, Telegram) with their IDs and names.'],
  ['list_tags', '/order/tag', 'List order tags with their IDs and names.'],
  ['list_delivery_services', '/order/delivery-service', 'List delivery services with their IDs and names.'],
  ['list_expense_types', '/order/expense-type', 'List order expense types with their IDs and names.'],
  ['list_product_statuses', '/order/product-status', 'List order line-item statuses with their IDs and names.'],
];

export function registerOrderReferenceTools(server, client, wrap) {
  for (const [name, path, description] of REFERENCE_LISTS) {
    server.tool(
      name,
      `${description} Paginated; check next_page_url for more.`,
      { sort, ...pagination },
      wrap(name, async (p) => client.get(`${path}${buildQuery({ sort: p.sort, ...pageQuery(p) })}`))
    );
  }
}
