-- Tech Board Pro — OCR cache, board geometry e trace cache
-- Executar no Supabase SQL Editor ou via CLI de migrations

-- OCR cache dos PDFs processados
CREATE TABLE IF NOT EXISTS ocr_cache (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id   uuid REFERENCES devices(id),
  file_url    text,
  page_index  integer DEFAULT 0,
  raw_text    text,
  components  jsonb,
  processed_at timestamptz DEFAULT now(),
  ocr_version text DEFAULT '1.0',
  confidence  float
);

-- Geometria extraída do board
CREATE TABLE IF NOT EXISTS board_geometry (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id   uuid REFERENCES devices(id),
  component_name text,
  x           float,
  y           float,
  width       float,
  height      float,
  rotation    float DEFAULT 0,
  layer       text DEFAULT 'top',
  confidence  float,
  bbox        jsonb,
  source      text DEFAULT 'ocr',
  created_at  timestamptz DEFAULT now()
);

-- Cache de traces detectados
CREATE TABLE IF NOT EXISTS trace_cache (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id   uuid REFERENCES devices(id),
  from_component text,
  to_component   text,
  net_name       text,
  path_points    jsonb,
  confidence     float,
  created_at     timestamptz DEFAULT now()
);

-- Upsert components por device_id + name (usePCBExtractor)
CREATE UNIQUE INDEX IF NOT EXISTS components_device_id_name_key
  ON components (device_id, name);

-- Upsert ocr_cache por device_id + page_index
CREATE UNIQUE INDEX IF NOT EXISTS ocr_cache_device_id_page_index_key
  ON ocr_cache (device_id, page_index);
