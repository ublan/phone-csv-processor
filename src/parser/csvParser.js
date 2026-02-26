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
 *
 * Comportamiento:
 * - Si hay cabecera, intenta detectar columnas por nombre (muy permisivo):
 *   - Teléfono: phone, phone_number, phone number, telefono, tel, mobile, msisdn...
 *   - País: pais, country, country_code, country code...
 *   - Nombre: name, nombre, first_name...
 *   - Email: email, mail, e-mail...
 *   - Región: region, state, provincia...
 * - Si no hay cabecera, mantiene el mapeo histórico:
 *   0=phone, 1=name, 2=email, 5=region, 6=pais
 *
 * Reglas:
 * - Solo se descartan filas sin teléfono.
 * - El país puede ir vacío; la validación será más permisiva en ese caso.
 *
 * @param {string[][]} rows
 * @returns {Array<{ phone: string, name: string, email: string, region: string, pais: string }>}
 */
export function rowsToRecords(rows) {
  if (!rows || rows.length === 0) return [];

  const records = [];
  const header = rows[0] || [];
  const joinedHeader = (String(header[0] || '') + String(header[1] || '')).toLowerCase();

  // Heurística básica: si las primeras celdas contienen palabras típicas de header,
  // lo tratamos como cabecera.
  const looksLikeHeader = /phone|nombre|name|email|pais|country|region/i.test(joinedHeader);

  let phoneIdx = 0;
  let nameIdx = 1;
  let emailIdx = 2;
  let regionIdx = 5;
  let paisIdx = 6;

  if (looksLikeHeader) {
    const lower = header.map((h) => String(h || '').trim().toLowerCase());

    const findIndex = (predicates) =>
      lower.findIndex((h) => predicates.some((p) => p.test(h)));

    // Teléfono: muy permisivo con distintos nombres
    const phoneCandidates = [
      /^phone[\s_]*number$/,
      /^phone$/,
      /^tel$/,
      /^telefono$/,
      /^mobile$/,
      /^msisdn$/,
      /^number$/,
    ];
    const paisCandidates = [
      /^pais$/,
      /^país$/,
      /^country$/,
      /^country[\s_]*code$/,
      /^countrycode$/,
    ];
    const nameCandidates = [
      /^name$/,
      /^nombre$/,
      /^first[\s_]*name$/,
      /^last[\s_]*name$/,
      /^full[\s_]*name$/,
    ];
    const emailCandidates = [
      /^email$/,
      /^e[\s_]*mail$/,
      /^mail$/,
    ];
    const regionCandidates = [
      /^region$/,
      /^state$/,
      /^provincia$/,
      /^area$/,
    ];

    const detectedPhone = findIndex(phoneCandidates);
    if (detectedPhone !== -1) phoneIdx = detectedPhone;

    const detectedPais = findIndex(paisCandidates);
    if (detectedPais !== -1) paisIdx = detectedPais;

    const detectedName = findIndex(nameCandidates);
    if (detectedName !== -1) nameIdx = detectedName;

    const detectedEmail = findIndex(emailCandidates);
    if (detectedEmail !== -1) emailIdx = detectedEmail;

    const detectedRegion = findIndex(regionCandidates);
    if (detectedRegion !== -1) regionIdx = detectedRegion;
  }

  const start = looksLikeHeader ? 1 : 0;

  for (let i = start; i < rows.length; i++) {
    const row = rows[i] || [];
    const phone = (row[phoneIdx] || '').trim();
    const name = (row[nameIdx] || '').trim();
    const email = (row[emailIdx] || '').trim();
    const region = (row[regionIdx] || '').trim();
    const pais = (row[paisIdx] || '').trim();

    // Fila sin teléfono: no tiene sentido procesarla
    if (!phone) continue;

    records.push({ phone, name, email, region, pais });
  }

  return records;
}
