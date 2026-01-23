/**
 * Normalizador de números E.164 a country_code, area_code, local_number, full_e164.
 * Aplica reglas por país.
 */

import { splitE164, toE164Digits } from '../validator/validator.js';
import { getCountryRule, COUNTRY_ALIASES } from '../config/countryRules.js';

/**
 * @typedef {Object} NormalizedPhone
 * @property {string} country_code
 * @property {string} area_code
 * @property {string} local_number
 * @property {string} full_e164
 */

/**
 * Normaliza un número E.164 ya validado según las reglas del país.
 * @param {string} e164
 * @param {string} pais
 * @returns {NormalizedPhone}
 */
export function normalize(e164, pais) {
  const full_e164 = e164.startsWith('+') ? e164 : `+${e164}`;
  const split = splitE164(full_e164);
  if (!split) {
    return { country_code: '', area_code: '', local_number: full_e164.replace(/^\++/, ''), full_e164 };
  }

  const { dialCode, national } = split;
  const country_key = COUNTRY_ALIASES[pais] || pais;
  const rule = getCountryRule(pais) || getCountryRule(country_key);

  if (!rule) {
    return {
      country_code: dialCode,
      area_code: '',
      local_number: national,
      full_e164,
    };
  }

  switch (rule.code) {
    case '54': return normalizeArgentina(dialCode, national, full_e164);
    case '52': return normalizeMexico(dialCode, national, full_e164, rule);
    case '34': return normalizeSpain(dialCode, national, full_e164);
    case '57': return normalizeColombia(dialCode, national, full_e164);
    case '56': return normalizeChile(dialCode, national, full_e164);
    case '51': return normalizePeru(dialCode, national, full_e164);
    case '1': return normalizeNANP(dialCode, national, full_e164, rule);
    default:
      return { country_code: dialCode, area_code: '', local_number: national, full_e164 };
  }
}

// Argentina: +54 9 XX/XXX/XXXX + número. Si falta el 9 y parece móvil, se asume.
// Nacional 10 dígitos. E.164: 54 + (9) + área + local.
function normalizeArgentina(dialCode, national, full_e164) {
  let rest = national;
  // Si tiene 11 dígitos y empieza con 9, quitar el 9 (es el indicador móvil)
  if (rest.length === 11 && rest.startsWith('9')) {
    rest = rest.slice(1); // 10 dígitos: área + local
  } else if (rest.length === 10) {
    // Ya sin el 9
  } else {
    return { country_code: dialCode, area_code: '', local_number: national, full_e164 };
  }
  // Área: 2, 3 o 4 dígitos. Heurística: 2 (11), 3 (221, 341, 351...), 4 (2234, etc.)
  let area = '';
  let local = rest;
  if (rest.startsWith('11') && rest.length === 10) {
    area = '11';
    local = rest.slice(2);
  } else if (rest.length === 10) {
    for (const len of [4, 3, 2]) {
      if (rest.length > len) {
        const a = rest.slice(0, len);
        if (/^[2-9]\d+$/.test(a)) {
          area = a;
          local = rest.slice(len);
          break;
        }
      }
    }
  }
  return { country_code: dialCode, area_code: area, local_number: local, full_e164 };
}

// México: +52 + área (2 o 3) + número. Total nacional 10.
function normalizeMexico(dialCode, national, full_e164, rule) {
  if (national.length !== 10) {
    return { country_code: dialCode, area_code: '', local_number: national, full_e164 };
  }
  let area = '';
  let local = national;
  for (const len of [3, 2]) {
    const a = national.slice(0, len);
    if (rule.areaCodes && rule.areaCodes.includes(a)) {
      area = a;
      local = national.slice(len);
      break;
    }
  }
  if (!area) {
    area = national.slice(0, 2);
    local = national.slice(2);
  }
  return { country_code: dialCode, area_code: area, local_number: local, full_e164 };
}

// España: +34 + 9 dígitos. No separar área en móviles.
function normalizeSpain(dialCode, national, full_e164) {
  return {
    country_code: dialCode,
    area_code: '',
    local_number: national,
    full_e164,
  };
}

// Colombia: +57 + 3XX + 7 dígitos
function normalizeColombia(dialCode, national, full_e164) {
  if (national.length !== 10 || national[0] !== '3') {
    return { country_code: dialCode, area_code: '', local_number: national, full_e164 };
  }
  const area = national.slice(0, 3); // 300, 310, 311, ...
  const local = national.slice(3);
  return { country_code: dialCode, area_code: area, local_number: local, full_e164 };
}

// Chile: +56 + 9 + 8 dígitos
function normalizeChile(dialCode, national, full_e164) {
  if (national.length === 9 && national.startsWith('9')) {
    return { country_code: dialCode, area_code: '9', local_number: national.slice(1), full_e164 };
  }
  return { country_code: dialCode, area_code: national[0] === '9' ? '9' : '', local_number: national[0] === '9' ? national.slice(1) : national, full_e164 };
}

// Perú: +51 + 9 + 8 dígitos
function normalizePeru(dialCode, national, full_e164) {
  if (national.length === 9 && national.startsWith('9')) {
    return { country_code: dialCode, area_code: '9', local_number: national.slice(1), full_e164 };
  }
  return { country_code: dialCode, area_code: national[0] === '9' ? '9' : '', local_number: national[0] === '9' ? national.slice(1) : national, full_e164 };
}

// USA/Canadá: +1 + 3 (NPA) + 7
function normalizeNANP(dialCode, national, full_e164) {
  if (national.length !== 10) {
    return { country_code: dialCode, area_code: '', local_number: national, full_e164 };
  }
  return {
    country_code: dialCode,
    area_code: national.slice(0, 3),
    local_number: national.slice(3),
    full_e164,
  };
}

/**
 * Normaliza un array de registros validados (con e164 y pais).
 * @param {Array<{ e164: string, pais: string, [key: string]: any }>} records
 * @returns {Array<{ ...record, country_code: string, area_code: string, local_number: string, full_e164: string }>}
 */
export function normalizeRecords(records) {
  const out = [];
  for (const r of records) {
    try {
      const { country_code, area_code, local_number, full_e164 } = normalize(r.e164, r.pais);
      out.push({ ...r, country_code, area_code, local_number, full_e164 });
    } catch (e) {
      out.push({
        ...r,
        country_code: splitE164(r.e164)?.dialCode || '',
        area_code: '',
        local_number: r.e164.replace(/^\D*/, ''),
        full_e164: r.e164,
      });
    }
  }
  return out;
}
