import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const adminEnabled = process.env.MCP_FIXTURE_ADMIN === '1';
const toolName = adminEnabled ? 'echo_paid' : 'echo';
const inputSchema = {
  type: 'object',
  properties: { message: { type: 'string', minLength: 1, maxLength: 120 } },
  required: ['message'],
  additionalProperties: false,
};
const outputSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    payment_invoice: { type: 'string' },
  },
  required: ['message', 'payment_invoice'],
  additionalProperties: false,
};
let calls = [];
const initialLegalDocuments = {
  terms: 'NomikOS E2E Terms v1\n',
  privacy: 'NomikOS E2E Privacy v1\n',
};
let legalDocuments = { ...initialLegalDocuments };

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, value, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(value));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'nomikos-local-mcp' });
  }
  if (url.pathname.startsWith('/__fixture/') && !adminEnabled) {
    return sendJson(res, 404, { error: 'not found' });
  }
  if (url.pathname === '/__fixture/state' && req.method === 'GET') {
    return sendJson(res, 200, { calls });
  }
  if (url.pathname === '/__fixture/reset' && req.method === 'POST') {
    calls = [];
    legalDocuments = { ...initialLegalDocuments };
    return sendJson(res, 200, { ok: true });
  }
  if (url.pathname === '/__fixture/legal' && req.method === 'POST') {
    try {
      const update = await readJson(req);
      for (const kind of ['terms', 'privacy']) {
        if (typeof update[kind] === 'string') legalDocuments[kind] = update[kind];
      }
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: String(error) });
    }
  }
  if (url.pathname === '/legal/terms' || url.pathname === '/legal/privacy') {
    const kind = url.pathname.slice('/legal/'.length);
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end(legalDocuments[kind]);
  }
  if (url.pathname !== '/mcp' && url.pathname !== '/mcp-mismatch') {
    return sendJson(res, 404, { error: 'not found' });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST required' });

  try {
    const message = await readJson(req);
    const headers = {};
    if (message.method === 'initialize') {
      headers['Mcp-Session-Id'] = randomUUID();
      return sendJson(res, 200, {
        jsonrpc: '2.0', id: message.id,
        result: {
          protocolVersion: '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: adminEnabled ? 'nomikos-e2e-fixture' : 'nomikos-local-mcp', version: '1.0.0' },
        },
      }, headers);
    }
    if (message.method === 'notifications/initialized') {
      res.writeHead(202);
      return res.end();
    }
    if (message.method === 'tools/list') {
      const schema = url.pathname === '/mcp-mismatch'
        ? { ...inputSchema, properties: { message: { type: 'integer' } } }
        : inputSchema;
      return sendJson(res, 200, {
        jsonrpc: '2.0', id: message.id,
        result: { tools: [{ name: toolName, description: adminEnabled ? 'Fixture tool con pago' : 'Echo local de prueba', inputSchema: schema }] },
      });
    }
    if (message.method === 'tools/call') {
      const params = message.params ?? {};
      if (params.name !== toolName) {
        return sendJson(res, 200, {
          jsonrpc: '2.0', id: message.id,
          error: { code: -32602, message: 'tool not found' },
        });
      }
      const receipt = params._meta?.['io.nomikos/x402-receipt'];
      if (adminEnabled) calls.push({ name: params.name, arguments: params.arguments, receipt });
      return sendJson(res, 200, {
        jsonrpc: '2.0', id: message.id,
        result: {
          content: [{ type: 'text', text: params.arguments?.message ?? '' }],
          structuredContent: adminEnabled
            ? { message: params.arguments?.message ?? '', payment_invoice: receipt?.invoice_id ?? '' }
            : { message: params.arguments?.message ?? '' },
          isError: false,
        },
      });
    }
    return sendJson(res, 200, {
      jsonrpc: '2.0', id: message.id,
      error: { code: -32601, message: 'method not found' },
    });
  } catch (error) {
    return sendJson(res, 400, { error: String(error) });
  }
});

server.listen(4177, '0.0.0.0');
