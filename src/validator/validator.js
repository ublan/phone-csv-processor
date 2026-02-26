/**
 * Validador de números telefónicos.
 *
 * Objetivo:
 * - Replicar el comportamiento de phone-number-formatter (src/utils/csvUtils.ts + phoneUtils.ts),
 *   es decir: usar libphonenumber-js para aceptar cualquier CSV razonable y filtrar solo
 *   los números que la librería considera inválidos.
 *
 * Notas:
 * - El campo "pais" solo se conserva para contexto/exports, pero no se usa para bloquear números.
 */

import { getCountryRule, getCountryByCode, COUNTRY_ALIASES } from '../config/countryRules.js';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

/**
 * Extrae solo dígitos del número (sin +) para comparación E.164.
 * @param {string} raw
 * @returns {string}
 */
export function toE164Digits(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\D/g, '');
}

/**
 * Devuelve el número en formato E.164 limpio: +[dígitos].
 * @param {string} raw
 * @returns {string}
 */
export function toE164(raw) {
  const digits = toE164Digits(raw);
  if (!digits) return '';
  return digits.startsWith('+') ? raw.trim() : `+${digits}`;
}

/**
 * Versión permisiva basada en libphonenumber-js, similar a phone-number-formatter/src/utils/phoneUtils.ts
 * @param {string} phoneNumber
 * @param {string} defaultCountry - ISO 3166-1 alpha-2 (ej: 'ES')
 * @returns {string|null} - Número en E.164 o null si no es válido
 */
export function formatToE164Lib(phoneNumber, defaultCountry = 'ES') {
  try {
    if (!phoneNumber || typeof phoneNumber !== 'string') return null;

    let normalizedNumber = phoneNumber.trim().replace(/\s+/g, '');

    // Convertir 00XX... a +XX...
    if (normalizedNumber.startsWith('00')) {
      normalizedNumber = '+' + normalizedNumber.substring(2);
    }

    // Caso especial español: locales de 9 dígitos que empiezan por 6–9
    if (defaultCountry === 'ES' && /^[6-9]\d{8}$/.test(normalizedNumber)) {
      normalizedNumber = '+34' + normalizedNumber;
    }

    // Si son solo dígitos largos, intentar sin + y luego con +
    if (/^\d+$/.test(normalizedNumber) && normalizedNumber.length > 8) {
      try {
        if (isValidPhoneNumber(normalizedNumber, defaultCountry)) {
          const parsed = parsePhoneNumber(normalizedNumber, defaultCountry);
          return parsed.format('E.164');
        }
      } catch (_) {
        try {
          const withPlus = '+' + normalizedNumber;
          if (isValidPhoneNumber(withPlus)) {
            const parsed = parsePhoneNumber(withPlus);
            return parsed.format('E.164');
          }
        } catch (_) {
          return null;
        }
      }
    } else {
      // Ya tiene + o es un número local
      try {
        if (isValidPhoneNumber(normalizedNumber, defaultCountry)) {
          const parsed = parsePhoneNumber(normalizedNumber, defaultCountry);
          return parsed.format('E.164');
        }
      } catch (_) {
        return null;
      }
    }

    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Obtiene el código de país (sin +) desde un número E.164.
 * @param {string} e164 - ej: +54911... o +346...
 * @returns {{ dialCode: string, national: string }|null}
 */
export function splitE164(e164) {
  const digits = toE164Digits(e164);
  if (!digits) return null;

  // +1: 1 dígito; resto: 2-3 dígitos
  let dialCode = '';
  let national = '';

  if (digits.startsWith('1') && digits.length >= 11) {
    dialCode = '1';
    national = digits.slice(1);
  } else if (digits.length >= 10) {
    // Códigos de 2 dígitos (E.164): 20–99 excepto cuando forman inicio de 3 (ej. 211)
    const two = digits.slice(0, 2);
    // Códigos E.164 de 2 dígitos (evitando 21x, 22x, etc. que son 3)
    const twoCodes = ['20','27','30','31','32','33','34','36','39','40','41','43','44','45','46','47','48','49','51','52','53','54','55','56','57','58','60','61','62','63','64','65','66','81','82','86','90','91','92','93','94','95','98'];
    if (twoCodes.includes(two)) {
      dialCode = two;
      national = digits.slice(2);
    } else {
      dialCode = digits.slice(0, 3);
      national = digits.slice(3);
    }
  }

  if (!dialCode) return null;
  return { dialCode, national };
}

/**
 * Valida un número según las reglas del país.
 * @param {string} phone - Número tal como viene en CSV
 * @param {string} pais - País declarado
 * @returns {{ valid: boolean, e164?: string, error?: string }}
 */
export function validatePhoneForCountry(phone, pais) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Número vacío' };
  }

  // Siempre delegamos la validación "real" a libphonenumber-js,
  // igual que en phone-number-formatter.
  const formatted = formatToE164Lib(phone, 'ES');
  if (!formatted) {
    return { valid: false, error: 'Número inválido según libphonenumber-js' };
  }

  return { valid: true, e164: formatted };
}

/**
 * Filtra y valida un array de registros.
 * Elimina duplicados por E.164 y aplica validatePhoneForCountry.
 * @param {Array<{ phone: string, name: string, email: string, region: string, pais: string }>} records
 * @returns {Array<{ ...record, e164: string }>}
 */
export function validateRecords(records) {
  const out = [];
  const errors = [];

  for (const r of records) {
    try {
      const { valid, e164, error } = validatePhoneForCountry(r.phone, r.pais);
      if (!valid) {
        errors.push({ phone: r.phone, pais: r.pais, error });
        continue;
      }
      // A diferencia de la versión original, NO eliminamos duplicados aquí:
      // queremos el mismo comportamiento que phone-number-formatter,
      // donde cada fila válida del CSV se conserva aunque el número se repita.
      out.push({ ...r, e164 });
    } catch (e) {
      errors.push({ phone: r.phone, pais: r.pais, error: e.message });
    }
  }

  return { valid: out, errors };
}
