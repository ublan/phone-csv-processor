/**
 * API HTTP para procesar CSV: POST /process con multipart (archivo CSV).
 * Devuelve JSON con resumen y enlaces para descargar resumen_por_pais.csv y numeros_generados.csv.
 * Opcional: ?clean=1 para incluir datos_limpios.
 */

import express from 'express';
import multer from 'multer';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import cors from 'cors';
import { processFromString } from './src/index.js';

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

const PORT = process.env.PORT || 3334;
app.listen(PORT, () => {
  console.log(`API: http://localhost:${PORT}`);
  console.log('POST /api/process (multipart "file") para procesar CSV.');
});
