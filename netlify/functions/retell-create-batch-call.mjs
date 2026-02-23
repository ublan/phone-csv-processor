import { createBatchCall, listPhoneNumbers } from '../../src/integrations/retellAI.js';
import { parseBatchCallCSV, groupContactsByPrefix } from '../../src/batchCall/batchCallUtils.js';

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
      apiKey,
      csvContent,
      agent_id,
      batch_name,
      start_time,
      reserved_concurrency,
      generatedNumbers: generatedNumbersJson,
    } = body;

    if (!apiKey) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'API Key es requerida' }),
      };
    }
    if (!csvContent) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Debe proporcionar csvContent en el body' }),
      };
    }

    const parseResult = await parseBatchCallCSV(csvContent);
    if (!parseResult.success) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: parseResult.error, errors: parseResult.errors }),
      };
    }

    const contacts = parseResult.contacts;

    let generatedNumbers = [];
    if (generatedNumbersJson) {
      try {
        generatedNumbers = typeof generatedNumbersJson === 'string'
          ? JSON.parse(generatedNumbersJson)
          : generatedNumbersJson;
      } catch (e) {
        const listResult = await listPhoneNumbers({ apiKey });
        if (listResult.success) generatedNumbers = listResult.data || [];
      }
    } else {
      const listResult = await listPhoneNumbers({ apiKey });
      if (listResult.success) generatedNumbers = listResult.data || [];
    }

    if (generatedNumbers.length === 0) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No hay números telefónicos generados disponibles. Debes importar números primero.' }),
      };
    }

    const normalizedGeneratedNumbers = generatedNumbers.map((gn) => ({
      phone_number: gn.phone_number || gn.numero_generado || gn,
      nickname: gn.nickname || gn.pais || null,
    }));

    const groups = groupContactsByPrefix(contacts, normalizedGeneratedNumbers);
    if (groups.length === 0) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'No se encontraron números generados que coincidan con los prefijos de los contactos del CSV.',
        }),
      };
    }

    const results = [];
    const errors = [];

    for (const group of groups) {
      try {
        const tasks = group.contacts.map((contact) => {
          const task = {
            phone_number: contact.phone_number,
            variables: contact.variables,
          };
          if (agent_id) task.override_agent_id = agent_id;
          return task;
        });

        let batchName = batch_name;
        if (!batchName && group.nickname) batchName = `Batch - ${group.nickname}`;
        else if (!batchName) batchName = `Batch - ${group.from_number}`;

        let triggerTimestamp;
        if (start_time) {
          const date = new Date(start_time);
          if (!isNaN(date.getTime())) triggerTimestamp = date.getTime();
        }

        const batchResult = await createBatchCall({
          apiKey,
          from_number: group.from_number,
          tasks,
          name: batchName,
          trigger_timestamp: triggerTimestamp,
          reserved_concurrency: reserved_concurrency ? parseInt(reserved_concurrency, 10) : undefined,
        });

        if (batchResult.success) {
          results.push({
            success: true,
            batch_call_id: batchResult.batch_call_id,
            from_number: group.from_number,
            nickname: group.nickname,
            total_calls: tasks.length,
            batch_name: batchName,
            data: batchResult.data,
          });
        } else {
          errors.push({
            from_number: group.from_number,
            nickname: group.nickname,
            error: batchResult.error || 'Error desconocido',
            statusCode: batchResult.statusCode,
            total_calls: tasks.length,
          });
        }
        await new Promise((r) => setTimeout(r, 200));
      } catch (error) {
        errors.push({
          from_number: group.from_number,
          nickname: group.nickname,
          error: error.message || 'Error desconocido',
        });
      }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        total_contacts: contacts.length,
        batches_created: results.length,
        batches_failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
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
