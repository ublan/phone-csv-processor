/**
 * Generador de números telefónicos aleatorios válidos por país.
 * Formato E.164, sin repeticiones, estructura realista.
 */

import { COUNTRY_RULES, COUNTRY_ALIASES } from '../config/countryRules.js';

/**
 * Extrae el prefijo de un número E.164 para evitar duplicados de prefijo.
 * El prefijo incluye el código de país + código de área/prefijo completo del número nacional.
 * @param {string} e164 - Número en formato E.164 (ej: +34738337719)
 * @param {string} countryCode - Código de país (ej: '34')
 * @param {Object} rule - Regla del país (opcional, para códigos de área conocidos)
 * @returns {string} - Prefijo único (ej: '3473' para España, '5255' para México)
 */
export function extractPrefix(e164, countryCode, rule = null) {
  // Remover el + y obtener solo dígitos
  const digits = e164.replace(/^\+/, '');
  
  // Verificar que empiece con el código de país
  if (!digits.startsWith(countryCode)) {
    // Si no empieza con el código, intentar extraerlo de otra forma
    const withoutPlus = e164.replace(/^\+/, '');
    return `${countryCode}${withoutPlus.slice(countryCode.length).slice(0, 2)}`;
  }
  
  const withoutCountry = digits.slice(countryCode.length);
  
  // Determinar el prefijo según el país
  if (countryCode === '34') {
    // España: +34 + 9 dígitos (6,7,8,9 para móviles)
    // Prefijo = código país (34) + primeros 2 dígitos = 346x, 347x, 348x, 349x
    return `${countryCode}${withoutCountry.slice(0, 2)}`;
    
  } else if (countryCode === '57') {
    // Colombia: +57 + 3XX + 7 dígitos
    // Prefijo = código país (57) + prefijo 3XX = 57300, 57301, etc.
    return `${countryCode}${withoutCountry.slice(0, 3)}`;
    
  } else if (countryCode === '52') {
    // México: +52 + código área (2-3 dígitos) + resto
    // Prefijo = código país (52) + código área completo
    if (rule && rule.areaCodes && Array.isArray(rule.areaCodes)) {
      // Usar códigos de área conocidos para detectar la longitud
      for (const areaCode of rule.areaCodes) {
        if (withoutCountry.startsWith(areaCode)) {
          return `${countryCode}${areaCode}`;
        }
      }
    }
    // Fallback: detectar por patrones comunes
    if (withoutCountry.length >= 3) {
      const firstThree = withoutCountry.slice(0, 3);
      // Si los primeros 3 dígitos coinciden con un código de área conocido de 3 dígitos
      if (rule && rule.areaCodes && rule.areaCodes.includes(firstThree)) {
        return `${countryCode}${firstThree}`;
      }
      // Si los primeros 2 dígitos coinciden con un código de área conocido de 2 dígitos
      const firstTwo = withoutCountry.slice(0, 2);
      if (rule && rule.areaCodes && rule.areaCodes.includes(firstTwo)) {
        return `${countryCode}${firstTwo}`;
      }
    }
    // Por defecto, intentar con 2 dígitos primero
    if (withoutCountry.length >= 2) {
      return `${countryCode}${withoutCountry.slice(0, 2)}`;
    }
    return `${countryCode}${withoutCountry.slice(0, 1)}`;
    
  } else if (countryCode === '54') {
    // Argentina: +54 + 9 + código área (2-4 dígitos) + resto
    // Prefijo = código país (54) + 9 + código área completo
    if (withoutCountry.startsWith('9')) {
      const after9 = withoutCountry.slice(1);
      if (rule && rule.areaCodes && Array.isArray(rule.areaCodes)) {
        // Usar códigos de área conocidos para detectar la longitud exacta
        for (const areaCode of rule.areaCodes) {
          if (after9.startsWith(areaCode)) {
            return `${countryCode}9${areaCode}`;
          }
        }
      }
      // Fallback: detectar por longitud común
      if (after9.length >= 2) {
        const firstTwo = after9.slice(0, 2);
        // Si empieza con 11, es código de 2 dígitos
        if (firstTwo === '11') {
          return `${countryCode}9${firstTwo}`;
        }
        // Si empieza con 2xx, 3xx, probablemente es de 3 dígitos
        if (['22', '23', '24', '25', '26', '27', '28', '29', '34', '35', '38'].includes(firstTwo)) {
          return `${countryCode}9${after9.slice(0, 3)}`;
        }
        // Por defecto, tomamos 2 dígitos del área
        return `${countryCode}9${firstTwo}`;
      }
      return `${countryCode}9${after9.slice(0, 1)}`;
    }
    return `${countryCode}${withoutCountry.slice(0, 2)}`;
    
  } else if (countryCode === '56') {
    // Chile: +56 + 9 + 8 dígitos
    // Prefijo = código país (56) + 9 + primer dígito = 569x
    return `${countryCode}${withoutCountry.slice(0, 2)}`;
    
  } else if (countryCode === '51') {
    // Perú: +51 + 9 + 8 dígitos
    // Prefijo = código país (51) + 9 + primer dígito = 519x
    return `${countryCode}${withoutCountry.slice(0, 2)}`;
    
  } else if (countryCode === '1') {
    // USA/Canadá: +1 + NPA (3 dígitos) + 7 dígitos
    // Prefijo = código país (1) + NPA = 1xxx
    return `${countryCode}${withoutCountry.slice(0, 3)}`;
    
  } else {
    // Por defecto: código país + primeros 2 dígitos
    return `${countryCode}${withoutCountry.slice(0, 2)}`;
  }
}

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
 * @param {Set<string>} [excludePrefixes] - Prefijos ya usados para no repetir
 * @returns {string[]} E.164
 */
export function generateForCountry(pais, count, exclude = new Set(), excludePrefixes = new Set()) {
  const key = COUNTRY_ALIASES[pais] || pais;
  const rule = COUNTRY_RULES[key];
  const out = [];
  const used = new Set(exclude);
  const usedPrefixes = new Set(excludePrefixes);
  const maxTries = count * 100; // Aumentar intentos porque ahora hay más restricciones
  let tries = 0;

  while (out.length < count && tries < maxTries) {
    const num = generateOne(key, rule, pais);
    if (num) {
      const countryCode = rule?.code || '';
      const prefix = extractPrefix(num, countryCode, rule);
      
      // Verificar que el número completo no esté usado Y que el prefijo no esté usado
      if (!used.has(num) && !usedPrefixes.has(prefix)) {
        used.add(num);
        usedPrefixes.add(prefix);
        out.push(num);
      }
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
  const globalUsedPrefixes = new Set();

  for (const [pais, count] of Object.entries(countByCountry)) {
    if (count <= 0) continue;
    const key = COUNTRY_ALIASES[pais] || pais;
    const rule = COUNTRY_RULES[key];
    const countryCode = rule?.code || '';
    
    const nums = generateForCountry(pais, count, globalUsed, globalUsedPrefixes);
    for (const n of nums) {
      globalUsed.add(n);
      // Extraer y guardar el prefijo usado
      const prefix = extractPrefix(n, countryCode, rule);
      globalUsedPrefixes.add(prefix);
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
