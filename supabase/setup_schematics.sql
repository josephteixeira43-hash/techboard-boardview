-- ============================================================
-- TECHBOARD PRO — Supabase Setup para Esquemas Elétricos
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- 1. Criar bucket "schematics" no Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'schematics',
  'schematics',
  true,
  52428800, -- 50MB por arquivo
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: leitura pública
CREATE POLICY "Public read schematics"
ON storage.objects FOR SELECT
USING (bucket_id = 'schematics');

-- 3. Policy: upload autenticado (ajuste conforme sua auth)
CREATE POLICY "Authenticated upload schematics"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'schematics');

-- 4. Policy: delete autenticado
CREATE POLICY "Authenticated delete schematics"
ON storage.objects FOR DELETE
USING (bucket_id = 'schematics');

-- ============================================================
-- ESTRUTURA DE PASTAS NO STORAGE:
-- schematics/
--   └── {device_id}/
--         ├── Electrical_Part_List.pdf
--         └── Troubleshooting_Guide.pdf
--
-- Para o Samsung A12, o device_id é o UUID do device no Supabase
-- Exemplo:
--   schematics/a12-uuid-aqui/Electrical_Part_List.pdf
-- ============================================================

-- 5. (Opcional) Tabela de metadados extras para os esquemas
CREATE TABLE IF NOT EXISTS schematic_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- path no storage: {device_id}/{filename}
  type TEXT CHECK (type IN ('electrical_list', 'troubleshooting', 'schematic')),
  page_count INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index para busca por device
CREATE INDEX IF NOT EXISTS idx_schematic_files_device 
ON schematic_files(device_id);

-- RLS
ALTER TABLE schematic_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read schematic_files"
ON schematic_files FOR SELECT
USING (true);

CREATE POLICY "Authenticated insert schematic_files"
ON schematic_files FOR INSERT
WITH CHECK (true);

-- ============================================================
-- VERIFICAR BUCKET CRIADO:
-- SELECT * FROM storage.buckets WHERE id = 'schematics';
-- ============================================================
