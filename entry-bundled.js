// Verification entry point — strips the dotenv import.
// In production bundling, this same stripping will be done.
// The bundled server receives env vars from the child process spawn,
// never from .env files.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './src/server.js';

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
