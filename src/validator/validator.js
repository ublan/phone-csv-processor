/**
 * Validador de números telefónicos en formato E.164.
 * - Elimina duplicados, formato inválido, longitud inválida, prefijo no coincidente con país.
 */

import { getCountryRule, getCountryByCode, COUNTRY_ALIASES } from '../config/countryRules.js';

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

  const trimmed = phone.trim();

  // Debe comenzar con +
  if (!trimmed.startsWith('+')) {
    return { valid: false, error: 'No comienza con +' };
  }

  // Solo + y dígitos
  const hasInvalid = /[^\d+]/.test(trimmed) || /\+.*\+/.test(trimmed);
  if (hasInvalid) {
    return { valid: false, error: 'Contiene caracteres no válidos' };
  }

  const digits = toE164Digits(trimmed);
  if (digits.length < 8) {
    return { valid: false, error: 'Muy corto' };
  }

  const e164 = `+${digits}`;
  const split = splitE164(e164);
  if (!split) {
    return { valid: false, error: 'No se pudo extraer código de país' };
  }

  const { dialCode, national } = split;
  const allowed = getCountryByCode(dialCode);
  if (!allowed) {
    return { valid: false, error: `Código +${dialCode} no reconocido` };
  }

  // Normalizar nombre de país para comparar
  const countryKey = COUNTRY_ALIASES[pais] || pais;
  const matches = Array.isArray(allowed)
    ? allowed.some((c) => (COUNTRY_ALIASES[c] || c) === countryKey || c === countryKey)
    : (COUNTRY_ALIASES[allowed] || allowed) === countryKey || allowed === countryKey;

  if (!matches) {
    return { valid: false, error: `Prefijo +${dialCode} no coincide con país: ${pais}` };
  }

  const rule = getCountryRule(pais) || getCountryRule(countryKey);
  const digitLen = digits.length; // E.164: solo dígitos (sin +)
  if (rule) {
    const min = rule.minE164Length ?? 8;
    const max = rule.maxE164Length ?? 15;
    if (digitLen < min || digitLen > max) {
      return { valid: false, error: `Longitud inválida para ${pais}: ${digitLen} dígitos (esperado ${min}-${max})` };
    }
  } else {
    if (digitLen < 8 || digitLen > 15) {
      return { valid: false, error: `Longitud inválida: ${digitLen} dígitos (8-15)` };
    }
  }

  return { valid: true, e164 };
}

/**
 * Filtra y valida un array de registros.
 * Elimina duplicados por E.164 y aplica validatePhoneForCountry.
 * @param {Array<{ phone: string, name: string, email: string, region: string, pais: string }>} records
 * @returns {Array<{ ...record, e164: string }>}
 */
export function validateRecords(records) {
  const seen = new Set();
  const out = [];
  const errors = [];

  for (const r of records) {
    try {
      const { valid, e164, error } = validatePhoneForCountry(r.phone, r.pais);
      if (!valid) {
        errors.push({ phone: r.phone, pais: r.pais, error });
        continue;
      }
      if (seen.has(e164)) continue;
      seen.add(e164);
      out.push({ ...r, e164 });
    } catch (e) {
      errors.push({ phone: r.phone, pais: r.pais, error: e.message });
    }
  }

  return { valid: out, errors };
}
