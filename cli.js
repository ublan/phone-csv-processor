#!/usr/bin/env node
/**
 * CLI: node cli.js <archivo.csv> [--output-dir=./output] [--clean]
 * --clean: además genera datos_limpios.csv
 */

import { processFromFile } from './src/index.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
const outputDir = args.find((a) => a.startsWith('--output-dir='))?.replace('--output-dir=', '') || 'output';
const exportClean = args.includes('--clean');
const verbose = args.includes('--verbose');

if (!input) {
  console.log(`
Uso: node cli.js <archivo.csv> [opciones]

Opciones:
  --output-dir=<ruta>   Carpeta de salida (default: output)
  --clean               Exportar también datos_limpios.csv
  --verbose             Mostrar detalle de números rechazados

Ejemplo:
  node cli.js contactos.csv --output-dir=./resultado --clean
`);
  process.exit(1);
}

const inputPath = resolve(process.cwd(), input);
const outDir = resolve(process.cwd(), outputDir);

processFromFile(inputPath, { outputDir: outDir, exportCleanCsv: exportClean })
  .then(({ resumen, valid, errors, outputFiles }) => {
    console.log('Procesamiento finalizado.\n');
    console.log('Resumen por país:');
    Object.entries(resumen).forEach(([pais, n]) => console.log(`  ${pais}: ${n}`));
    console.log(`\nTotal válidos: ${valid}`);
    if (errors.length) {
      console.log(`Rechazados: ${errors.length}`);
      if (verbose) errors.forEach((e) => console.log(`  - ${e.phone} (${e.pais}): ${e.error}`));
    }
    console.log('\nArchivos generados:');
    outputFiles.forEach((f) => console.log(`  ${f}`));
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
