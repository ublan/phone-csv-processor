import { createBatchCall, listPhoneNumbers } from '../../src/integrations/retellAI.js';
import { parseBatchCallCSV, groupContactsByPrefix } from '../../src/batchCall/batchCallUtils.js';
import Busboy from 'busboy';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');

    const busboy = Busboy({ headers: { 'content-type': ct } });

    let apiKey = '';
    let csvContent = '';
    let agent_id = '';
    let batch_name = '';
    let start_time = '';
    let reserved_concurrency = '';
    let generatedNumbersJson = '';

    busboy.on('file', (name, file) => {
      if (name !== 'csvFile') {
        file.resume();
        return;
      }
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        csvContent = Buffer.concat(chunks).toString('utf8');
      });
    });

    busboy.on('field', (name, value) => {
      if (name === 'apiKey') apiKey = value;
      else if (name === 'csvContent') csvContent = value;
      else if (name === 'agent_id') agent_id = value;
      else if (name === 'batch_name') batch_name = value;
      else if (name === 'start_time') start_time = value;
      else if (name === 'reserved_concurrency') reserved_concurrency = value;
      else if (name === 'generatedNumbers') generatedNumbersJson = value;
    });

    busboy.on('finish', () => {
      resolve({
        apiKey,
        csvContent,
        agent_id,
        batch_name,
        start_time,
        reserved_concurrency,
        generatedNumbersJson,
      });
    });

    busboy.on('error', reject);
    busboy.end(bodyBuffer);
  });
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
    const contentType =
      (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();

    let apiKey = '';
    let csvContent = '';
    let agent_id = '';
    let batch_name = '';
    let start_time = '';
    let reserved_concurrency = '';
    let generatedNumbersJson = '';

    if (contentType.includes('application/json')) {
      const body = JSON.parse(event.body || '{}');
      apiKey = body.apiKey || '';
      csvContent = body.csvContent || '';
      agent_id = body.agent_id || '';
      batch_name = body.batch_name || '';
      start_time = body.start_time || '';
      reserved_concurrency = body.reserved_concurrency || '';
      generatedNumbersJson = body.generatedNumbers || '';
    } else if (contentType.includes('multipart/form-data')) {
      const parsed = await parseMultipart(event);
      apiKey = parsed.apiKey || '';
      csvContent = parsed.csvContent || '';
      agent_id = parsed.agent_id || '';
      batch_name = parsed.batch_name || '';
      start_time = parsed.start_time || '';
      reserved_concurrency = parsed.reserved_concurrency || '';
      generatedNumbersJson = parsed.generatedNumbersJson || '';
    } else {
      return {
        statusCode: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Content-Type debe ser application/json o multipart/form-data',
        }),
      };
    }

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
        body: JSON.stringify({ error: 'Debe proporcionar un CSV (csvContent o csvFile)' }),
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
