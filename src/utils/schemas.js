import { z } from 'zod';

// keyCRM caps every paginated endpoint at 50 items per page (default 15).
export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = Math.min(
  Math.max(1, parseInt(process.env.LIST_DEFAULT_LIMIT || String(MAX_LIMIT), 10) || MAX_LIMIT),
  MAX_LIMIT
);

export const pagination = {
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Results per page (max ${MAX_LIMIT})`),
  page: z.number().int().min(1).optional().describe('Page number, starting at 1'),
};

export function pageQuery(p) {
  return { limit: p.limit ?? DEFAULT_LIMIT, page: p.page ?? 1 };
}

export const sort = z
  .string()
  .optional()
  .describe('Sort field; prefix with "-" for descending (e.g. "-id")');

/** One ID or a list of IDs (sent comma-separated). */
export const idList = z.union([z.number().int(), z.array(z.number().int()).min(1)]);

/** One string or a list of strings (sent comma-separated). */
export const stringList = z.union([z.string(), z.array(z.string()).min(1)]);

export const dateRange = z
  .object({
    from: z.string().describe('Start, UTC: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"'),
    to: z.string().describe('End, UTC: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"'),
  })
  .optional();

/** `include` parameter restricted to the associations keyCRM documents for an endpoint. */
export function include(values) {
  return z
    .array(z.enum(values))
    .optional()
    .describe(`Associations to include. Allowed: ${values.join(', ')}`);
}

export const customFields = z
  .array(
    z.object({
      uuid: z.string().describe('Custom field UUID (see list_custom_fields), e.g. "OR_1037"'),
      value: z
        .union([z.string(), z.array(z.string())])
        .describe('Field value; pass an array of strings for select/multiselect fields'),
    })
  )
  .optional()
  .describe('Custom field values');

export const paymentStatus = z.enum(['paid', 'not_paid', 'canceled']);

export const payment = z.object({
  payment_method_id: z.number().int().optional().describe('Payment method ID (required if payment_method is not set)'),
  payment_method: z.string().optional().describe('Payment method name (required if payment_method_id is not set)'),
  amount: z.number().describe('Payment amount'),
  status: paymentStatus.optional().describe('Payment status'),
  description: z.string().optional().describe('Payment comment'),
  payment_date: z.string().optional().describe('UTC "YYYY-MM-DD HH:MM:SS"; defaults to now'),
});

export const productProperties = z
  .array(z.object({ name: z.string(), value: z.string() }))
  .optional()
  .describe('Attributes as {name, value} pairs');
