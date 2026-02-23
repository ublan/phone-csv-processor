/**
 * Reglas de validación, normalización y generación por país.
 * Formato E.164: +[código país][número nacional sin ceros iniciales]
 */

export const COUNTRY_RULES = {
  Argentina: {
    code: '54',
    prefix: '+54',
    // Móvil: +54 9 XX XXXXXXX (9 para indicar móvil en formato internacional)
    // Nacional: 10 dígitos (código área 2-4 dígitos + número)
    mobilePrefix: '9', // Se inserta después del 54 para móviles
    areaCodeLengths: [2, 3, 4], // 11 (CABA), 221, 351, 341, etc.
    nationalLength: 10,
    // Longitud E.164 (solo dígitos): 54 + 9 + área + local = 13-15 dígitos
    minE164Length: 13, // 54 + 9 + 10 mínimo
    maxE164Length: 15,
    // Códigos de área conocidos (muestra para validar)
    areaCodes: ['11', '221', '223', '261', '299', '341', '351', '379', '381', '385', '387'],
  },
  Bolivia: {
    code: '591',
    prefix: '+591',
    // Generalmente 8 dígitos nacionales
    nationalLength: 8,
    minE164Length: 11, // 591 + 8
    maxE164Length: 11,
  },
  Brasil: {
    code: '55',
    prefix: '+55',
    // Números de 10–11 dígitos nacionales
    nationalLength: 10,
    minE164Length: 12, // 55 + 10
    maxE164Length: 13, // 55 + 11
  },
  Chile: {
    code: '56',
    prefix: '+56',
    // Móviles: 9 + 8 dígitos
    mobilePrefix: '9',
    nationalLength: 9, // 9 + 8 para móviles
    minE164Length: 11, // 56 + 9
    maxE164Length: 11,
  },
  Colombia: {
    code: '57',
    prefix: '+57',
    // Móviles: 3XX + 7 dígitos = 10 dígitos
    nationalLength: 10,
    minE164Length: 12, // 57 + 10
    maxE164Length: 12,
    mobilePrefix: '3', // 300, 301, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 350, 351, etc.
  },
  'Costa Rica': {
    code: '506',
    prefix: '+506',
    nationalLength: 8,
    minE164Length: 11, // 506 + 8
    maxE164Length: 11,
  },
  Ecuador: {
    code: '593',
    prefix: '+593',
    nationalLength: 9,
    minE164Length: 12, // 593 + 9
    maxE164Length: 12,
  },
  'El Salvador': {
    code: '503',
    prefix: '+503',
    nationalLength: 8,
    minE164Length: 11, // 503 + 8
    maxE164Length: 11,
  },
  Guatemala: {
    code: '502',
    prefix: '+502',
    nationalLength: 8,
    minE164Length: 11, // 502 + 8
    maxE164Length: 11,
  },
  Mexico: {
    code: '52',
    prefix: '+52',
    areaCodeLengths: [2, 3], // 55 (CDMX), 33 (Guadalajara), 222 (Puebla)
    nationalLength: 10,
    minE164Length: 12, // 52 + 10
    maxE164Length: 13,
    areaCodes: ['55', '33', '81', '222', '231', '234', '238', '241', '243', '244', '246', '248', '271', '294', '311', '312', '313', '314', '315', '316', '317', '318', '321', '322', '323', '324', '325', '326', '327', '328', '329', '331', '332', '333', '334', '341', '342', '343', '344', '345', '346', '347', '348', '349', '371', '372', '373', '411', '412', '413', '414', '415', '416', '417', '418', '421', '422', '423', '424', '425', '426', '427', '428', '429', '431', '432', '433', '434', '435', '436', '437', '438', '441', '442', '443', '444', '445', '446', '447', '448', '449', '451', '452', '453', '454', '455', '456', '457', '458', '461', '462', '463', '464', '465', '466', '467', '468', '469', '471', '472', '473', '474', '475', '476', '477', '478', '481', '482', '483', '484', '485', '486', '487', '488', '493', '494', '495', '496', '497', '498', '499', '531', '532', '533', '534', '535', '536', '537', '538', '539', '581', '582', '583', '584', '585', '586', '587', '588', '594', '595', '596', '612', '613', '614', '615', '616', '617', '618', '619', '621', '622', '623', '624', '625', '626', '627', '628', '629', '631', '632', '633', '634', '635', '636', '637', '638', '639', '641', '642', '643', '644', '645', '646', '647', '648', '649', '651', '652', '653', '654', '655', '656', '657', '658', '659', '664', '665', '666', '667', '668', '669', '671', '672', '673', '674', '675', '676', '677', '678', '679', '681', '682', '683', '684', '685', '686', '687', '688', '689', '691', '692', '693', '694', '695', '696', '697', '698', '699', '711', '712', '713', '714', '715', '716', '717', '718', '719', '721', '722', '723', '724', '725', '726', '727', '728', '729', '731', '732', '733', '734', '735', '736', '737', '738', '739', '741', '742', '743', '744', '745', '746', '747', '748', '749', '751', '752', '753', '754', '755', '756', '757', '758', '759', '761', '762', '763', '764', '765', '766', '767', '768', '769', '771', '772', '773', '774', '775', '776', '777', '778', '779', '781', '782', '783', '784', '785', '786', '787', '788', '789', '791', '792', '793', '794', '795', '796', '797', '798', '799', '811', '812', '813', '814', '815', '816', '817', '818', '819', '821', '822', '823', '824', '825', '826', '827', '828', '829', '831', '832', '833', '834', '835', '836', '837', '838', '839', '841', '842', '843', '844', '845', '846', '847', '848', '849', '851', '852', '853', '854', '855', '856', '857', '858', '859', '861', '862', '863', '864', '865', '866', '867', '868', '869', '871', '872', '873', '874', '875', '876', '877', '878', '879', '881', '882', '883', '884', '885', '886', '887', '888', '889', '891', '892', '893', '894', '895', '896', '897', '898', '899', '911', '912', '913', '914', '915', '916', '917', '918', '919', '921', '922', '923', '924', '925', '926', '927', '928', '929', '931', '932', '933', '934', '935', '936', '937', '938', '939', '941', '942', '943', '944', '945', '946', '947', '948', '949', '951', '952', '953', '954', '955', '956', '957', '958', '959', '961', '962', '963', '964', '965', '966', '967', '968', '969', '971', '972', '973', '974', '975', '976', '977', '978', '979', '981', '982', '983', '984', '985', '986', '987', '988', '989', '991', '992', '993', '994', '995', '996', '997', '998', '999'],
  },
  Panamá: {
    code: '507',
    prefix: '+507',
    nationalLength: 8,
    minE164Length: 11, // 507 + 8
    maxE164Length: 11,
  },
  Paraguay: {
    code: '595',
    prefix: '+595',
    nationalLength: 9,
    minE164Length: 12, // 595 + 9
    maxE164Length: 12,
  },
  Peru: {
    code: '51',
    prefix: '+51',
    // Móviles: 9 + 8 dígitos
    mobilePrefix: '9',
    nationalLength: 9,
    minE164Length: 11, // 51 + 9
    maxE164Length: 11,
  },
  'República Dominicana': {
    code: '1',
    prefix: '+1',
    areaCodeLength: 3,
    localLength: 7,
    nationalLength: 10,
    minE164Length: 11,
    maxE164Length: 11,
  },
  Uruguay: {
    code: '598',
    prefix: '+598',
    nationalLength: 8,
    minE164Length: 11, // 598 + 8
    maxE164Length: 11,
  },
  USA: {
    code: '1',
    prefix: '+1',
    areaCodeLength: 3,
    localLength: 7,
    nationalLength: 10,
    minE164Length: 11, // 1 + 10
    maxE164Length: 11,
  },
  Canada: {
    code: '1',
    prefix: '+1',
    areaCodeLength: 3,
    localLength: 7,
    nationalLength: 10,
    minE164Length: 11,
    maxE164Length: 11,
  },
};

// Mapeo de nombres de país (variantes) a clave de reglas
export const COUNTRY_ALIASES = {
  Argentina: 'Argentina',
  Bolivia: 'Bolivia',
  Brasil: 'Brasil',
  Brazil: 'Brasil',
  Chile: 'Chile',
  Colombia: 'Colombia',
  'Costa Rica': 'Costa Rica',
  Ecuador: 'Ecuador',
  'El Salvador': 'El Salvador',
  Guatemala: 'Guatemala',
  Mexico: 'Mexico',
  México: 'Mexico',
  Panamá: 'Panamá',
  Panama: 'Panamá',
  Paraguay: 'Paraguay',
  Peru: 'Peru',
  Perú: 'Peru',
  'República Dominicana': 'República Dominicana',
  Uruguay: 'Uruguay',
  USA: 'USA',
  'Estados Unidos': 'USA',
  'United States': 'USA',
  'USA / Canadá': 'USA',
  Canada: 'Canada',
  Canadá: 'Canada',
  no_detectado: 'no_detectado',
};

// Mapeo código E.164 (sin +) -> país para validar coincidencia
export const CODE_TO_COUNTRY = {
  '54': 'Argentina',
  '591': 'Bolivia',
  '55': 'Brasil',
  '56': 'Chile',
  '57': 'Colombia',
  '506': 'Costa Rica',
  '593': 'Ecuador',
  '503': 'El Salvador',
  '502': 'Guatemala',
  '52': 'Mexico',
  '507': 'Panamá',
  '595': 'Paraguay',
  '51': 'Peru',
  '598': 'Uruguay',
  '1': ['USA', 'Canada', 'República Dominicana'],
};

export function getCountryRule(countryName) {
  const normalized = COUNTRY_ALIASES[countryName] || countryName;
  return COUNTRY_RULES[normalized] || null;
}

export function getCountryByCode(dialCode) {
  const c = CODE_TO_COUNTRY[dialCode];
  if (Array.isArray(c)) return c; // +1 puede ser USA o Canada
  return c ? [c] : null;
}
