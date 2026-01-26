/**
 * Integración con Retell AI API
 * Documentación: https://docs.retellai.com/api-references
 */

/**
 * Importa un número telefónico a Retell AI
 * @param {Object} config
 * @param {string} config.apiKey - API Key de Retell AI
 * @param {string} config.phoneNumber - Número en formato internacional (ej: +573146816250)
 * @param {string} config.terminationUri - URI del proveedor SIP (ej: ia.conecta-bit.com)
 * @param {string} config.outboundAgentId - ID del agente (ej: agent_5c8cb6c7ba9eeff5857d7bdf1b)
 * @param {string} config.outboundTransport - Transport protocol: "TCP", "UDP", "TLS"
 * @param {string} [config.sipTrunkUsername] - Usuario SIP (opcional)
 * @param {string} [config.sipTrunkPassword] - Password SIP (opcional)
 * @param {string} [config.nickname] - Nombre descriptivo (opcional)
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function importPhoneNumber(config) {
  const {
    apiKey,
    phoneNumber,
    terminationUri,
    outboundAgentId,
    outboundTransport = 'UDP',
    sipTrunkUsername,
    sipTrunkPassword,
    nickname,
  } = config;

  if (!apiKey) {
    return { success: false, error: 'API Key es requerida' };
  }
  if (!phoneNumber) {
    return { success: false, error: 'Número telefónico es requerido' };
  }
  if (!terminationUri) {
    return { success: false, error: 'Termination URI es requerida' };
  }
  if (!outboundAgentId) {
    return { success: false, error: 'Outbound Agent ID es requerido' };
  }

  // Validar formato del número (debe empezar con +)
  if (!phoneNumber.startsWith('+')) {
    return { success: false, error: 'El número debe estar en formato internacional con +' };
  }

  // Validar outbound transport
  const validTransports = ['TCP', 'UDP', 'TLS'];
  if (!validTransports.includes(outboundTransport)) {
    return { success: false, error: `Outbound transport debe ser uno de: ${validTransports.join(', ')}` };
  }

  const payload = {
    phone_number: phoneNumber,
    termination_uri: terminationUri,
    outbound_agent_id: outboundAgentId,
    outbound_transport: outboundTransport,
  };

  // Agregar campos opcionales si están presentes
  if (sipTrunkUsername) {
    payload.sip_trunk_username = sipTrunkUsername;
  }
  if (sipTrunkPassword) {
    payload.sip_trunk_password = sipTrunkPassword;
  }
  if (nickname) {
    payload.nickname = nickname;
  }

  try {
    const response = await fetch('https://api.retellai.com/import-phone-number', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || data.message || `Error ${response.status}: ${response.statusText}`,
        statusCode: response.status,
      };
    }

    return {
      success: true,
      data: data,
      phoneNumberId: data.phone_number_id,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Error de conexión con Retell AI',
    };
  }
}

/**
 * Lista todos los números telefónicos de Retell AI
 * @param {Object} config
 * @param {string} config.apiKey - API Key de Retell AI
 * @returns {Promise<{success: boolean, data?: any[], error?: string}>}
 */
export async function listPhoneNumbers(config) {
  const { apiKey } = config;

  if (!apiKey) {
    return { success: false, error: 'API Key es requerida' };
  }

  try {
    const response = await fetch('https://api.retellai.com/list-phone-numbers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error?.message || errorData.message || `Error ${response.status}: ${response.statusText}`,
        statusCode: response.status,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: Array.isArray(data) ? data : [],
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Error de conexión con Retell AI',
    };
  }
}

/**
 * Elimina un número telefónico de Retell AI
 * @param {Object} config
 * @param {string} config.apiKey - API Key de Retell AI
 * @param {string} config.phoneNumberId - ID del número telefónico en Retell AI (puede ser el phone_number mismo)
 * @param {string} [config.phoneNumber] - Número telefónico como alternativa si no hay ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deletePhoneNumber(config) {
  const { apiKey, phoneNumberId, phoneNumber } = config;

  if (!apiKey) {
    return { success: false, error: 'API Key es requerida' };
  }
  
  // Si no hay phoneNumberId, usar el phoneNumber directamente
  const identifier = phoneNumberId || phoneNumber;
  
  if (!identifier) {
    return { success: false, error: 'Phone Number ID o Phone Number es requerido' };
  }

  try {
    const response = await fetch(`https://api.retellai.com/delete-phone-number/${identifier}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error?.message || errorData.message || `Error ${response.status}: ${response.statusText}`,
        statusCode: response.status,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Error de conexión con Retell AI',
    };
  }
}

/**
 * Genera un nickname incremental basado en un patrón
 * Ejemplos:
 * - "Brasil 1" -> "Brasil 2", "Brasil 3", etc.
 * - "Brasil 5" -> "Brasil 6", "Brasil 7", etc.
 * - "Brasil" -> "Brasil 1", "Brasil 2", etc.
 * @param {string} baseNickname - Nickname base (ej: "Brasil 1" o "Brasil")
 * @param {number} index - Índice del número (0-based, se sumará 1)
 * @returns {string} - Nickname con número incremental
 */
function generateIncrementalNickname(baseNickname, index) {
  if (!baseNickname || baseNickname.trim() === '') {
    return '';
  }

  const trimmed = baseNickname.trim();
  
  // Buscar si termina con un número (ej: "Brasil 1", "Brasil 5")
  const match = trimmed.match(/^(.+?)\s+(\d+)$/);
  
  if (match) {
    // Si tiene un número al final, extraer el prefijo y el número inicial
    const prefix = match[1];
    const startNumber = parseInt(match[2], 10);
    const newNumber = startNumber + index;
    return `${prefix} ${newNumber}`;
  } else {
    // Si no tiene número, agregar uno empezando desde 1
    return `${trimmed} ${index + 1}`;
  }
}

/**
 * Importa múltiples números telefónicos con progreso
 * @param {Object} config
 * @param {string} config.apiKey - API Key de Retell AI
 * @param {string[]} config.phoneNumbers - Array de números en formato internacional
 * @param {Object} config.importConfig - Configuración de importación (terminationUri, outboundAgentId, etc.)
 * @param {Function} [config.onProgress] - Callback para reportar progreso (current, total, result)
 * @returns {Promise<{success: number, failed: number, results: Array}>}
 */
export async function importPhoneNumbersBatch(config) {
  const { apiKey, phoneNumbers, importConfig, onProgress } = config;

  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return { success: 0, failed: 0, results: [] };
  }

  const results = [];
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < phoneNumbers.length; i++) {
    const phoneNumber = phoneNumbers[i];
    
    // Generar nickname incremental si se proporcionó uno
    const currentNickname = importConfig.nickname ? generateIncrementalNickname(importConfig.nickname, i) : undefined;
    
    const result = await importPhoneNumber({
      apiKey,
      phoneNumber,
      ...importConfig,
      nickname: currentNickname,
    });

    results.push({
      phoneNumber,
      ...result,
    });

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }

    // Reportar progreso si hay callback
    if (onProgress) {
      onProgress(i + 1, phoneNumbers.length, result);
    }

    // Pequeña pausa para evitar rate limiting (opcional)
    if (i < phoneNumbers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return {
    success: successCount,
    failed: failedCount,
    total: phoneNumbers.length,
    results,
  };
}

/**
 * Crea un batch call en Retell AI
 * Según documentación: https://docs.retellai.com/api-references/create-batch-call
 * @param {Object} config
 * @param {string} config.apiKey - API Key de Retell AI
 * @param {string} config.from_number - Número desde el cual se harán las llamadas (ej: +573001234567)
 * @param {Array<{to_number: string, retell_llm_dynamic_variables?: Object, override_agent_id?: string}>} config.tasks - Array de tareas (contactos a llamar)
 * @param {string} [config.name] - Nombre del batch (solo para referencia)
 * @param {number} [config.trigger_timestamp] - Unix timestamp en milisegundos para programar el batch (si se omite, se envía inmediatamente)
 * @param {number} [config.reserved_concurrency] - Concurrencia reservada para otras llamadas (no batch calls)
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function createBatchCall(config) {
  const {
    apiKey,
    from_number,
    tasks,
    name,
    trigger_timestamp,
    reserved_concurrency,
  } = config;

  if (!apiKey) {
    return { success: false, error: 'API Key es requerida' };
  }
  if (!from_number) {
    return { success: false, error: 'from_number es requerido' };
  }
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return { success: false, error: 'tasks es requerido y debe ser un array no vacío' };
  }

  // Transformar tasks: phone_number -> to_number, variables -> retell_llm_dynamic_variables
  const formattedTasks = tasks.map(task => {
    const formattedTask = {};
    
    // El campo debe ser to_number (no phone_number)
    if (task.phone_number) {
      let toNumber = task.phone_number;
      if (!toNumber.startsWith('+')) {
        toNumber = '+' + toNumber;
      }
      formattedTask.to_number = toNumber;
    } else if (task.to_number) {
      let toNumber = task.to_number;
      if (!toNumber.startsWith('+')) {
        toNumber = '+' + toNumber;
      }
      formattedTask.to_number = toNumber;
    } else {
      return null; // Task inválida
    }

    // Variables personalizadas van en retell_llm_dynamic_variables
    if (task.variables && Object.keys(task.variables).length > 0) {
      formattedTask.retell_llm_dynamic_variables = task.variables;
    } else if (task.retell_llm_dynamic_variables) {
      formattedTask.retell_llm_dynamic_variables = task.retell_llm_dynamic_variables;
    }

    // Override agent ID si se proporciona
    if (task.override_agent_id) {
      formattedTask.override_agent_id = task.override_agent_id;
    }

    return formattedTask;
  }).filter(task => task !== null);

  if (formattedTasks.length === 0) {
    return { success: false, error: 'No hay tasks válidas después del formateo' };
  }

  const payload = {
    from_number,
    tasks: formattedTasks,
  };

  // Agregar campos opcionales si están presentes
  if (name) {
    payload.name = name;
  }
  if (trigger_timestamp !== undefined) {
    payload.trigger_timestamp = trigger_timestamp;
  }
  if (reserved_concurrency !== undefined) {
    payload.reserved_concurrency = reserved_concurrency;
  }

  try {
    const response = await fetch('https://api.retellai.com/create-batch-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error?.message || `Error ${response.status}: ${response.statusText}`,
        statusCode: response.status,
        data: data, // Incluir respuesta completa para debugging
      };
    }

    return {
      success: true,
      data: data,
      batch_call_id: data.batch_call_id,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Error de conexión con Retell AI',
    };
  }
}

/**
 * Lista todos los batch calls de Retell AI
 * @param {Object} config
 * @param {string} config.apiKey - API Key de Retell AI
 * @returns {Promise<{success: boolean, data?: any[], error?: string}>}
 */
export async function listBatchCalls(config) {
  const { apiKey } = config;

  if (!apiKey) {
    return { success: false, error: 'API Key es requerida' };
  }

  try {
    const response = await fetch('https://api.retellai.com/list-batch-calls', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error?.message || errorData.message || `Error ${response.status}: ${response.statusText}`,
        statusCode: response.status,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data: Array.isArray(data) ? data : [],
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Error de conexión con Retell AI',
    };
  }
}
