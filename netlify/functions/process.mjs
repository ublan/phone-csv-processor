 import { randomUUID } from 'crypto';
 import { join } from 'path';
 import { mkdirSync, readFileSync, existsSync } from 'fs';
 import { createRequire } from 'module';
 import { processFromString } from '../../src/index.js';

 const require = createRequire(import.meta.url);
 const Busboy = require('busboy');

 const TMP_OUTPUT_ROOT = '/tmp/phone-csv-output';

 /** Parsea multipart/form-data y devuelve { csvContent, clean }. */
 function parseMultipart(event) {
   return new Promise((resolve, reject) => {
     const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
     const bodyBuffer = event.isBase64Encoded
       ? Buffer.from(event.body || '', 'base64')
       : Buffer.from(event.body || '', 'utf8');

     const busboy = Busboy({ headers: { 'content-type': ct } });
     let csvContent = '';
     let clean = false;

     busboy.on('file', (name, file) => {
       if (name !== 'file') {
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
       if (name === 'clean') clean = value === '1' || value === 'true';
     });

     busboy.on('finish', () => resolve({ csvContent, clean }));
     busboy.on('error', reject);
     busboy.write(bodyBuffer);
     busboy.end();
   });
 }

 export const handler = async (event) => {
   if (event.httpMethod === 'OPTIONS') {
     return {
       statusCode: 204,
       headers: corsHeaders(),
     };
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

     let csvContent = '';
     let clean = false;

     if (contentType.includes('application/json')) {
       const body = JSON.parse(event.body || '{}');
       csvContent = body.csvContent || '';
       clean = !!body.clean;
     } else if (contentType.includes('multipart/form-data')) {
       const parsed = await parseMultipart(event);
       csvContent = parsed.csvContent;
       clean = parsed.clean;
       // Query string puede sobrescribir clean (?clean=1)
       const qs = event.queryStringParameters || {};
       if (qs.clean === '1' || qs.clean === 'true') clean = true;
     } else {
       return {
         statusCode: 400,
         headers: corsHeaders(),
         body: JSON.stringify({
           error: 'Content-Type debe ser application/json o multipart/form-data (campo "file").',
         }),
       };
     }

     if (!csvContent || typeof csvContent !== 'string') {
       return {
         statusCode: 400,
         headers: corsHeaders(),
         body: JSON.stringify({
           error: 'Debe enviar el CSV: en JSON como csvContent o en multipart como archivo en el campo "file".',
         }),
       };
     }

     const id = randomUUID();
     const outDir = join(TMP_OUTPUT_ROOT, id);

     mkdirSync(outDir, { recursive: true });

     const result = processFromString(csvContent, {
       outputDir: outDir,
       exportCleanCsv: clean,
     });

     const buildFileInfo = (fileName) => {
       const p = join(outDir, fileName);
       if (!existsSync(p)) return null;
       const content = readFileSync(p, 'utf8');
       return {
         filename: fileName,
         content,
       };
     };

     const files = {
       resumen: buildFileInfo('resumen_por_pais.csv'),
       numeros: buildFileInfo('numeros_generados.csv'),
       batch_calling: buildFileInfo('numeros_batch_calling.csv'),
     };

     if (clean) {
       files.datos_limpios = buildFileInfo('datos_limpios.csv');
     }

     return {
       statusCode: 200,
       headers: {
         ...corsHeaders(),
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         outputId: id,
         resumen: result.resumen,
         valid: result.valid,
         errors: result.errors,
         files,
       }),
     };
   } catch (err) {
     return {
       statusCode: 500,
       headers: corsHeaders(),
       body: JSON.stringify({
         error: err.message || 'Error interno en la función process',
       }),
     };
   }
 };

 function corsHeaders() {
   return {
     'Access-Control-Allow-Origin': '*',
     'Access-Control-Allow-Methods': 'POST, OPTIONS',
     'Access-Control-Allow-Headers': 'Content-Type',
   };
 }

