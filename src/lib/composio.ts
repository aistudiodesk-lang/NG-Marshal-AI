// Thin wrapper over the Composio tool-execution REST API.
// Server-only: uses COMPOSIO_API_KEY + the connected Gmail account.
const BASE = "https://backend.composio.dev/api/v3/tools/execute";

export async function composioExecute(
  tool: string,
  args: Record<string, unknown>
) {
  const res = await fetch(`${BASE}/${tool}`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.COMPOSIO_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      connected_account_id: process.env.COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID,
      user_id: process.env.COMPOSIO_USER_ID,
      arguments: args,
    }),
  });

  const json = await res.json();
  if (!res.ok || json?.successful === false) {
    throw new Error(
      `Composio ${tool} failed: ${JSON.stringify(json?.error ?? json)}`
    );
  }
  // Some tools nest the payload under response_data; normalise it away.
  const data = json?.data ?? {};
  return data?.response_data ?? data;
}
