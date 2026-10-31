import { test, expect, api } from './_helpers';

test('Compose conecta la API al MCP local y ejecuta la tool echo', async () => {
  const statusResponse = await api('/mcp/status');
  expect(statusResponse.status).toBe(200);
  const status = await statusResponse.json() as {
    url?: string;
    connected?: boolean;
    server_info?: { name?: string };
    tools_count?: number;
  };
  test.skip(status.url !== 'http://mcp-server:4177/mcp', 'solo aplica al MCP del Docker Compose local');
  expect(status).toMatchObject({
    connected: true,
    server_info: { name: 'nomikos-local-mcp' },
    tools_count: 1,
  });

  const toolsResponse = await api('/mcp/tools');
  expect(toolsResponse.status).toBe(200);
  const tools = await toolsResponse.json() as { tools: { name: string }[] };
  expect(tools.tools.map((tool) => tool.name)).toEqual(['echo']);

  const callResponse = await api('/mcp/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: 'echo', arguments: { message: 'MCP local conectado' } }),
  });
  expect(callResponse.status).toBe(200);
  expect(await callResponse.json()).toMatchObject({ ok: true, text: 'MCP local conectado' });
});
