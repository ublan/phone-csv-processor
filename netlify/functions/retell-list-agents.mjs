const RETELL_BASE_URL = 'https://api.retellai.com';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders() };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { ok: false, error: 'Method Not Allowed' });
  }

  try {
    const apiKeyOrigen =
      event.queryStringParameters?.apiKeyOrigen || process.env.RETELL_API_KEY_ORIGEN;

    if (!apiKeyOrigen) {
      return jsonResponse(400, {
        ok: false,
        error:
          'Falta API Key de origen. Envía apiKeyOrigen o configura RETELL_API_KEY_ORIGEN en Netlify.',
      });
    }

    const apiRes = await fetch(`${RETELL_BASE_URL}/list-agents?limit=1000`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKeyOrigen}`,
        Accept: 'application/json',
      },
    });

    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      return jsonResponse(apiRes.status, {
        ok: false,
        status: apiRes.status,
        error: data.error || data,
      });
    }

    const agents = Array.isArray(data) ? data : data.agents || data.data || [];
    return jsonResponse(200, { ok: true, agents });
  } catch (e) {
    return jsonResponse(500, {
      ok: false,
      error: e.message || 'Error interno del servidor',
    });
  }
};
