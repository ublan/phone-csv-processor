/**
 * Utilidades para Batch Calling
 * - Agrupación de contactos por prefijo
 * - Parsing de CSV con variables personalizadas
 */

import { extractPrefix } from '../generator/numberGenerator.js';
import { COUNTRY_RULES, getCountryRule } from '../config/countryRules.js';
import { parseCsvString } from '../parser/csvParser.js';

/**
 * Extrae el código de país de un número E.164
 * @param {string} phoneNumber - Número en formato E.164 (ej: +573001234567)
 * @returns {string|null} - Código de país (ej: '57') o null si no se puede determinar
 */
export function extractCountryCode(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return null;
  }

  // Remover el + si existe
  const digits = phoneNumber.replace(/^\+/, '');

  // Intentar detectar código de país común
  // Códigos de 1 dígito: 1 (USA/Canadá)
  if (digits.startsWith('1') && digits.length >= 11) {
    return '1';
  }

  // Códigos de 2 dígitos comunes
  const twoDigitCodes = ['54', '52', '34', '57', '56', '51', '55', '33', '39', '44', '49', '86', '81', '82', '91'];
  for (const code of twoDigitCodes) {
    if (digits.startsWith(code)) {
      return code;
    }
  }

  // Códigos de 3 dígitos (menos comunes)
  if (digits.length >= 3) {
    const threeDigit = digits.slice(0, 3);
    // Algunos códigos de 3 dígitos conocidos
    if (['212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '247', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299'].includes(threeDigit)) {
      return threeDigit;
    }
  }

  // Fallback: tomar primeros 2 dígitos
  if (digits.length >= 2) {
    return digits.slice(0, 2);
  }

  return null;
}

/**
 * Extrae el prefijo completo de un número E.164 para agrupación
 * @param {string} phoneNumber - Número en formato E.164
 * @returns {string|null} - Prefijo (ej: '57300' para Colombia) o null
 */
export function extractPrefixForGrouping(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return null;
  }

  const countryCode = extractCountryCode(phoneNumber);
  if (!countryCode) {
    return null;
  }

  // Obtener regla del país si existe
  const countries = Object.keys(COUNTRY_RULES);
  let rule = null;
  for (const country of countries) {
    if (COUNTRY_RULES[country].code === countryCode) {
      rule = COUNTRY_RULES[country];
      break;
    }
  }

  return extractPrefix(phoneNumber, countryCode, rule);
}

/**
 * Encuentra el número telefónico generado que coincide con el prefijo de un contacto
 * @param {string} contactPhoneNumber - Número del contacto
 * @param {Array<{phone_number: string, nickname?: string}>} generatedNumbers - Números generados disponibles
 * @returns {Object|null} - Número generado que coincide o null
 */
export function findMatchingGeneratedNumber(contactPhoneNumber, generatedNumbers) {
  if (!contactPhoneNumber || !Array.isArray(generatedNumbers) || generatedNumbers.length === 0) {
    return null;
  }

  const contactPrefix = extractPrefixForGrouping(contactPhoneNumber);
  if (!contactPrefix) {
    return null;
  }

  // Normalizar número de contacto
  const normalizedContact = contactPhoneNumber.startsWith('+') ? contactPhoneNumber : `+${contactPhoneNumber}`;
  const contactCountryCode = extractCountryCode(normalizedContact);

  // Buscar número generado que tenga el mismo prefijo
  for (const genNum of generatedNumbers) {
    const genNumStr = genNum.phone_number || genNum.numero_generado || genNum;
    const normalizedGenNum = typeof genNumStr === 'string' && genNumStr.startsWith('+') ? genNumStr : `+${genNumStr}`;
    const genPrefix = extractPrefixForGrouping(normalizedGenNum);
    
    if (genPrefix === contactPrefix) {
      return {
        ...genNum,
        phone_number: normalizedGenNum,
      };
    }
  }

  // Si no hay coincidencia exacta de prefijo, buscar por código de país
  // y usar el primer número generado de ese país
  if (contactCountryCode) {
    for (const genNum of generatedNumbers) {
      const genNumStr = genNum.phone_number || genNum.numero_generado || genNum;
      const normalizedGenNum = typeof genNumStr === 'string' && genNumStr.startsWith('+') ? genNumStr : `+${genNumStr}`;
      const genCountryCode = extractCountryCode(normalizedGenNum);
      
      if (genCountryCode === contactCountryCode) {
        return {
          ...genNum,
          phone_number: normalizedGenNum,
        };
      }
    }
  }

  return null;
}

/**
 * Agrupa contactos por prefijo y asigna a números generados
 * @param {Array<{phone_number: string, [key: string]: any}>} contacts - Contactos del CSV
 * @param {Array<{phone_number: string, nickname?: string}>} generatedNumbers - Números generados disponibles
 * @returns {Array<{from_number: string, nickname?: string, contacts: Array}>} - Grupos de contactos por número generado
 */
export function groupContactsByPrefix(contacts, generatedNumbers) {
  const groups = new Map(); // Map<from_number, {from_number, nickname, contacts}>

  for (const contact of contacts) {
    const phoneNumber = contact.phone_number || contact.PhoneNumber || contact.phone;
    if (!phoneNumber) {
      continue;
    }

    // Normalizar número
    const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    // Buscar número generado que coincida
    const matchingGenNum = findMatchingGeneratedNumber(normalizedPhone, generatedNumbers);
    
    if (matchingGenNum) {
      const fromNumber = matchingGenNum.phone_number || matchingGenNum.numero_generado || matchingGenNum;
      const normalizedFromNumber = fromNumber.startsWith('+') ? fromNumber : `+${fromNumber}`;

      if (!groups.has(normalizedFromNumber)) {
        groups.set(normalizedFromNumber, {
          from_number: normalizedFromNumber,
          nickname: matchingGenNum.nickname || matchingGenNum.pais || null,
          contacts: [],
        });
      }

      groups.get(normalizedFromNumber).contacts.push({
        ...contact,
        phone_number: normalizedPhone,
      });
    }
  }

  return Array.from(groups.values());
}

/**
 * Parsea un CSV para batch calls, extrayendo phone_number y variables personalizadas
 * @param {string} csvContent - Contenido del CSV como string
 * @returns {Promise<{success: boolean, contacts?: Array, error?: string, preview?: Array}>}
 */
export async function parseBatchCallCSV(csvContent) {
  try {
    if (!csvContent || typeof csvContent !== 'string') {
      return { success: false, error: 'El contenido del CSV es requerido' };
    }

    // Parsear CSV
    const rows = parseCsvString(csvContent);
    if (rows.length === 0) {
      return { success: false, error: 'El CSV está vacío' };
    }

    // Primera fila es el header
    const header = rows[0].map(h => (h || '').trim());
    
    // Buscar columna de phone_number (case-insensitive)
    const phoneNumberIndex = header.findIndex(h => 
      /^phone[_\s]?number$/i.test(h) || 
      /^telefono$/i.test(h) || 
      /^tel$/i.test(h) ||
      /^phone$/i.test(h)
    );

    if (phoneNumberIndex === -1) {
      return { 
        success: false, 
        error: 'No se encontró la columna "phone_number" o "PhoneNumber" en el CSV. Asegúrate de que el CSV tenga una columna con el número telefónico.' 
      };
    }

    const contacts = [];
    const errors = [];

    // Procesar filas (empezar desde la segunda fila, índice 1)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const phoneNumber = (row[phoneNumberIndex] || '').trim();

      // Validar que tenga número telefónico
      if (!phoneNumber) {
        errors.push(`Fila ${i + 1}: número telefónico vacío`);
        continue;
      }

      // Normalizar número (agregar + si falta)
      const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      // Validar formato básico
      if (!/^\+\d{8,15}$/.test(normalizedPhone)) {
        errors.push(`Fila ${i + 1}: número telefónico inválido: ${phoneNumber}`);
        continue;
      }

      // Extraer variables personalizadas (todas las columnas excepto phone_number)
      const variables = {};
      for (let j = 0; j < header.length; j++) {
        if (j !== phoneNumberIndex) {
          const key = header[j].trim();
          if (key) {
            const value = (row[j] || '').trim();
            if (value) {
              variables[key] = value;
            }
          }
        }
      }

      contacts.push({
        phone_number: normalizedPhone,
        variables: Object.keys(variables).length > 0 ? variables : undefined,
        row_index: i + 1,
      });
    }

    if (contacts.length === 0) {
      return { 
        success: false, 
        error: 'No se encontraron contactos válidos en el CSV. Verifica que los números telefónicos estén en formato internacional (ej: +573001234567).',
        errors 
      };
    }

    // Preview de las primeras 5 filas
    const preview = contacts.slice(0, 5).map(c => ({
      phone_number: c.phone_number,
      variables: c.variables || {},
    }));

    return {
      success: true,
      contacts,
      preview,
      total: contacts.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Error al parsear el CSV',
    };
  }
}
