/**
 * API HTTP para procesar CSV: POST /process con multipart (archivo CSV).
 * Devuelve JSON con resumen y enlaces para descargar resumen_por_pais.csv y numeros_generados.csv.
 * Opcional: ?clean=1 para incluir datos_limpios.
 */

import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import cors from 'cors';
import { processFromString } from './src/index.js';
import { importPhoneNumber, deletePhoneNumber, importPhoneNumbersBatch, listPhoneNumbers, createBatchCall, listBatchCalls } from './src/integrations/retellAI.js';
import { parseBatchCallCSV, groupContactsByPrefix } from './src/batchCall/batchCallUtils.js';

/**
 * Genera un nickname incremental basado en un patrón
 * Ejemplos:
 * - "Brasil 1" -> "Brasil 2", "Brasil 3", etc.
 * - "Brasil 5" -> "Brasil 6", "Brasil 7", etc.
 * - "Brasil" -> "Brasil 1", "Brasil 2", etc.
 * @param {string} baseNickname - Nickname base (ej: "Brasil 1" o "Brasil")
 * @param {number} index - Índice del número (0-based, se sumará 1)
 * @returns {string} - Nickname con número incremental
 */
function generateIncrementalNickname(baseNickname, index) {
  if (!baseNickname || baseNickname.trim() === '') {
    return '';
  }

  const trimmed = baseNickname.trim();
  
  // Buscar si termina con un número (ej: "Brasil 1", "Brasil 5")
  const match = trimmed.match(/^(.+?)\s+(\d+)$/);
  
  if (match) {
    // Si tiene un número al final, extraer el prefijo y el número inicial
    const prefix = match[1];
    const startNumber = parseInt(match[2], 10);
    const newNumber = startNumber + index;
    return `${prefix} ${newNumber}`;
  } else {
    // Si no tiene número, agregar uno empezando desde 1
    return `${trimmed} ${index + 1}`;
  }
}

const app = express();
app.use(cors());
// Aceptar JSON grandes (csvContent en el body) sin tirar PayloadTooLargeError
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(process.cwd(), 'public')));

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const OUTPUT_DIR = join(process.cwd(), 'output');

try {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
} catch (_) {}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.originalname || !/\.csv$/i.test(file.originalname)) {
      cb(new Error('Solo se aceptan archivos .csv'));
      return;
    }
    cb(null, true);
  },
});

// Acepta JSON ({ csvContent, clean }) o multipart (campo "file"). Devuelve files con { filename, content } para que el frontend funcione igual en local y Netlify.
app.post('/api/process', (req, res, next) => {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/json')) return next();
  upload.single('file')(req, res, next);
}, (req, res) => {
  try {
    let csvContent;
    let clean;
    if (req.is('application/json')) {
      csvContent = req.body?.csvContent ?? '';
      clean = !!req.body?.clean;
    } else {
      if (!req.file?.buffer) {
        res.status(400).json({ error: 'Debe enviar un archivo CSV en el campo "file".' });
        return;
      }
      csvContent = req.file.buffer.toString('utf8');
      clean = String(req.query.clean || '').toLowerCase() === '1' || req.query.clean === 'true';
    }
    if (!csvContent || typeof csvContent !== 'string') {
      res.status(400).json({ error: 'Debe enviar el CSV (csvContent en JSON o archivo en campo "file").' });
      return;
    }
    const id = randomUUID();
    const outDir = join(OUTPUT_DIR, id);
    mkdirSync(outDir, { recursive: true });
    const result = processFromString(csvContent, { outputDir: outDir, exportCleanCsv: clean });
    const buildFileInfo = (fileName) => {
      const p = join(outDir, fileName);
      if (!existsSync(p)) return null;
      return { filename: fileName, content: readFileSync(p, 'utf8') };
    };
    const files = {
      resumen: buildFileInfo('resumen_por_pais.csv'),
      numeros: buildFileInfo('numeros_generados.csv'),
      batch_calling: buildFileInfo('numeros_batch_calling.csv'),
    };
    if (clean) files.datos_limpios = buildFileInfo('datos_limpios.csv');
    res.json({
      outputId: id,
      resumen: result.resumen,
      valid: result.valid,
      errors: result.errors,
      files,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/download/:id/:name', (req, res) => {
  const { id, name } = req.params;
  const allowed = ['resumen_por_pais.csv', 'numeros_generados.csv', 'numeros_batch_calling.csv', 'datos_limpios.csv'];
  if (!allowed.includes(name)) {
    res.status(404).end();
    return;
  }
  const p = join(OUTPUT_DIR, id, name);
  if (!existsSync(p)) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(readFileSync(p, 'utf8'));
});

/**
 * Lee números telefónicos del CSV generado
 * @param {string} filePath - Ruta al archivo numeros_generados.csv
 * @returns {string[]} - Array de números en formato E.164 con +
 */
function readPhoneNumbersFromCSV(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());
  const numbers = [];
  
  // Saltar el header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parsear CSV: pais,"numero1, numero2, numero3"
    const match = line.match(/^[^,]+,"([^"]+)"/);
    if (match) {
      const numerosStr = match[1];
      // Separar por coma y espacio
      const numeros = numerosStr.split(', ').map(n => n.trim()).filter(n => n);
      // Agregar el + si no lo tiene
      numbers.push(...numeros.map(n => n.startsWith('+') ? n : `+${n}`));
    }
  }
  
  return numbers;
}

/**
 * Endpoint para importar números a Retell AI (con Server-Sent Events para progreso)
 * GET /api/retell/import-stream?outputId=...&apiKey=...&...
 */
/**
 * Endpoint para importar números directamente (POST con body)
 * POST /api/retell/import-direct
 */
app.post('/api/retell/import-direct', async (req, res) => {
  try {
    const {
      phoneNumbers,
      apiKey,
      terminationUri,
      outboundAgentId,
      outboundTransport = 'UDP',
      sipTrunkUsername,
      sipTrunkPassword,
      nickname,
    } = req.body;

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      res.status(400).json({ error: 'phoneNumbers es requerido y debe ser un array' });
      return;
    }
    if (!apiKey) {
      res.status(400).json({ error: 'API Key es requerida' });
      return;
    }
    if (!terminationUri) {
      res.status(400).json({ error: 'Termination URI es requerida' });
      return;
    }
    if (!outboundAgentId) {
      res.status(400).json({ error: 'Outbound Agent ID es requerido' });
      return;
    }

    // Configurar Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (type, data) => {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendEvent('start', { total: phoneNumbers.length });

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
        
        // Generar nickname incremental si se proporcionó uno
        const currentNickname = nickname ? generateIncrementalNickname(nickname, i) : undefined;
        
        const result = await importPhoneNumber({
          apiKey,
          phoneNumber,
          ...importConfig,
          nickname: currentNickname,
        });

        results.push({ phoneNumber, ...result });

        if (result.success) {
          imported++;
        } else {
          failed++;
        }

        sendEvent('progress', {
          current: i + 1,
          total: phoneNumbers.length,
          imported,
          failed,
          phoneNumber,
          success: result.success,
          error: result.error,
        });

        if (i < phoneNumbers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      sendEvent('complete', {
        imported,
        failed,
        total: phoneNumbers.length,
        results: results.slice(0, 100),
      });

      res.end();
    } catch (error) {
      sendEvent('error', { error: error.message });
      res.end();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/retell/import-stream', async (req, res) => {
  try {
    const {
      outputId,
      apiKey,
      terminationUri,
      outboundAgentId,
      outboundTransport = 'UDP',
      sipTrunkUsername,
      sipTrunkPassword,
      nickname,
    } = req.query;

    if (!outputId) {
      res.status(400).json({ error: 'outputId es requerido' });
      return;
    }
    if (!apiKey) {
      res.status(400).json({ error: 'API Key es requerida' });
      return;
    }
    if (!terminationUri) {
      res.status(400).json({ error: 'Termination URI es requerida' });
      return;
    }
    if (!outboundAgentId) {
      res.status(400).json({ error: 'Outbound Agent ID es requerido' });
      return;
    }

    // Leer números del CSV generado
    const numerosPath = join(OUTPUT_DIR, outputId, 'numeros_generados.csv');
    const phoneNumbers = readPhoneNumbersFromCSV(numerosPath);

    if (phoneNumbers.length === 0) {
      res.status(400).json({ error: 'No se encontraron números para importar' });
      return;
    }

    // Configuración de importación
    const importConfig = {
      terminationUri,
      outboundAgentId,
      outboundTransport,
      sipTrunkUsername,
      sipTrunkPassword,
      nickname,
    };

    // Importar en batch con progreso en tiempo real usando Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let imported = 0;
    let failed = 0;
    const results = [];

    // Función para enviar evento SSE
    const sendEvent = (type, data) => {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Enviar inicio
      sendEvent('start', { total: phoneNumbers.length });

      // Procesar números uno por uno
      for (let i = 0; i < phoneNumbers.length; i++) {
        const phoneNumber = phoneNumbers[i];
        
        // Generar nickname incremental si se proporcionó uno
        const currentNickname = nickname ? generateIncrementalNickname(nickname, i) : undefined;
        
        const result = await importPhoneNumber({
          apiKey,
          phoneNumber,
          ...importConfig,
          nickname: currentNickname,
        });

        results.push({ phoneNumber, ...result });

        if (result.success) {
          imported++;
        } else {
          failed++;
        }

        // Enviar progreso
        sendEvent('progress', {
          current: i + 1,
          total: phoneNumbers.length,
          imported,
          failed,
          phoneNumber,
          success: result.success,
          error: result.error,
        });

        // Pequeña pausa para evitar rate limiting
        if (i < phoneNumbers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Enviar resultado final
      sendEvent('complete', {
        imported,
        failed,
        total: phoneNumbers.length,
        results: results.slice(0, 100), // Limitar resultados a los primeros 100 para no sobrecargar
      });

      res.end();
    } catch (error) {
      sendEvent('error', { error: error.message });
      res.end();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Endpoint para importar números a Retell AI (versión original con JSON response)
 * POST /api/retell/import
 * Body: {
 *   outputId: string,  // ID del procesamiento (para leer numeros_generados.csv)
 *   apiKey: string,
 *   terminationUri: string,
 *   outboundAgentId: string,
 *   outboundTransport: 'TCP' | 'UDP' | 'TLS',
 *   sipTrunkUsername?: string,
 *   sipTrunkPassword?: string,
 *   nickname?: string
 * }
 */
app.post('/api/retell/import', async (req, res) => {
  try {
    const {
      outputId,
      apiKey,
      terminationUri,
      outboundAgentId,
      outboundTransport = 'UDP',
      sipTrunkUsername,
      sipTrunkPassword,
      nickname,
    } = req.body;

    if (!outputId) {
      res.status(400).json({ error: 'outputId es requerido' });
      return;
    }
    if (!apiKey) {
      res.status(400).json({ error: 'API Key es requerida' });
      return;
    }
    if (!terminationUri) {
      res.status(400).json({ error: 'Termination URI es requerida' });
      return;
    }
    if (!outboundAgentId) {
      res.status(400).json({ error: 'Outbound Agent ID es requerido' });
      return;
    }

    // Leer números del CSV generado
    const numerosPath = join(OUTPUT_DIR, outputId, 'numeros_generados.csv');
    const phoneNumbers = readPhoneNumbersFromCSV(numerosPath);

    if (phoneNumbers.length === 0) {
      res.status(400).json({ error: 'No se encontraron números para importar' });
      return;
    }

    // Configuración de importación
    const importConfig = {
      terminationUri,
      outboundAgentId,
      outboundTransport,
      sipTrunkUsername,
      sipTrunkPassword,
      nickname,
    };

    // Importar en batch
    const result = await importPhoneNumbersBatch({
      apiKey,
      phoneNumbers,
      importConfig,
    });

    res.json({
      success: true,
      imported: result.success,
      failed: result.failed,
      total: result.total,
      results: result.results,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Endpoint para importar un solo número a Retell AI
 * POST /api/retell/import-single
 */
app.post('/api/retell/import-single', async (req, res) => {
  try {
    const {
      apiKey,
      phoneNumber,
      terminationUri,
      outboundAgentId,
      outboundTransport = 'UDP',
      sipTrunkUsername,
      sipTrunkPassword,
      nickname,
    } = req.body;

    if (!apiKey || !phoneNumber || !terminationUri || !outboundAgentId) {
      res.status(400).json({ error: 'Campos requeridos: apiKey, phoneNumber, terminationUri, outboundAgentId' });
      return;
    }

    const result = await importPhoneNumber({
      apiKey,
      phoneNumber,
      terminationUri,
      outboundAgentId,
      outboundTransport,
      sipTrunkUsername,
      sipTrunkPassword,
      nickname,
    });

    if (result.success) {
      res.json({ success: true, data: result.data });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Endpoint para listar números de Retell AI
 * GET /api/retell/list?apiKey=...
 */
app.get('/api/retell/list', async (req, res) => {
  try {
    const { apiKey } = req.query;

    if (!apiKey) {
      res.status(400).json({ error: 'API Key es requerida' });
      return;
    }

    const result = await listPhoneNumbers({ apiKey });

    if (result.success) {
      res.json({ success: true, phoneNumbers: result.data || [] });
    } else {
      res.status(400).json({ success: false, error: result.error || 'Error desconocido' });
    }
  } catch (e) {
    console.error('Error en /api/retell/list:', e);
    res.status(500).json({ error: e.message || 'Error interno del servidor', stack: process.env.NODE_ENV === 'development' ? e.stack : undefined });
  }
});

/**
 * Endpoint para eliminar un número de Retell AI
 * DELETE /api/retell/delete/:phoneNumberId
 * Body: { apiKey: string, phoneNumber?: string }
 * Nota: phoneNumberId puede ser el ID o el número telefónico mismo
 */
app.delete('/api/retell/delete/:phoneNumberId', async (req, res) => {
  try {
    const { phoneNumberId } = req.params;
    const { apiKey, phoneNumber } = req.body;

    if (!apiKey) {
      res.status(400).json({ error: 'API Key es requerida en el body' });
      return;
    }

    const result = await deletePhoneNumber({ 
      apiKey, 
      phoneNumberId, 
      phoneNumber 
    });

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Endpoint para crear batch calls
 * POST /api/retell/create-batch-call
 * Body: {
 *   apiKey: string,
 *   csvContent: string (opcional, si se envía CSV directamente),
 *   csvFile: File (opcional, si se sube archivo),
 *   agent_id?: string (opcional, se usará como override_agent_id en cada task),
 *   batch_name?: string,
 *   start_time?: string (ISO 8601, se convertirá a trigger_timestamp),
 *   reserved_concurrency?: number (concurrencia reservada para otras llamadas),
 *   generatedNumbers?: Array<{phone_number: string, nickname?: string}> (números generados disponibles)
 * }
 * 
 * Nota: Según documentación de Retell AI (https://docs.retellai.com/api-references/create-batch-call):
 * - El agente se asocia al from_number cuando se importa el número a Retell AI
 * - Si se proporciona agent_id, se usará como override_agent_id en cada task
 * - start_time se convierte a trigger_timestamp (Unix timestamp en milisegundos)
 */
app.post('/api/retell/create-batch-call', upload.single('csvFile'), async (req, res) => {
  try {
    const {
      apiKey,
      csvContent,
      agent_id,
      batch_name,
      start_time,
      reserved_concurrency,
      generatedNumbers: generatedNumbersJson,
      from_number,
    } = req.body;

    if (!apiKey) {
      res.status(400).json({ error: 'API Key es requerida' });
      return;
    }
    // Nota: agent_id no es requerido en el batch call según la documentación
    // El agente se asocia al from_number cuando se importa el número a Retell AI
    // Si se proporciona agent_id, se usará como override_agent_id en cada task

    // Obtener contenido CSV
    let csv = csvContent;
    if (!csv && req.file && req.file.buffer) {
      csv = req.file.buffer.toString('utf8');
    }
    if (!csv) {
      res.status(400).json({ error: 'Debe proporcionar un CSV (csvContent o csvFile)' });
      return;
    }

    // Parsear CSV
    const parseResult = await parseBatchCallCSV(csv);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error, errors: parseResult.errors });
      return;
    }

    const contacts = parseResult.contacts;

    // Si el cliente envía from_number explícito, crear un solo batch con ese número
    if (from_number) {
      const normalizedFrom = from_number.startsWith('+') ? from_number : `+${from_number}`;

      const tasks = contacts.map(contact => {
        const task = {
          phone_number: contact.phone_number,
          variables: contact.variables,
        };
        if (agent_id) task.override_agent_id = agent_id;
        return task;
      });

      let batchName = batch_name || `Batch - ${normalizedFrom}`;

      let triggerTimestamp;
      if (start_time) {
        const date = new Date(start_time);
        if (!isNaN(date.getTime())) {
          triggerTimestamp = date.getTime();
        }
      }

      const batchResult = await createBatchCall({
        apiKey,
        from_number: normalizedFrom,
        tasks,
        name: batchName,
        trigger_timestamp: triggerTimestamp,
        reserved_concurrency: reserved_concurrency ? parseInt(reserved_concurrency, 10) : undefined,
      });

      if (!batchResult.success) {
        res.status(batchResult.statusCode || 400).json({
          success: false,
          error: batchResult.error || 'Error al crear el batch call',
          data: batchResult.data,
        });
        return;
      }

      res.json({
        success: true,
        total_contacts: contacts.length,
        batches_created: 1,
        batches_failed: 0,
        results: [{
          success: true,
          batch_call_id: batchResult.batch_call_id,
          from_number: normalizedFrom,
          nickname: null,
          total_calls: tasks.length,
          batch_name: batchName,
          data: batchResult.data,
        }],
      });
      return;
    }

    // Si no se envía from_number, usar lógica anterior agrupando por prefijo
    let generatedNumbers = [];
    if (generatedNumbersJson) {
      try {
        generatedNumbers = typeof generatedNumbersJson === 'string' 
          ? JSON.parse(generatedNumbersJson) 
          : generatedNumbersJson;
      } catch (e) {
        const listResult = await listPhoneNumbers({ apiKey });
        if (listResult.success) {
          generatedNumbers = listResult.data || [];
        }
      }
    } else {
      const listResult = await listPhoneNumbers({ apiKey });
      if (listResult.success) {
        generatedNumbers = listResult.data || [];
      }
    }

    if (generatedNumbers.length === 0) {
      res.status(400).json({ error: 'No hay números telefónicos generados disponibles. Debes importar números primero.' });
      return;
    }

    const normalizedGeneratedNumbers = generatedNumbers.map(gn => ({
      phone_number: gn.phone_number || gn.numero_generado || gn,
      nickname: gn.nickname || gn.pais || null,
    }));

    const groups = groupContactsByPrefix(contacts, normalizedGeneratedNumbers);

    if (groups.length === 0) {
      res.status(400).json({ 
        error: 'No se encontraron números generados que coincidan con los prefijos de los contactos del CSV. Verifica que los números generados tengan prefijos compatibles con los números del CSV.' 
      });
      return;
    }

    const results = [];
    const errors = [];

    for (const group of groups) {
      try {
        const tasks = group.contacts.map(contact => {
          const task = {
            phone_number: contact.phone_number,
            variables: contact.variables,
          };
          if (agent_id) task.override_agent_id = agent_id;
          return task;
        });

        let batchName = batch_name;
        if (!batchName && group.nickname) {
          batchName = `Batch - ${group.nickname}`;
        } else if (!batchName) {
          batchName = `Batch - ${group.from_number}`;
        }

        let triggerTimestamp = undefined;
        if (start_time) {
          const date = new Date(start_time);
          if (!isNaN(date.getTime())) {
            triggerTimestamp = date.getTime();
          }
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
            responseData: batchResult.data,
          });
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        errors.push({
          from_number: group.from_number,
          nickname: group.nickname,
          error: error.message || 'Error desconocido',
        });
      }
    }

    res.json({
      success: true,
      total_contacts: contacts.length,
      batches_created: results.length,
      batches_failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error interno del servidor' });
  }
});

/**
 * Endpoint para validar CSV de batch calls
 * POST /api/retell/validate-batch-csv
 * Body: { csvContent: string }
 */
app.post('/api/retell/validate-batch-csv', async (req, res) => {
  try {
    const { csvContent } = req.body;

    if (!csvContent) {
      res.status(400).json({ error: 'csvContent es requerido' });
      return;
    }

    const parseResult = await parseBatchCallCSV(csvContent);
    
    if (parseResult.success) {
      res.json({
        success: true,
        total: parseResult.total,
        preview: parseResult.preview,
        errors: parseResult.errors,
      });
    } else {
      res.status(400).json({
        success: false,
        error: parseResult.error,
        errors: parseResult.errors,
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error interno del servidor' });
  }
});

/**
 * Endpoint para listar batch calls
 * GET /api/retell/list-batch-calls?apiKey=...
 */
app.get('/api/retell/list-batch-calls', async (req, res) => {
  try {
    const { apiKey } = req.query;

    if (!apiKey) {
      res.status(400).json({ error: 'API Key es requerida' });
      return;
    }

    const result = await listBatchCalls({ apiKey });

    if (result.success) {
      res.json({ success: true, batchCalls: result.data || [] });
    } else {
      res.status(400).json({ success: false, error: result.error || 'Error desconocido' });
    }
  } catch (e) {
    console.error('Error en /api/retell/list-batch-calls:', e);
    res.status(500).json({ error: e.message || 'Error interno del servidor', stack: process.env.NODE_ENV === 'development' ? e.stack : undefined });
  }
});

const RETELL_BASE_URL = 'https://api.retellai.com';

/**
 * Listar agentes de la organización ORIGEN usando la API de Retell.
 * GET /api/retell/list-agents?apiKeyOrigen=...
 * Si no se envía apiKeyOrigen, usa RETELL_API_KEY_ORIGEN del backend.
 */
app.get('/api/retell/list-agents', async (req, res) => {
  try {
    const apiKeyOrigen = req.query.apiKeyOrigen || process.env.RETELL_API_KEY_ORIGEN;
    if (!apiKeyOrigen) {
      return res.status(400).json({
        ok: false,
        error: 'Falta API Key de origen. Envía apiKeyOrigen o configura RETELL_API_KEY_ORIGEN en el backend.',
      });
    }
    const url = `${RETELL_BASE_URL}/list-agents?limit=1000`;
    const apiRes = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKeyOrigen}`,
        Accept: 'application/json',
      },
    });
    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      return res.status(apiRes.status).json({
        ok: false,
        status: apiRes.status,
        error: data.error || data,
      });
    }
    const agents = Array.isArray(data) ? data : data.agents || data.data || [];
    res.json({ ok: true, agents });
  } catch (e) {
    console.error('Error en /api/retell/list-agents:', e);
    res.status(500).json({
      ok: false,
      error: e.message || 'Error interno del servidor',
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined,
    });
  }
});

/**
 * Microtool: migrar un agente completo de Retell AI entre organizaciones.
 * POST /api/retell/migrate-agent
 * Body opcional:
 *  - apiKeyOrigen
 *  - apiKeyDestino
 *  - agentId
 * Si no se envían, se usan las vars de entorno:
 *  - RETELL_API_KEY_ORIGEN
 *  - RETELL_API_KEY_DESTINO
 *  - AGENT_ID
 */
app.post('/api/retell/migrate-agent', async (req, res) => {
  try {
    const body = req.body || {};
    const apiKeyOrigen = body.apiKeyOrigen || process.env.RETELL_API_KEY_ORIGEN;
    const apiKeyDestino = body.apiKeyDestino || process.env.RETELL_API_KEY_DESTINO;
    const agentId = body.agentId || process.env.AGENT_ID;
    const logs = [];

    const missing = [];
    if (!apiKeyOrigen) missing.push('RETELL_API_KEY_ORIGEN');
    if (!apiKeyDestino) missing.push('RETELL_API_KEY_DESTINO');
    if (!agentId) missing.push('AGENT_ID');
    if (missing.length) {
      return res.status(400).json({
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
      return res.status(agentRes.status).json({
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
        return res.status(llmRes.status).json({
          ok: false,
          step: 'get-retell-llm',
          status: llmRes.status,
          error: llmJson.error || llmJson,
        });
      }

      // Construir body para create-retell-llm copiando casi todo,
      // pero sin campos de solo lectura como llm_id, version, timestamps, etc.
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
        return res.status(createLlmRes.status).json({
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
      // Comprobar si ya existe en la organización destino
      const listVoicesRes = await fetch(`${RETELL_BASE_URL}/list-voices`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKeyDestino}`,
          Accept: 'application/json',
        },
      });
      const listVoicesJson = await listVoicesRes.json().catch(() => ({}));
      if (!listVoicesRes.ok) {
        return res.status(listVoicesRes.status).json({
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
        // Intentar importar la misma voz desde community voices (ElevenLabs)
        // Paso 1: obtener el nombre de la voz en la organización origen
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
          return res.status(getVoiceRes.status).json({
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

        // Paso 2: buscar la community voice en ElevenLabs por nombre
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
          return res.status(searchRes.status).json({
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
          return res.status(400).json({
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
          return res.status(addRes.status).json({
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
    // Quitar campos de solo lectura del agente de origen
    const { agent_id, version, last_modification_timestamp, is_published, ...agentRest } = agent;
    const agentReq = { ...agentRest };

    // Reemplazar llm_id en el response_engine si creamos un nuevo LLM
    if (newLlmId && agentReq.response_engine && agentReq.response_engine.type === 'retell-llm') {
      agentReq.response_engine = {
        ...agentReq.response_engine,
        llm_id: newLlmId,
      };
    }

    // Usar el voice_id final (original o importado) si lo tenemos
    if (finalVoiceId) {
      agentReq.voice_id = finalVoiceId;
    }

    // Eliminar campos nulos/vacíos al nivel superior
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
      return res.status(createAgentRes.status).json({
        ok: false,
        step: 'create-agent',
        status: createAgentRes.status,
        error: createAgentJson.error || createAgentJson,
      });
    }

    const newAgentId = createAgentJson.agent_id || createAgentJson.id || null;
    logs.push(`Agente creado en destino con agent_id=${newAgentId || '(sin agent_id en respuesta)'}`);

    res.json({
      ok: true,
      logs,
      originAgentId: agent.agent_id || agentId,
      newAgentId,
      sourceLlmId,
      newLlmId,
    });
  } catch (e) {
    console.error('Error en /api/retell/migrate-agent:', e);
    res.status(500).json({
      ok: false,
      error: e.message || 'Error interno del servidor',
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined,
    });
  }
});

// Config pública para ProxyLink (usa la anon key de Supabase definida en .env)
app.get('/api/proxy/config', (req, res) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(404).json({ error: 'Supabase no está configurado en este proyecto.' });
  }
  // La anon key es pública por diseño, se puede exponer al frontend
  res.json({ supabaseUrl, supabaseAnonKey });
});

// Rutas amigables del frontend (SPA) para cada herramienta
const INDEX_HTML_PATH = join(process.cwd(), 'public', 'index.html');
const FRONTEND_ROUTES = [
  '/',
  '/procesar-csv',
  '/importar-retell',
  '/batch-calling',
  '/gestionar-numeros',
  '/comparar-listas',
  '/migrar-agente-retell',
  '/plantillas-whatsapp',
  '/proxy-link',
];

FRONTEND_ROUTES.forEach((route) => {
  app.get(route, (req, res) => {
    res.sendFile(INDEX_HTML_PATH);
  });
});

const PORT = process.env.PORT || 3334;
app.listen(PORT, () => {
  console.log(`API: http://localhost:${PORT}`);
  console.log('POST /api/process (multipart "file") para procesar CSV.');
});
