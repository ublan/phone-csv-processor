# Procesador de CSV — Teléfonos

Sistema en Node.js para validar, normalizar y generar números telefónicos a partir de un CSV.

## Estructura del CSV de entrada

```csv
phone number,name,email,,,region,pais
+573146816250,Carolina,email@mail.com,,,Latam,Colombia
+34600089523,AGUSTIN,email@gmail.com,,34600089523,España,España
```

Columnas usadas: `phone number` (0), `name` (1), `email` (2), `region` (5), `pais` (6).

---

## 1. Validación y filtrado

- Elimina filas vacías o mal formateadas
- Elimina números repetidos (E.164)
- Elimina números que:
  - No comienzan con `+`
  - Tienen caracteres no numéricos (excepto `+`)
  - Tienen longitud inválida según el país
- Comprueba que el prefijo internacional coincida con la columna `pais`

## 2. Normalización

Cada número se descompone en: `country_code`, `area_code`, `local_number`, `full_e164`.

Reglas por país: Argentina (+54), México (+52), España (+34), Colombia (+57), Chile (+56), Perú (+51), USA/Canadá (+1).

## 3. Salidas

| Archivo | Descripción |
|---------|-------------|
| `resumen_por_pais.csv` | Conteo por país (`pais,cantidad`) |
| `numeros_generados.csv` | Números aleatorios válidos por país (`pais,numero_generado`) |
| `datos_limpios.csv` | (Opcional) Datos validados y normalizados |

---

## Uso

### CLI

```bash
npm install
node cli.js <archivo.csv> [--output-dir=output] [--clean] [--verbose]
```

- `--output-dir`: carpeta de salida (por defecto: `output`)
- `--clean`: generar también `datos_limpios.csv`
- `--verbose`: mostrar números rechazados y motivo

Ejemplo con `ejemplo.csv`:

```bash
node cli.js ejemplo.csv --output-dir=output --clean
```

### API (Express) + frontend

```bash
npm run server
```

- **Frontend:** [http://localhost:3334](http://localhost:3334) — subir CSV y descargar resultados
- **API:** `POST /api/process` con `multipart/form-data`, campo `file` (CSV). Query `?clean=1` para incluir `datos_limpios.csv`
- **Descargas:** `GET /api/download/:id/resumen_por_pais.csv`, `numeros_generados.csv`, `datos_limpios.csv`

---

## Estructura del proyecto

```
phone-csv-processor/
├── src/
│   ├── config/countryRules.js   # Reglas por país
│   ├── parser/csvParser.js      # Lectura y parseo de CSV
│   ├── validator/validator.js   # Validación E.164 y coincidencia país
│   ├── normalizer/normalizer.js # country_code, area_code, local_number
│   ├── generator/numberGenerator.js # Números aleatorios por país
│   ├── exporter/csvExporter.js  # Escritura de CSV
│   └── index.js                 # Orquestador
├── public/index.html            # Frontend (subir CSV)
├── cli.js                       # CLI
├── server.js                    # API + estáticos
├── ejemplo.csv                  # CSV de ejemplo
└── package.json
```

---

## Países soportados

Argentina, México, España, Colombia, Chile, Perú, USA, Canadá. Para el resto se aplican longitudes 8–15 dígitos y validación de prefijo si está en la configuración.

---

## Integración con Retell AI

El sistema permite importar números telefónicos generados directamente a Retell AI.

### Configuración

1. **Obtener API Key de Retell AI**:
   - Crear cuenta en https://retellai.com
   - Generar un agente de prueba
   - Obtener la API Key desde el dashboard

2. **Configurar variables de entorno** (opcional):
   ```bash
   cp .env.example .env
   # Editar .env y agregar tu RETELL_AI_API_KEY
   ```

### Uso de la Integración

1. **Procesar CSV**: Sube y procesa tu archivo CSV como se describe arriba.

2. **Importar a Retell AI**:
   - Después de procesar, aparecerá el botón "Importar a Retell AI"
   - Completa el formulario con:
     - **API Key**: Tu API Key de Retell AI
     - **Termination URI**: URI del proveedor SIP (ej: `ia.conecta-bit.com`)
     - **Outbound Transport**: Protocolo (UDP, TCP, TLS)
     - **Outbound Agent ID**: ID del agente (ej: `agent_5c8cb6c7ba9eeff5857d7bdf1b`)
     - **SIP Trunk Username/Password**: (Opcional) Credenciales SIP
     - **Nickname**: (Opcional) Nombre descriptivo

3. **Progreso de Importación**:
   - El sistema importará cada número telefónico individualmente
   - Se mostrará el progreso en tiempo real
   - Al finalizar, se mostrará un resumen de éxitos y fallos

### Endpoints de API

#### Importar números (batch)
```
POST /api/retell/import
Content-Type: application/json

{
  "outputId": "uuid-del-procesamiento",
  "apiKey": "tu_api_key",
  "terminationUri": "ia.conecta-bit.com",
  "outboundAgentId": "agent_xxx",
  "outboundTransport": "UDP",
  "sipTrunkUsername": "opcional",
  "sipTrunkPassword": "opcional",
  "nickname": "opcional"
}
```

#### Importar un solo número
```
POST /api/retell/import-single
Content-Type: application/json

{
  "apiKey": "tu_api_key",
  "phoneNumber": "+573146816250",
  "terminationUri": "ia.conecta-bit.com",
  "outboundAgentId": "agent_xxx",
  "outboundTransport": "UDP"
}
```

#### Eliminar número
```
DELETE /api/retell/delete/:phoneNumberId
Content-Type: application/json

{
  "apiKey": "tu_api_key"
}
```

### Notas

- Todos los números deben estar en formato internacional con `+`
- El sistema valida el formato antes de importar
- Se implementa un pequeño delay entre peticiones para evitar rate limiting
- Los errores se reportan individualmente por número
