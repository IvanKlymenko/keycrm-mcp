import { z } from 'zod';
import { between, buildQuery, pick, requireAtLeastOne } from '../utils/validate.js';
import { customFields, dateRange, idList, include, pageQuery, pagination } from '../utils/schemas.js';

const COMPANY_INCLUDES = ['manager', 'buyer', 'custom_fields'];

const companyFields = {
  title: z.string().optional().describe('Full legal name'),
  bank_account: z.string().optional().describe('Bank details, e.g. IBAN'),
  notes: z.string().optional().describe('Internal note'),
  manager_id: z.number().int().optional().describe('Responsible manager ID (see list_users)'),
  buyer_id: z.array(z.number().int()).optional().describe('Customer IDs to link to the company'),
  custom_fields: customFields,
};

const COMPANY_KEYS = ['name', ...Object.keys(companyFields)];

export function registerCompanyTools(server, client, wrap) {
  server.tool(
    'list_companies',
    'List companies with optional filters. Date filters are in UTC.',
    {
      company_id: idList.optional().describe('Filter by company ID(s)'),
      created_between: dateRange.describe('Created date range'),
      updated_between: dateRange.describe('Updated date range'),
      include: include(COMPANY_INCLUDES),
      ...pagination,
    },
    wrap('list_companies', async (p) => {
      const qs = buildQuery({
        'filter[company_id]': p.company_id,
        'filter[created_between]': between(p.created_between),
        'filter[updated_between]': between(p.updated_between),
        include: p.include,
        ...pageQuery(p),
      });
      return client.get(`/companies${qs}`);
    })
  );

  server.tool(
    'get_company',
    'Get a single company with its manager, linked customers and custom fields.',
    {
      company_id: z.number().int().describe('keyCRM company ID'),
      include: include(COMPANY_INCLUDES),
    },
    wrap('get_company', async (p) =>
      client.get(`/companies/${p.company_id}${buildQuery({ include: p.include ?? COMPANY_INCLUDES })}`)
    )
  );

  server.tool(
    'create_company',
    'Create a new company.',
    {
      name: z.string().describe('Company name'),
      ...companyFields,
    },
    wrap('create_company', async (p) => client.post('/companies', pick(p, COMPANY_KEYS)))
  );

  server.tool(
    'update_company',
    'Update an existing company.',
    {
      company_id: z.number().int().describe('keyCRM company ID'),
      name: z.string().optional().describe('Company name'),
      ...companyFields,
    },
    wrap('update_company', async (p) => {
      requireAtLeastOne(p, COMPANY_KEYS);
      return client.put(`/companies/${p.company_id}`, pick(p, COMPANY_KEYS));
    })
  );
}
