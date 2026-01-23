/**
 * Generador de números telefónicos aleatorios válidos por país.
 * Formato E.164, sin repeticiones, estructura realista.
 */

import { COUNTRY_RULES, COUNTRY_ALIASES } from '../config/countryRules.js';

/**
 * @param {number} min - inclusive
 * @param {number} max - inclusive
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Genera un dígito aleatorio 0-9
 */
function digit() {
  return randomInt(0, 9);
}

/**
 * Genera N dígitos aleatorios (como string), el primero no cero si noWantLeadingZero.
 */
function randomDigits(n, noLeadingZero = true) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const d = digit();
    if (i === 0 && noLeadingZero && d === 0) s += randomInt(1, 9);
    else s += d;
  }
  return s;
}

/**
 * Genera números aleatorios para un país.
 * @param {string} pais - Nombre del país (puede ser "México", "Mexico", etc.)
 * @param {number} count
 * @param {Set<string>} [exclude] - E.164 ya usados para no repetir
 * @returns {string[]} E.164
 */
export function generateForCountry(pais, count, exclude = new Set()) {
  const key = COUNTRY_ALIASES[pais] || pais;
  const rule = COUNTRY_RULES[key];
  const out = [];
  const used = new Set(exclude);
  const maxTries = count * 50;
  let tries = 0;

  while (out.length < count && tries < maxTries) {
    const num = generateOne(key, rule, pais);
    if (num && !used.has(num)) {
      used.add(num);
      out.push(num);
    }
    tries++;
  }

  return out;
}

function generateOne(key, rule, pais) {
  if (!rule) {
    return generateOther(key, pais);
  }

  switch (rule.code) {
    case '54': return generateArgentina(rule);
    case '52': return generateMexico(rule);
    case '34': return generateSpain(rule);
    case '57': return generateColombia(rule);
    case '56': return generateChile(rule);
    case '51': return generatePeru(rule);
    case '1': return generateNANP(rule, key);
    default: return generateOther(key, rule);
  }
}

// Argentina: +54 9 + código área (2-4) + 6-8 dígitos. Total nacional 10.
function generateArgentina(rule) {
  const areas = rule.areaCodes || ['11', '221', '341', '351', '261', '381', '223', '299'];
  const area = areas[randomInt(0, areas.length - 1)];
  const localLen = 10 - area.length;
  const local = randomDigits(localLen);
  return `+549${area}${local}`;
}

// México: +52 + área (2 o 3) + resto hasta 10 nacional
function generateMexico(rule) {
  const areas = rule.areaCodes || ['55', '33', '81', '222', '231', '311', '312', '321', '322', '331', '444', '614', '664', '686'];
  const area = areas[randomInt(0, areas.length - 1)];
  const localLen = 10 - area.length;
  const local = randomDigits(localLen);
  return `+52${area}${local}`;
}

// España: +34 + 9 dígitos (6,7,8,9 para móviles)
function generateSpain(rule) {
  const first = ['6', '7', '8', '9'][randomInt(0, 3)];
  const rest = randomDigits(8);
  return `+34${first}${rest}`;
}

// Colombia: +57 + 3XX + 7 dígitos. 3XX: 300-350, 310-319, 320-323, 350, 351, 316, 317, 318, 315, 314, 312, 313, 310, 311, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 320, 321, 322, 323, 350, 351, 316, 317, 318, 315, 314, 312, 313, 310, 311
function generateColombia(rule) {
  const prefixes = ['300', '301', '310', '311', '312', '313', '314', '315', '316', '317', '318', '319', '320', '321', '322', '323', '350', '351'];
  const pre = prefixes[randomInt(0, prefixes.length - 1)];
  const local = randomDigits(7);
  return `+57${pre}${local}`;
}

// Chile: +56 + 9 + 8 dígitos
function generateChile(rule) {
  const local = randomDigits(8);
  return `+569${local}`;
}

// Perú: +51 + 9 + 8 dígitos
function generatePeru(rule) {
  const local = randomDigits(8);
  return `+519${local}`;
}

// USA/Canada: +1 + 3 (NPA: 2-9, 0-9, 0-9; no 11x en segunda posición) + 7
function generateNANP(rule, key) {
  const npa1 = randomInt(2, 9);
  let npa2 = randomInt(0, 9);
  if (npa1 === 1 && npa2 === 1) npa2 = randomInt(0, 8);
  const npa3 = randomInt(0, 9);
  const npa = `${npa1}${npa2}${npa3}`;
  const local = randomDigits(7);
  return `+1${npa}${local}`;
}

// Otros: +[código] + 8-12 dígitos. Necesitamos el código; si no hay rule, no podemos. Devolver null o algo genérico.
function generateOther(key, rule) {
  const code = rule?.code;
  if (!code) return null;
  const len = randomInt(8, 12);
  const national = randomDigits(len);
  return `+${code}${national}`;
}

/**
 * Genera números para un mapa país -> cantidad.
 * @param {Object.<string, number>} countByCountry - { "Argentina": 14, "Mexico": 56, ... }
 * @param {Set<string>} [exclude] - E.164 a evitar
 * @returns {Array<{ pais: string, numero_generado: string }>}
 */
export function generateFromCounts(countByCountry, exclude = new Set()) {
  const all = [];
  const globalUsed = new Set(exclude);

  for (const [pais, count] of Object.entries(countByCountry)) {
    if (count <= 0) continue;
    const nums = generateForCountry(pais, count, globalUsed);
    for (const n of nums) {
      globalUsed.add(n);
      all.push({ pais: normalizeCountryName(pais), numero_generado: n });
    }
  }

  return all;
}

function normalizeCountryName(p) {
  const n = COUNTRY_ALIASES[p] || p;
  const names = { Mexico: 'Mexico', Argentina: 'Argentina', España: 'España', Colombia: 'Colombia', Chile: 'Chile', Peru: 'Peru', USA: 'USA', Canada: 'Canada' };
  return names[n] || n;
}
