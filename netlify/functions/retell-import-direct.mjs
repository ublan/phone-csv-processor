import { importPhoneNumber } from '../../src/integrations/retellAI.js';

function generateIncrementalNickname(baseNickname, index) {
  if (!baseNickname || baseNickname.trim() === '') return '';
  const trimmed = baseNickname.trim();
  const match = trimmed.match(/^(.+?)\s+(\d+)$/);
  if (match) {
    const prefix = match[1];
    const startNumber = parseInt(match[2], 10);
    return `${prefix} ${startNumber + index}`;
  }
  return `${trimmed} ${index + 1}`;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders() };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      phoneNumbers,
      apiKey,
      terminationUri,
      outboundAgentId,
      outboundTransport = 'UDP',
      sipTrunkUsername,
      sipTrunkPassword,
      nickname,
    } = body;

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'phoneNumbers es requerido y debe ser un array' }),
      };
    }
    if (!apiKey) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'API Key es requerida' }),
      };
    }
    if (!terminationUri) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Termination URI es requerida' }),
      };
    }
    if (!outboundAgentId) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Outbound Agent ID es requerido' }),
      };
    }

    const importConfig = {
      terminationUri,
      outboundAgentId,
      outboundTransport,
      sipTrunkUsername,
      sipTrunkPassword,
      nickname,
    };

    let imported = 0;
    let failed = 0;
    const results = [];

    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i];
      const currentNickname = nickname ? generateIncrementalNickname(nickname, i) : undefined;
      const result = await importPhoneNumber({
        apiKey,
        phoneNumber,
        ...importConfig,
        nickname: currentNickname,
      });
      results.push({ phoneNumber, ...result });
      if (result.success) imported++;
      else failed++;
      if (i < phoneNumbers.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'complete',
        imported,
        failed,
        total: phoneNumbers.length,
        results: results.slice(0, 100),
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: e.message || 'Error interno' }),
    };
  }
};
