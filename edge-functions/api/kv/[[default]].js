/**
 * EdgeOne Edge Function — KV proxy for Next.js API routes.
 *
 * Edge Functions can access KV bindings (MED_DATA / MED_CONFIG) as globals.
 * Next.js API routes cannot, so they call this proxy via internal fetch.
 *
 * Route: /api/kv/*
 *   POST /api/kv/get    { ns, key }
 *   POST /api/kv/put    { ns, key, value }
 *   POST /api/kv/delete { ns, key }
 *   POST /api/kv/list   { ns, prefix, limit }
 *
 * Security: only accepts requests with x-kv-secret header matching KV_PROXY_SECRET env var.
 */

function getBinding(ns) {
  if (ns === "config") return typeof MED_CONFIG !== "undefined" ? MED_CONFIG : null;
  if (ns === "data") return typeof MED_DATA !== "undefined" ? MED_DATA : null;
  return null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const KV_PROXY_SECRET = "med-kv-internal-2024";

export async function onRequestPost({ request, params }) {
  const secret = request.headers.get("x-kv-secret");
  if (secret !== KV_PROXY_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  const action = Array.isArray(params.default) ? params.default[0] : params.default;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { ns = "data", key, value, prefix, limit } = body;
  const binding = getBinding(ns);

  if (!binding) {
    return json(
      {
        error: `KV binding not found for namespace "${ns}"`,
        debug: {
          hasMedData: typeof MED_DATA !== "undefined",
          hasMedConfig: typeof MED_CONFIG !== "undefined",
        },
      },
      500,
    );
  }

  try {
    switch (action) {
      case "get": {
        const raw = await binding.get(key);
        return json({ value: raw });
      }
      case "put": {
        await binding.put(key, typeof value === "string" ? value : JSON.stringify(value));
        return json({ ok: true });
      }
      case "delete": {
        await binding.delete(key);
        return json({ ok: true });
      }
      case "list": {
        const result = await binding.list({ prefix: prefix || "", limit: limit || 256 });
        return json({ keys: result.keys.map((k) => k.key) });
      }
      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: err.message || String(err) }, 500);
  }
}

export async function onRequestGet({ params }) {
  return json({
    status: "kv-proxy ready",
    hasMedData: typeof MED_DATA !== "undefined",
    hasMedConfig: typeof MED_CONFIG !== "undefined",
  });
}
