import { deletePhoneNumber } from '../../src/integrations/retellAI.js';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const path = event.path || '';
    const match = path.match(/\/api\/retell\/delete\/(.+)$/);
    const phoneNumberId = match ? decodeURIComponent(match[1]) : null;
    if (!phoneNumberId) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'phoneNumberId es requerido en la URL' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { apiKey, phoneNumber } = body;
    if (!apiKey) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'API Key es requerida en el body' }),
      };
    }

    const result = await deletePhoneNumber({ apiKey, phoneNumberId, phoneNumber });
    if (result.success) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true }),
      };
    }
    return {
      statusCode: 400,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: result.error }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: e.message || 'Error interno' }),
    };
  }
};
