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
import { importPhoneNumber, deletePhoneNumber, importPhoneNumbersBatch, listPhoneNumbers } from './src/integrations/retellAI.js';

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
app.use(express.json());
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

app.post('/api/process', upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: 'Debe enviar un archivo CSV en el campo "file".' });
      return;
    }
    const csv = req.file.buffer.toString('utf8');
    const clean = String(req.query.clean || '').toLowerCase() === '1' || req.query.clean === 'true';
    const id = randomUUID();
    const outDir = join(OUTPUT_DIR, id);
    mkdirSync(outDir, { recursive: true });

    const result = processFromString(csv, { outputDir: outDir, exportCleanCsv: clean });

    res.json({
      outputId: id, // ID para usar en importación a Retell AI
      resumen: result.resumen,
      valid: result.valid,
      errors: result.errors,
      files: {
        resumen: `/api/download/${id}/resumen_por_pais.csv`,
        numeros: `/api/download/${id}/numeros_generados.csv`,
        ...(clean ? { datos_limpios: `/api/download/${id}/datos_limpios.csv` } : {}),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/download/:id/:name', (req, res) => {
  const { id, name } = req.params;
  const allowed = ['resumen_por_pais.csv', 'numeros_generados.csv', 'datos_limpios.csv'];
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

const PORT = process.env.PORT || 3334;
app.listen(PORT, () => {
  console.log(`API: http://localhost:${PORT}`);
  console.log('POST /api/process (multipart "file") para procesar CSV.');
});
