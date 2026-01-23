/**
 * Parser de archivos CSV para extraer registros de teléfonos.
 * Espera: phone number, name, email, , , region, pais
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';

/**
 * Parsea un archivo CSV y devuelve un array de filas (arrays de celdas).
 * @param {string} filePath - Ruta al archivo CSV
 * @returns {Promise<string[][]>}
 */
export function parseCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    stream.on('error', (err) => {
      reject(err);
    });

    rl.on('line', (line) => {
      const parsed = parseCsvLine(line);
      if (parsed && parsed.length > 0) {
        rows.push(parsed);
      }
    });

    rl.on('close', () => {
      resolve(rows);
    });
  });
}

/**
 * Parsea el contenido CSV como string (útil para API que recibe el buffer).
 * @param {string} content - Contenido CSV en string
 * @returns {string[][]}
 */
export function parseCsvString(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  return lines.map((line) => parseCsvLine(line)).filter((row) => row && row.length > 0);
}

/**
 * Parsea una línea CSV respetando comillas.
 * @param {string} line
 * @returns {string[]|null}
 */
function parseCsvLine(line) {
  if (!line || typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed) return null;

  const result = [];
  let i = 0;
  while (i < trimmed.length) {
    if (trimmed[i] === '"') {
      let val = '';
      i++;
      while (i < trimmed.length) {
        if (trimmed[i] === '"') {
          if (trimmed[i + 1] === '"') {
            val += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          val += trimmed[i];
          i++;
        }
      }
      result.push(val.trim());
    } else {
      let val = '';
      while (i < trimmed.length && trimmed[i] !== ',') {
        val += trimmed[i];
        i++;
      }
      result.push(val.trim());
      if (i < trimmed.length) i++;
    }
  }
  return result;
}

/**
 * Convierte filas CSV en objetos con campos normalizados.
 * Columnas esperadas: 0=phone, 1=name, 2=email, 5=region, 6=pais
 * @param {string[][]} rows
 * @returns {Array<{ phone: string, name: string, email: string, region: string, pais: string }>}
 */
export function rowsToRecords(rows) {
  if (!rows || rows.length === 0) return [];

  const records = [];
  const header = rows[0];
  const isHeader = /phone|nombre|name|email|pais|country|region/i.test(String(header[0] || '') + String(header[1] || ''));

  const start = isHeader ? 1 : 0;

  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    // phone(0), name(1), email(2), (3), (4), region(5), pais(6)
    const phone = (row[0] || '').trim();
    const name = (row[1] || '').trim();
    const email = (row[2] || '').trim();
    const region = (row[5] || '').trim();
    const pais = (row[6] || '').trim();

    // Filas vacías o sin teléfono ni país
    if (!phone && !pais) continue;
    if (!phone) continue;

    records.push({ phone, name, email, region, pais });
  }

  return records;
}
