import { z } from 'zod';
import { buildQuery } from '../utils/validate.js';
import { idList, pageQuery, pagination } from '../utils/schemas.js';

export function registerCategoryTools(server, client, wrap) {
  server.tool(
    'list_categories',
    'List product categories.',
    {
      category_id: idList.optional().describe('Filter by category ID(s)'),
      parent_id: idList.optional().describe('Filter by parent category ID(s)'),
      ...pagination,
    },
    wrap('list_categories', async (p) => {
      const qs = buildQuery({
        'filter[category_id]': p.category_id,
        'filter[parent_id]': p.parent_id,
        ...pageQuery(p),
      });
      return client.get(`/products/categories${qs}`);
    })
  );

  server.tool(
    'create_category',
    'Create a new product category.',
    {
      name: z.string().describe('Category name'),
      parent_id: z.number().int().optional().describe('Parent category ID for nested categories'),
    },
    wrap('create_category', async (p) => {
      const body = { name: p.name };
      if (p.parent_id !== undefined) body.parent_id = p.parent_id;
      return client.post('/products/categories', body);
    })
  );
}
