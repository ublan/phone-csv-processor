/**
 * Orquestador: parse → validate → normalize → resumen → generate → export.
 */

import { parseCsvFile, parseCsvString, rowsToRecords } from './parser/csvParser.js';
import { validateRecords } from './validator/validator.js';
import { normalizeRecords } from './normalizer/normalizer.js';
import { generateFromCounts } from './generator/numberGenerator.js';
import {
  exportResumenPorPais,
  exportNumerosGenerados,
  exportCsvLimpio,
} from './exporter/csvExporter.js';
import { COUNTRY_ALIASES } from './config/countryRules.js';

/**
 * Agrupa registros por país y devuelve conteo. Usa nombre normalizado para la salida (Mexico, Argentina, etc.)
 * @param {Array<{ pais: string }>} records
 * @returns {Object.<string, number>}
 */
function countByCountry(records) {
  const map = {};
  for (const r of records) {
    const key = COUNTRY_ALIASES[r.pais] || r.pais;
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

/**
 * Procesa desde contenido CSV (string). Útil para API.
 * @param {string} csvContent
 * @param {Object} [options]
 * @param {string} [options.outputDir] - Carpeta para escribir resumen_por_pais.csv, numeros_generados.csv, (opcional) datos_limpios.csv
 * @param {boolean} [options.exportCleanCsv] - Si true, escribe datos_limpios.csv
 * @returns {{ resumen: Object.<string, number>, valid: number, errors: any[], outputFiles: string[] }}
 */
export function processFromString(csvContent, options = {}) {
  const outputDir = options.outputDir || '.';
  const exportCleanCsv = !!options.exportCleanCsv;

  const rows = parseCsvString(csvContent);
  const records = rowsToRecords(rows);
  const { valid: validList, errors } = validateRecords(records);
  const normalized = normalizeRecords(validList);
  const resumen = countByCountry(normalized);

  const outputFiles = [];

  const resumenPath = `${outputDir}/resumen_por_pais.csv`;
  exportResumenPorPais(resumenPath, resumen);
  outputFiles.push(resumenPath);

  const generated = generateFromCounts(resumen, new Set(normalized.map((r) => r.e164)));
  const numerosPath = `${outputDir}/numeros_generados.csv`;
  exportNumerosGenerados(numerosPath, generated);
  outputFiles.push(numerosPath);

  if (exportCleanCsv) {
    const cleanPath = `${outputDir}/datos_limpios.csv`;
    exportCsvLimpio(cleanPath, normalized);
    outputFiles.push(cleanPath);
  }

  return {
    resumen,
    valid: normalized.length,
    errors,
    outputFiles,
  };
}

/**
 * Procesa desde ruta de archivo.
 * @param {string} inputPath - Ruta al CSV de entrada
 * @param {Object} [options] - Igual que processFromString
 * @returns {Promise<{ resumen, valid, errors, outputFiles }>}
 */
export async function processFromFile(inputPath, options = {}) {
  const outputDir = options.outputDir || '.';
  const exportCleanCsv = !!options.exportCleanCsv;

  let rows;
  try {
    rows = await parseCsvFile(inputPath);
  } catch (e) {
    throw new Error(`Error leyendo CSV: ${e.message}`);
  }

  const records = rowsToRecords(rows);
  const { valid: validList, errors } = validateRecords(records);
  const normalized = normalizeRecords(validList);
  const resumen = countByCountry(normalized);

  const outputFiles = [];

  const resumenPath = `${outputDir}/resumen_por_pais.csv`;
  exportResumenPorPais(resumenPath, resumen);
  outputFiles.push(resumenPath);

  const generated = generateFromCounts(resumen, new Set(normalized.map((r) => r.e164)));
  const numerosPath = `${outputDir}/numeros_generados.csv`;
  exportNumerosGenerados(numerosPath, generated);
  outputFiles.push(numerosPath);

  if (exportCleanCsv) {
    const cleanPath = `${outputDir}/datos_limpios.csv`;
    exportCsvLimpio(cleanPath, normalized);
    outputFiles.push(cleanPath);
  }

  return {
    resumen,
    valid: normalized.length,
    errors,
    outputFiles,
  };
}
