 import { randomUUID } from 'crypto';
 import { join } from 'path';
 import { mkdirSync, readFileSync, existsSync } from 'fs';
 import { processFromString } from '../../src/index.js';

 const TMP_OUTPUT_ROOT = '/tmp/phone-csv-output';

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
       event.headers['content-type'] || event.headers['Content-Type'] || '';

     if (!contentType.includes('application/json')) {
       return {
         statusCode: 400,
         headers: corsHeaders(),
         body: JSON.stringify({
           error:
             'Content-Type debe ser application/json. El frontend debe enviar { csvContent, clean }.',
         }),
       };
     }

     const body = JSON.parse(event.body || '{}');
     const csvContent = body.csvContent;
     const clean = !!body.clean;

     if (!csvContent || typeof csvContent !== 'string') {
       return {
         statusCode: 400,
         headers: corsHeaders(),
         body: JSON.stringify({
           error: 'csvContent es requerido y debe ser un string con el contenido del CSV.',
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

