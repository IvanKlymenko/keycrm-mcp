# keycrm-mcp

> A Model Context Protocol (MCP) server for [keyCRM](https://keycrm.app) — lets Claude manage your keyCRM catalogue, stock, orders, customers, companies, pipelines, and more via natural language.

**Author:** Ivan Klymenko  
**License:** MIT  
**Node.js:** 23.6+  
**MCP SDK:** `@modelcontextprotocol/sdk`

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Requirements](#2-requirements)
3. [Installation](#3-installation)
4. [Configuration](#4-configuration)
5. [MCP Client Setup](#5-mcp-client-setup)
6. [Tool Reference](#6-tool-reference)
   - 6.1 [Products](#61-products)
   - 6.2 [Product Variants (Offers)](#62-product-variants-offers)
   - 6.3 [Product Categories](#63-product-categories)
   - 6.4 [Stock](#64-stock)
   - 6.5 [Orders](#65-orders)
   - 6.6 [Order Reference Data](#66-order-reference-data)
   - 6.7 [Payments](#67-payments)
   - 6.8 [Customers](#68-customers)
   - 6.9 [Companies](#69-companies)
   - 6.10 [Pipelines](#610-pipelines)
   - 6.11 [Storage](#611-storage)
   - 6.12 [Custom Fields, Users and Calls](#612-custom-fields-users-and-calls)
7. [Error Handling](#7-error-handling)
8. [Logging](#8-logging)
9. [Project Structure](#9-project-structure)
10. [Implementation Notes](#10-implementation-notes)
11. [Contributing](#11-contributing)

---

## 1. What This Is

`keycrm-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that wraps the [keyCRM REST API](https://docs.keycrm.app). It exposes 62 Claude-callable tools covering the whole documented keyCRM API (v1.2.0): products, variants, stock, orders, customers, companies, pipelines, payments, files, users, calls, and reference data.

Once configured, you can ask Claude things like:

- *"Show me all products in the Shirts category"*
- *"Update the price of SKU MNL-SRT-WHT-L to 890"*
- *"What is the current stock level for SKU ABC-123?"*
- *"List all orders placed today that are still pending"*
- *"Set the price of every product in the Jackets category to 990"* (with preview + confirmation)
- *"Replace the photo on product ID 42 with this image URL"*
- *"Create an order for John Doe (+380 67 000 0000) with two items"*
- *"Show me all cards in the Sales pipeline"*

The server runs as a local Node.js process and communicates with your MCP client (Claude Desktop or Claude Code) over stdio.

---

## 2. Requirements

| Requirement | Version |
|---|---|
| Node.js | 23.6+ |
| npm | 10+ |
| keyCRM account | Any plan |
| keyCRM API key | Required |

---

## 3. Installation

### 3.1 Clone the repository

```bash
git clone https://github.com/ivanklymenko/keycrm-mcp.git
cd keycrm-mcp
```

### 3.2 Install dependencies

```bash
npm install
```

### 3.3 Create environment file

```bash
cp .env.example .env
```

Edit `.env` with your values — see [Section 4](#4-configuration).

### 3.4 Verify the server starts

```bash
node index.js
```

The server starts in stdio mode and waits for MCP client input. No output means it is working correctly — it only speaks when addressed by a client.

---

## 4. Configuration

All configuration is done via environment variables. Copy `.env.example` to `.env` and fill in the values.

### .env.example

```env
# ─── Required ────────────────────────────────────────────────
# Your keyCRM API key
# Found at: Налаштування → Інтеграції → API
KEYCRM_API_KEY=your_api_key_here

# ─── Optional ────────────────────────────────────────────────
# keyCRM API base URL — only change if keyCRM updates their API endpoint
KEYCRM_API_URL=https://openapi.keycrm.app/v1

# Default page size for list tools (default and maximum: 50, keyCRM's cap)
LIST_DEFAULT_LIMIT=50

# Log level: error | warn | info | debug (default: info)
LOG_LEVEL=info

# Path to the log file (default: ./logs/keycrm-mcp.log)
LOG_FILE=./logs/keycrm-mcp.log
```

### Configuration reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `KEYCRM_API_KEY` | ✅ | — | keyCRM API key |
| `KEYCRM_API_URL` | ❌ | `https://openapi.keycrm.app/v1` | keyCRM API base URL |
| `LIST_DEFAULT_LIMIT` | ❌ | `50` | Default page size for list tools (keyCRM caps pages at 50) |
| `KEYCRM_RATE_LIMIT` | ❌ | `20` | Requests per minute the client paces itself to |
| `KEYCRM_UPLOAD_DIR` | ❌ | — | Directory `upload_file` may read local files from; local uploads are disabled when unset |
| `KEYCRM_ALLOW_PRIVATE_URLS` | ❌ | `false` | Let `upload_file` download from private/loopback addresses |
| `LOG_LEVEL` | ❌ | `info` | Log verbosity |
| `LOG_FILE` | ❌ | `./logs/keycrm-mcp.log` | Log file path |

---

## 5. MCP Client Setup

### Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "keycrm": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/keycrm-mcp/index.js"],
      "env": {
        "KEYCRM_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Restart Claude Desktop after saving the config. The keyCRM tools will appear in the tool list automatically.

### Claude Code

```bash
claude mcp add keycrm -e KEYCRM_API_KEY=your_api_key_here -- node /absolute/path/to/keycrm-mcp/index.js
```

### Running with PM2 (server / VPS)

If you are running the MCP server on a VPS and connecting remotely:

```bash
npm install -g pm2
pm2 start index.js --name keycrm-mcp
pm2 save
pm2 startup
```

---

## 6. Tool Reference

Every tool maps to an endpoint of the [keyCRM OpenAPI](https://docs.keycrm.app) (v1.2.0). Full input schemas, with a description for every field, are served to the MCP client by the server itself. This section lists each tool, the endpoint it calls and its main inputs.

**Conventions shared by all tools:**

- **Pagination.** List tools take `limit` (1–50, default `LIST_DEFAULT_LIMIT`) and `page` (from 1). Responses include `total`, `current_page` and `next_page_url`.
- **Multiple values.** ID and SKU filters accept a single value or an array; arrays are sent comma-separated, as keyCRM expects.
- **Date ranges.** `*_between` filters take `{ "from": "2026-01-01", "to": "2026-01-31 23:59:59" }` in **UTC**.
- **`include`.** Restricted to the associations keyCRM documents for that endpoint. `get_*` tools include everything useful by default.
- **Custom fields.** `custom_fields` is a list of `{ uuid, value }`; get UUIDs from `list_custom_fields`. Pass an array of strings as `value` for select fields.
- **Confirmation.** `create_order`, the `import_*` tools and `bulk_update_products` require `confirm: true`.

### 6.1 Products

| Tool | Endpoint | Main inputs |
|---|---|---|
| `list_products` | `GET /products` | `product_id`, `category_id`, `is_archived`, `include` |
| `get_product` | `GET /products/{id}` | `product_id` |
| `create_product` | `POST /products` | `name`*, `sku`, `price`, `purchased_price`, `currency_code`, `category_id`, `pictures` (≤6 URLs), `barcode`, `unit_type`, dimensions, `custom_fields` |
| `update_product` | `PUT /products/{id}` | `product_id`* + any `create_product` field |
| `import_products` | `POST /products/import` | `products[]`*, `confirm`* |
| `update_product_photo` | `GET` + `PUT /products/{id}` | `product_id`*, `photo_url`*, `replace_existing`, `make_main` |
| `bulk_update_products` | `GET /products` (all pages) + `PUT /products/{id}` each | `filter`* (`product_id` / `category_id` / `is_archived`, at least one), `update`*, `max_products` (default 100), `dry_run`*, `confirm` |

Products have no draft/published status in the keyCRM API, and `is_archived` is read-only (filter only), so there are no publish/archive tools.

### 6.2 Product Variants (Offers)

| Tool | Endpoint | Main inputs |
|---|---|---|
| `list_offers` | `GET /offers` | `offer_id`, `product_id`, `sku` (exact), `is_archived`, `include: ["product"]`, `sort` |
| `create_offer` | `POST /products/{id}/offers` | `product_id`*, `offers[]`* (max 100; `sku`, `price`, `purchased_price`, `barcode`, `image_url`, dimensions, `properties[{name,value}]`) |
| `update_offer` | `PUT /offers` (one batch request) | `offers[]`* identified by `id` or `sku`, with `price`, `purchased_price`, `image_url`, weight/dimensions (SKUs themselves can't be changed) |

### 6.3 Product Categories

| Tool | Endpoint | Main inputs |
|---|---|---|
| `list_categories` | `GET /products/categories` | `category_id`, `parent_id` |
| `create_category` | `POST /products/categories` | `name`*, `parent_id` |

### 6.4 Stock

| Tool | Endpoint | Main inputs |
|---|---|---|
| `get_stock` | `GET /offers/stocks` | `offer_id`, `sku`, `warehouse_id` (narrows the per-warehouse breakdown), `details` (default `true`) |
| `adjust_stock` | `PUT /offers/stocks` | `warehouse_id`*, `stocks[]`* of `{offer_id or sku, quantity}` — absolute quantities, not deltas |

keyCRM has no warehouse list endpoint; the per-warehouse breakdown from `get_stock` shows warehouse IDs and names.

### 6.5 Orders

| Tool | Endpoint | Main inputs |
|---|---|---|
| `list_orders` | `GET /order` | `status_id`, `source_id`, `source_uuid`, `buyer_phone`, `buyer_email`, `payment_status[]`, `has_tracking_code`, `created_between`, `updated_between`, `shipping_between`, `include`, `sort` |
| `get_order` | `GET /order/{id}` | `order_id`*, `include` |
| `create_order` | `POST /order` | `source_id`*, `buyer`* `{full_name, email, phone}`, `products[]` (by `sku`, or one-off by `name`), `payments[]`, `shipping`, `marketing`, discounts, `custom_fields`, `confirm`* |
| `import_orders` | `POST /order/import` | `orders[]`*, `confirm`* |
| `update_order` | `PUT /order/{id}` | `order_id`*, `status_id`, comments, discounts, `products[]` (matched by line `id` or `sku`; unmatched lines are added), `shipping`, `custom_fields` |
| `update_order_status` | `PUT /order/{id}` | `order_id`*, `status_id`* |
| `add_order_payment` | `POST /order/{id}/payment` | `order_id`*, `amount`*, `payment_method_id` or `payment_method`*, `status`, `description`, `payment_date` |
| `update_order_payment` | `PUT /order/{id}/payment/{paymentId}` | `order_id`*, `payment_id`*, `status`, `description` |
| `add_order_expense` | `POST /order/{id}/expense` | `order_id`*, `amount`*, `expense_type_id` or `expense_type`*, `description`, `payment_date` |
| `update_order_expense` | `PUT /order/{id}/expense/{expenseId}` | `order_id`*, `expense_id`*, `status: "canceled"`, `description` |
| `add_order_tag` / `remove_order_tag` | `POST` / `DELETE /order/{id}/tag/{tagId}` | `order_id`*, `tag_id`* |
| `attach_order_file` / `detach_order_file` | `POST` / `DELETE /order/{id}/attachment/{fileId}` | `order_id`*, `file_id`* |

Shipping fields use the keyCRM names: `shipping_address_city`, `shipping_address_region`, `shipping_address_country`, `shipping_address_zip`, `shipping_secondary_line`, `shipping_receive_point`, `recipient_full_name`, `recipient_phone`, `delivery_service_id`, `tracking_code`, `warehouse_ref`, `shipping_date`.

### 6.6 Order Reference Data

All take `limit`, `page` and `sort`.

| Tool | Endpoint |
|---|---|
| `list_order_statuses` | `GET /order/status` |
| `list_payment_methods` | `GET /order/payment-method` |
| `list_sources` | `GET /order/source` |
| `list_tags` | `GET /order/tag` |
| `list_delivery_services` | `GET /order/delivery-service` |
| `list_expense_types` | `GET /order/expense-type` |
| `list_product_statuses` | `GET /order/product-status` |

### 6.7 Payments

| Tool | Endpoint | Main inputs |
|---|---|---|
| `list_external_transactions` | `GET /payments/external-transactions` | `transaction_id`, `transaction_uuid`, `gateway_id`, `is_attached`, `created_between` |
| `attach_external_transaction` | `POST /payments/{id}/external-transactions` | `payment_id`*, `transaction_id` or `transaction_uuid`* |

### 6.8 Customers

| Tool | Endpoint | Main inputs |
|---|---|---|
| `list_customers` | `GET /buyer` | `customer_id`, `phone`, `email`, `created_between`, `updated_between`, `include` |
| `get_customer` | `GET /buyer/{id}` | `customer_id`*, `include` |
| `create_customer` | `POST /buyer` | `full_name`*, `email[]`, `phone[]`, `note`, `birthday`, `discount`, `company_id`, `manager_id`, `shipping[]`, `custom_fields` |
| `update_customer` | `PUT /buyer/{id}` | `customer_id`* + any `create_customer` field |
| `import_customers` | `POST /buyer/import` | `customers[]`*, `confirm`* |

For a customer's orders, call `list_orders` with `buyer_phone` or `buyer_email`.

### 6.9 Companies

| Tool | Endpoint | Main inputs |
|---|---|---|
| `list_companies` | `GET /companies` | `company_id`, `created_between`, `updated_between`, `include` |
| `get_company` | `GET /companies/{id}` | `company_id`*, `include` |
| `create_company` | `POST /companies` | `name`*, `title`, `bank_account`, `notes`, `manager_id`, `buyer_id[]`, `custom_fields` |
| `update_company` | `PUT /companies/{id}` | `company_id`* + any `create_company` field |

### 6.10 Pipelines

| Tool | Endpoint | Main inputs |
|---|---|---|
| `list_pipelines` | `GET /pipelines` | — |
| `list_pipeline_statuses` | `GET /pipelines/{id}/statuses` | `pipeline_id`* |
| `list_pipeline_cards` | `GET /pipelines/cards` | `pipeline_id`, `status_id`, `source_id`, `created_between`, `updated_between`, `include` |
| `get_pipeline_card` | `GET /pipelines/cards/{id}` | `card_id`*, `include` |
| `create_pipeline_card` | `POST /pipelines/cards` (+ `PUT` if `status_id` is given) | `contact`* (`client_id` or `full_name`/`email`/`phone`), `pipeline_id`, `status_id`, `title`, `source_id`, `manager_id`, `manager_comment`, `communicate_at`, UTM fields, `products[]`, `payments[]`, `custom_fields` |
| `update_pipeline_card` | `PUT /pipelines/cards/{id}` | `card_id`*, `status_id` (a stage of another pipeline moves the card there), `title`, `note`, `source_id`, `client_id`, `manager_id`, `communicate_at`, `products[]` (always appended), `custom_fields` |
| `add_pipeline_card_payment` | `POST /pipelines/cards/{id}/payment` | `card_id`*, `amount`*, `payment_method_id` or `payment_method`*, `status`, `description`, `payment_date` |
| `update_pipeline_card_payment` | `PUT /pipelines/cards/{id}/payment/{paymentId}` | `card_id`*, `payment_id`*, `status`, `description` |
| `attach_pipeline_card_file` / `detach_pipeline_card_file` | `POST` / `DELETE /pipelines/cards/{id}/attachment/{fileId}` | `card_id`*, `file_id`* |

The create endpoint takes no stage; when `status_id` is given, `create_pipeline_card` moves the card right after creating it.

### 6.11 Storage

| Tool | Endpoint | Main inputs |
|---|---|---|
| `upload_file` | `POST /storage/upload` (multipart) | `url` or `file_path`*, `filename` — see the note below |
| `list_files` | `GET /storage` | `sort` |
| `list_entity_files` | `GET /storage/attachment/{type}/{id}` | `entity_type`* (`order` or `pipelines`), `entity_id`* |

`upload_file` downloads `url` itself and uploads the bytes, up to 50 MB. URLs that resolve to loopback, private or link-local addresses are refused, including after redirects, unless `KEYCRM_ALLOW_PRIVATE_URLS=true`. `file_path` is disabled unless `KEYCRM_UPLOAD_DIR` is set, and then only files inside that directory can be uploaded. This keeps the model from being steered, for example by text in a CRM record, into uploading arbitrary local files.

### 6.12 Custom Fields, Users and Calls

| Tool | Endpoint | Main inputs |
|---|---|---|
| `list_custom_fields` | `GET /custom-fields` | `model[]` (`order`, `lead`, `client`, `crm_product`), `include_options` (default `true`), `sort` |
| `list_users` | `GET /users` | `user_id`, `full_name`, `email`, `phone`, `role_id`, `status`, `created_between`, `last_logged_between` |
| `list_calls` | `GET /calls` | `type`, `client_id`, `client_phone`, `manager_id`, `lead_id`, `reference_id`, `created_between`, `include` |

`*` = required.

---

## 7. Error Handling

All keyCRM API errors are caught and returned to Claude as structured error messages — they are never thrown as unhandled exceptions.

### Error response shape

```json
{
  "error": true,
  "code": "KEYCRM_API_ERROR",
  "status": 404,
  "message": "Product not found",
  "detail": "No product with ID 9999 exists in keyCRM"
}
```

### Error codes

| Code | Description |
|---|---|
| `KEYCRM_API_ERROR` | keyCRM returned a non-2xx response |
| `KEYCRM_AUTH_ERROR` | API key is invalid or missing |
| `KEYCRM_RATE_LIMIT` | Rate limit still exceeded after 3 retries |
| `KEYCRM_TIMEOUT` | Request timed out |
| `VALIDATION_ERROR` | Tool input failed validation before the API was called |
| `INTERNAL_ERROR` | Unexpected server error |

### Rate limiting

The keyCRM API allows **20 requests per minute per API key**. The client paces its own requests to stay under that (`KEYCRM_RATE_LIMIT`), so calls beyond the 20th in a minute wait instead of failing. Long operations such as a 100-product `bulk_update_products` therefore take several minutes; if your MCP client enforces a short tool timeout, lower `max_products`.

If keyCRM still answers HTTP 429 (for example because another integration shares the key), the server waits for the `Retry-After` header if keyCRM sends one, otherwise backs off exponentially:

- First retry: 5 seconds
- Second retry: 10 seconds
- Third retry: 20 seconds
- After 3 retries: returns a `KEYCRM_RATE_LIMIT` error to Claude

### Timezone

All timestamps in the keyCRM API use **UTC (GMT+0)** — for reads, filters, and writes. The server does not perform timezone conversion. Pass and expect UTC values in all date/time fields.

---

## 8. Logging

All tool calls and API interactions are logged to a local file for debugging.

### Log format

```
[2026-03-25T14:32:01.123Z] [INFO]  tool_call: list_products | params: {"category_id":3} | duration: 312ms | status: ok
[2026-03-25T14:32:05.456Z] [ERROR] tool_call: get_product | params: {"product_id":9999} | duration: 201ms | status: error | code: KEYCRM_API_ERROR | message: Product not found
```

### Log location

Default: `./logs/keycrm-mcp.log`

Override with the `LOG_FILE` environment variable.

Logs are appended — no automatic rotation is implemented. Use `logrotate` on Linux/VPS deployments or clear manually as needed.

---

## 9. Project Structure

```
keycrm-mcp/
├── index.js                  # Entry point — starts the MCP server
├── .env.example              # Environment variable template
├── .env                      # Your local config (not committed)
├── package.json
├── src/
│   ├── server.js             # MCP server setup and tool registration
│   ├── tools/
│   │   ├── products.js       # list/get/create/update/import products,
│   │   │                     # update_product_photo, bulk_update_products
│   │   ├── offers.js         # list_offers, create_offer, update_offer
│   │   ├── categories.js     # list_categories, create_category
│   │   ├── stock.js          # get_stock, adjust_stock
│   │   ├── orders.js         # orders, payments, expenses, tags, attachments
│   │   ├── order-reference.js # statuses, payment methods, sources, tags,
│   │   │                     # delivery services, expense types, product statuses
│   │   ├── payments.js       # list_external_transactions,
│   │   │                     # attach_external_transaction
│   │   ├── customers.js      # list/get/create/update/import customers
│   │   ├── companies.js      # list/get/create/update companies
│   │   ├── pipelines.js      # pipelines, stages, cards, card payments and files
│   │   ├── storage.js        # upload_file, list_files, list_entity_files
│   │   ├── custom-fields.js  # list_custom_fields
│   │   ├── users.js          # list_users
│   │   └── calls.js          # list_calls
│   ├── keycrm/
│   │   ├── client.js         # keyCRM REST API client (fetch wrapper, auth, retry, paging)
│   │   └── errors.js         # Error normalisation
│   └── utils/
│       ├── logger.js         # File logger
│       ├── schemas.js        # Shared Zod schemas (pagination, filters, custom fields)
│       └── validate.js       # Validation and query-building helpers
└── logs/
    └── keycrm-mcp.log        # Runtime log (auto-created)
```

---

## 10. Implementation Notes

### MCP SDK

This server is built with the official Anthropic MCP SDK:

```bash
npm install @modelcontextprotocol/sdk
```

Tools are registered using the SDK's `server.tool()` method. Input schemas are defined using [Zod](https://zod.dev) for runtime validation.

### Transport

The server uses `StdioServerTransport` from the MCP SDK:

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({ name: 'keycrm-mcp', version: '1.0.0' });
const transport = new StdioServerTransport();
await server.connect(transport);
```

### keyCRM API client

All keyCRM API calls go through a single client module (`src/keycrm/client.js`) that handles:

- Base URL and API key injection from environment variables
- Bearer token authentication (`Authorization: Bearer YOUR_KEY`)
- JSON request/response serialisation, and `multipart/form-data` for `FormData` bodies (file uploads)
- HTTP error normalisation, including per-field messages from 422 responses
- Client-side pacing to `KEYCRM_RATE_LIMIT` requests per minute, plus 429 retry honouring `Retry-After` (max 3 retries)
- Request timeout (10 seconds; 60 seconds for uploads)
- `getAll()`, which follows `next_page_url` to collect every page of a list

### `update_product_photo`

keyCRM stores product images as a list of URLs (`pictures`, at most 6, the first is the main image), so no Storage upload is involved:

1. Unless `replace_existing` is set, `GET /products/{id}` reads the current images (`attachments_data`)
2. `PUT /products/{id}` writes the new list — the photo appended, put first (`make_main`), or alone (`replace_existing`)

### `bulk_update_products` dry-run flow

Two-phase call on the same tool:

1. **Phase 1** (`dry_run: true`): Fetches every page of products matching the filter (up to `max_products`) and returns them without modifying anything. `truncated: true` means more products matched than the cap.
2. **Phase 2** (`dry_run: false, confirm: true`): Re-fetches the matching set and updates it one request at a time, paced by the rate limiter, and reports per-product failures.

The filter must set at least one of `product_id`, `category_id` or `is_archived`, so the tool can never target the whole catalogue by accident. If `dry_run: false` is passed without `confirm: true`, the tool returns a `VALIDATION_ERROR`.

### ESM

The project uses ES modules (`"type": "module"` in `package.json`). All imports use ESM syntax.

---

## 11. Contributing

Contributions are welcome. This is a generic keyCRM MCP server — pull requests that extend coverage of the keyCRM API are encouraged.

**Before opening a PR:**

- Follow the existing file structure (one file per resource group in `src/tools/`)
- Add input parameter validation using Zod for every new tool
- Ensure errors are caught and returned as structured error objects, not thrown
- Update this README with the new tool in Section 6

**To report a bug or request a tool:** open a GitHub issue with the keyCRM API endpoint you need covered and a description of the use case.

---

*keycrm-mcp · Ivan Klymenko · MIT License*
