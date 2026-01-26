/**
 * Exportador a archivos CSV.
 */

import { writeFileSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Escribe un CSV desde un array de objetos.
 * @param {string} filePath
 * @param {Object[]} rows
 * @param {string[]} headers - Orden de columnas
 */
export function writeCsv(filePath, rows, headers) {
  const dir = dirname(filePath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch (_) {}
  const headerLine = headers.map(escapeCsv).join(',');
  const dataLines = rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(','));
  const content = [headerLine, ...dataLines].join('\n');
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Exporta resumen pais -> cantidad a resumen_por_pais.csv
 * @param {string} filePath
 * @param {Object.<string, number>} countByCountry
 */
export function exportResumenPorPais(filePath, countByCountry) {
  const rows = Object.entries(countByCountry)
    .filter(([, c]) => c > 0)
    .map(([pais, cantidad]) => ({ pais, cantidad }));
  writeCsv(filePath, rows, ['pais', 'cantidad']);
}

/**
 * Exporta numeros generados: una fila por país con todos los números SIN "+" y separados por ", ".
 * Formato: pais,numeros_generados
 * Ejemplo: Colombia,"573232542078, 573141008359, 573113940785"
 * @param {string} filePath
 * @param {Array<{ pais: string, numero_generado: string }>} rows - lista de {pais, numero_generado} con formato E.164 (+57...)
 */
export function exportNumerosGenerados(filePath, rows) {
  const byCountry = {};
  for (const r of rows) {
    const pais = r.pais;
    let num = (r.numero_generado || r.numero || '').replace(/^\+/, '');
    if (!num) continue;
    if (!byCountry[pais]) byCountry[pais] = [];
    byCountry[pais].push(num);
  }
  const lines = ['pais,numeros_generados'];
  for (const [pais, nums] of Object.entries(byCountry)) {
    const numeros = nums.join(', ');
    const cell = /[",\r\n]/.test(numeros) ? `"${numeros.replace(/"/g, '""')}"` : numeros;
    lines.push(`${escapeCsv(pais)},${cell}`);
  }
  const dir = dirname(filePath);
  try { mkdirSync(dir, { recursive: true }); } catch (_) {}
  writeFileSync(filePath, lines.join('\n'), 'utf8');
}

/**
 * Exporta CSV limpio validado (opcional): todas las columnas normalizadas.
 * @param {string} filePath
 * @param {Array<{ phone, name, email, region, pais, e164, country_code, area_code, local_number, full_e164 }>} rows
 */
export function exportCsvLimpio(filePath, rows) {
  const headers = ['phone', 'name', 'email', 'region', 'pais', 'country_code', 'area_code', 'local_number', 'full_e164'];
  const filtered = rows.map((r) => {
    const o = {};
    headers.forEach((h) => { o[h] = r[h] ?? ''; });
    return o;
  });
  writeCsv(filePath, filtered, headers);
}

/**
 * Exporta números generados en formato compatible con Batch Calling.
 * Formato: una fila por número con columna phone_number (obligatoria para batch calling).
 * Opcionalmente incluye otras columnas como variables personalizadas.
 * @param {string} filePath
 * @param {Array<{ pais: string, numero_generado: string }>} rows - lista de {pais, numero_generado} con formato E.164 (+57...)
 * @param {boolean} includeCountry - Si true, incluye columna 'pais' como variable personalizada
 */
export function exportBatchCallFormat(filePath, rows, includeCountry = true) {
  const csvRows = [];
  
  for (const r of rows) {
    const numero = r.numero_generado || r.numero || '';
    if (!numero) continue;
    
    // Asegurar que el número tenga el formato E.164 con +
    const phoneNumber = numero.startsWith('+') ? numero : `+${numero}`;
    
    const row = {
      phone_number: phoneNumber,
    };
    
    // Si se incluye país, agregarlo como variable personalizada
    if (includeCountry && r.pais) {
      row.pais = r.pais;
    }
    
    csvRows.push(row);
  }
  
  const headers = includeCountry ? ['phone_number', 'pais'] : ['phone_number'];
  writeCsv(filePath, csvRows, headers);
}
