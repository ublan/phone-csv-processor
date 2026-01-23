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

- **Frontend:** [http://localhost:3333](http://localhost:3333) — subir CSV y descargar resultados
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
