const RETELL_BASE_URL = 'https://api.retellai.com';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method Not Allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const apiKeyOrigen = body.apiKeyOrigen || process.env.RETELL_API_KEY_ORIGEN;
    const apiKeyDestino = body.apiKeyDestino || process.env.RETELL_API_KEY_DESTINO;
    const agentId = body.agentId || process.env.AGENT_ID;
    const logs = [];

    const missing = [];
    if (!apiKeyOrigen) missing.push('RETELL_API_KEY_ORIGEN');
    if (!apiKeyDestino) missing.push('RETELL_API_KEY_DESTINO');
    if (!agentId) missing.push('AGENT_ID');
    if (missing.length) {
      return jsonResponse(400, {
        ok: false,
        error: 'Faltan variables/valores requeridos para la migración.',
        missing,
      });
    }

    logs.push(`Obteniendo agente origen ${agentId}...`);
    const agentRes = await fetch(`${RETELL_BASE_URL}/get-agent/${encodeURIComponent(agentId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKeyOrigen}`,
        Accept: 'application/json',
      },
    });
    const agentJson = await agentRes.json().catch(() => ({}));
    if (!agentRes.ok) {
      return jsonResponse(agentRes.status, {
        ok: false,
        step: 'get-agent',
        status: agentRes.status,
        error: agentJson.error || agentJson,
      });
    }

    const agent = agentJson;
    let sourceLlmId = null;
    let newLlmId = null;

    const responseEngine = agent.response_engine || agent.responseEngine || null;
    if (responseEngine && responseEngine.type === 'retell-llm' && responseEngine.llm_id) {
      sourceLlmId = responseEngine.llm_id;
      logs.push(`El agente usa Retell LLM ${sourceLlmId}. Obteniendo configuración de LLM...`);

      const llmRes = await fetch(`${RETELL_BASE_URL}/get-retell-llm/${encodeURIComponent(sourceLlmId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKeyOrigen}`,
          Accept: 'application/json',
        },
      });
      const llmJson = await llmRes.json().catch(() => ({}));
      if (!llmRes.ok) {
        return jsonResponse(llmRes.status, {
          ok: false,
          step: 'get-retell-llm',
          status: llmRes.status,
          error: llmJson.error || llmJson,
        });
      }

      const {
        llm_id: _llmId,
        version: _version,
        last_modification_timestamp: _lastTs,
        is_published: _isPublished,
        ...llmBody
      } = llmJson || {};

      logs.push('Creando LLM en la organización destino...');
      const createLlmRes = await fetch(`${RETELL_BASE_URL}/create-retell-llm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKeyDestino}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(llmBody),
      });
      const createLlmJson = await createLlmRes.json().catch(() => ({}));
      if (!createLlmRes.ok) {
        return jsonResponse(createLlmRes.status, {
          ok: false,
          step: 'create-retell-llm',
          status: createLlmRes.status,
          error: createLlmJson.error || createLlmJson,
        });
      }

      newLlmId = createLlmJson.llm_id || createLlmJson.id || null;
      logs.push(`Nuevo LLM creado en destino: ${newLlmId || '(sin llm_id en respuesta)'}`);
    } else {
      logs.push('El agente no usa un Retell LLM (response_engine.llm_id vacío). Se migrará sin clonar LLM.');
    }

    logs.push('Preparando voice_id en la organización destino...');
    let finalVoiceId = agent.voice_id || null;
    if (finalVoiceId) {
      const listVoicesRes = await fetch(`${RETELL_BASE_URL}/list-voices`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKeyDestino}`,
          Accept: 'application/json',
        },
      });
      const listVoicesJson = await listVoicesRes.json().catch(() => ({}));
      if (!listVoicesRes.ok) {
        return jsonResponse(listVoicesRes.status, {
          ok: false,
          step: 'validate-voice',
          status: listVoicesRes.status,
          error: listVoicesJson.error || listVoicesJson,
        });
      }
      const voices = Array.isArray(listVoicesJson)
        ? listVoicesJson
        : listVoicesJson.voices || listVoicesJson.data || [];
      const exists = voices.some((v) => v.voice_id === finalVoiceId);

      if (!exists) {
        logs.push(
          `La voz ${finalVoiceId} no existe en destino. Consultando detalles de la voz en la organización origen...`,
        );

        const getVoiceRes = await fetch(
          `${RETELL_BASE_URL}/get-voice/${encodeURIComponent(finalVoiceId)}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKeyOrigen}`,
              Accept: 'application/json',
            },
          },
        );
        const getVoiceJson = await getVoiceRes.json().catch(() => ({}));
        if (!getVoiceRes.ok) {
          return jsonResponse(getVoiceRes.status, {
            ok: false,
            step: 'get-voice',
            status: getVoiceRes.status,
            error: getVoiceJson.error || getVoiceJson,
          });
        }

        const voiceName =
          (getVoiceJson && getVoiceJson.voice_name) ||
          (getVoiceJson && getVoiceJson.voiceId) ||
          finalVoiceId;
        logs.push(
          `Voz origen: voice_id=${finalVoiceId}, voice_name="${voiceName}". Buscando community voice en ElevenLabs con ese nombre...`,
        );

        const searchRes = await fetch(`${RETELL_BASE_URL}/search-community-voice`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKeyDestino}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            search_query: voiceName,
            voice_provider: 'elevenlabs',
          }),
        });
        const searchJson = await searchRes.json().catch(() => ({}));
        if (!searchRes.ok) {
          return jsonResponse(searchRes.status, {
            ok: false,
            step: 'search-community-voice',
            status: searchRes.status,
            error: searchJson.error || searchJson,
          });
        }

        const communityVoices = Array.isArray(searchJson)
          ? searchJson
          : searchJson.voices || searchJson.data || [];
        const cand = communityVoices[0];
        if (!cand || !cand.provider_voice_id) {
          return jsonResponse(400, {
            ok: false,
            step: 'search-community-voice',
            status: 400,
            error: {
              status: 'error',
              message:
                `No se encontró una community voice en ElevenLabs que coincida con el nombre "${voiceName}". ` +
                'Revisa manualmente en el dashboard de Retell/ElevenLabs qué voz quieres usar en la organización destino.',
            },
          });
        }

        logs.push(
          `Importando voz desde community voices (provider_voice_id=${cand.provider_voice_id}) en la organización destino...`,
        );

        const addBody = {
          provider_voice_id: cand.provider_voice_id,
          voice_name: cand.name || voiceName || `Imported from ${finalVoiceId}`,
          voice_provider: 'elevenlabs',
        };
        if (cand.public_user_id) addBody.public_user_id = cand.public_user_id;

        const addRes = await fetch(`${RETELL_BASE_URL}/add-community-voice`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKeyDestino}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(addBody),
        });
        const addJson = await addRes.json().catch(() => ({}));
        if (!addRes.ok) {
          return jsonResponse(addRes.status, {
            ok: false,
            step: 'add-community-voice',
            status: addRes.status,
            error: addJson.error || addJson,
          });
        }

        finalVoiceId = addJson.voice_id || finalVoiceId;
        logs.push(`Voz importada en destino con voice_id=${finalVoiceId}.`);
      } else {
        logs.push(`Voice_id ${finalVoiceId} ya existe en destino.`);
      }
    } else {
      logs.push(
        'El agente origen no tiene voice_id definido; se usará la configuración por defecto de Retell (si corresponde).',
      );
    }

    logs.push('Creando agente en la organización destino...');
    const { agent_id, version, last_modification_timestamp, is_published, ...agentRest } = agent;
    const agentReq = { ...agentRest };

    if (newLlmId && agentReq.response_engine && agentReq.response_engine.type === 'retell-llm') {
      agentReq.response_engine = {
        ...agentReq.response_engine,
        llm_id: newLlmId,
      };
    }

    if (finalVoiceId) {
      agentReq.voice_id = finalVoiceId;
    }

    for (const key of Object.keys(agentReq)) {
      const value = agentReq[key];
      if (value === null || value === undefined || value === '') {
        delete agentReq[key];
      }
    }

    const createAgentRes = await fetch(`${RETELL_BASE_URL}/create-agent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKeyDestino}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(agentReq),
    });
    const createAgentJson = await createAgentRes.json().catch(() => ({}));
    if (!createAgentRes.ok) {
      return jsonResponse(createAgentRes.status, {
        ok: false,
        step: 'create-agent',
        status: createAgentRes.status,
        error: createAgentJson.error || createAgentJson,
      });
    }

    const newAgentId = createAgentJson.agent_id || createAgentJson.id || null;
    logs.push(`Agente creado en destino con agent_id=${newAgentId || '(sin agent_id en respuesta)'}`);

    return jsonResponse(200, {
      ok: true,
      logs,
      originAgentId: agent.agent_id || agentId,
      newAgentId,
      sourceLlmId,
      newLlmId,
    });
  } catch (e) {
    return jsonResponse(500, {
      ok: false,
      error: e.message || 'Error interno del servidor',
    });
  }
};
