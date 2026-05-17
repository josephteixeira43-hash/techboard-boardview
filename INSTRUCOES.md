# 📐 Esquemas Elétricos — TechBoard Pro

Módulo de visualização de PDFs de esquemas elétricos com IA diagnóstico integrado.

---

## 📁 Arquivos Gerados

```
app/
├── schematics/
│   └── [deviceId]/
│       └── page.tsx              ← Página principal
└── api/
    └── schematics/
        └── ai/
            └── route.ts          ← API da IA (Groq)

components/
└── schematics/
    ├── SchematicViewer.tsx       ← Visualizador PDF com zoom
    ├── SchematicSidebar.tsx      ← Lista de PDFs + upload
    ├── SchematicAI.tsx           ← Chat IA diagnóstico
    └── SchematicsButton.tsx      ← Botão para o BoardView

supabase/
└── setup_schematics.sql          ← SQL para configurar o bucket
```

---

## 🚀 Passo a Passo de Instalação

### 1. Copiar arquivos para o projeto

```
C:\Users\PC-ZTEC UNLOCK\techboard-boardview\
├── src\app\schematics\[deviceId]\page.tsx
├── src\app\api\schematics\ai\route.ts
├── src\components\schematics\SchematicViewer.tsx
├── src\components\schematics\SchematicSidebar.tsx
├── src\components\schematics\SchematicAI.tsx
└── src\components\schematics\SchematicsButton.tsx
```

### 2. Configurar Supabase Storage

1. Acesse: https://supabase.com/dashboard → seu projeto
2. Vá em **SQL Editor**
3. Cole e execute o conteúdo de `supabase/setup_schematics.sql`
4. Confirme em **Storage** que o bucket `schematics` foi criado

### 3. Variáveis de ambiente (.env.local)

Confirme que você já tem (provavelmente já tem):
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
GROQ_API_KEY=gsk_xxx...
```

### 4. Upload dos PDFs do Samsung A12

**Opção A — Pela interface (recomendado):**
1. Acesse o BoardView do A12 na plataforma
2. Clique em **"Esquemas Elétricos"**
3. Na sidebar, clique em **"Adicionar PDF"**
4. Selecione os arquivos `Electrical_Part_List.pdf` e `Troubleshooting.pdf`

**Opção B — Direto no Supabase:**
1. Supabase Dashboard → Storage → schematics
2. Crie pasta com o UUID do device A12
3. Faça upload dos PDFs dentro da pasta

### 5. Adicionar botão no BoardView existente

No seu arquivo do BoardView (provavelmente `src/app/board/[deviceId]/page.tsx`):

```tsx
import SchematicsButton from "@/components/schematics/SchematicsButton";

// Dentro do JSX, no header ou toolbar do device:
<SchematicsButton deviceId={device.id} />
```

### 6. Testar localmente

```bash
cd "C:\Users\PC-ZTEC UNLOCK\techboard-boardview"
npm run dev
```

Acesse: `http://localhost:3000/schematics/{device-id-do-a12}`

### 7. Deploy na Vercel

```bash
git add .
git commit -m "feat: adiciona visualizador de esquemas elétricos com IA"
git push
```

A Vercel faz o deploy automático.

---

## ✨ Funcionalidades

| Feature | Implementado |
|---------|-------------|
| Visualizador PDF em tela cheia | ✅ |
| Zoom 25% — 300% com presets | ✅ |
| Navegação por página | ✅ |
| Upload de PDFs via Storage | ✅ |
| Categorização automática (Elétrico/Troubleshooting) | ✅ |
| IA diagnóstico com Groq (Llama 3) | ✅ |
| Quick prompts para técnicos | ✅ |
| Download do PDF | ✅ |
| Sidebar recolhível | ✅ |
| Delete de arquivos | ✅ |

---

## 🔧 Solução de Problemas

**PDF não carrega:**
- Verifique se a Policy de leitura pública foi criada no Supabase
- Confirme que o bucket `schematics` está como público

**IA não responde:**
- Verifique `GROQ_API_KEY` no `.env.local` e nas variáveis da Vercel
- Dashboard Vercel → Settings → Environment Variables

**Arquivos não aparecem na sidebar:**
- Confirme que o UUID do device bate com a pasta no Storage
- Ex: pasta `schematics/abc-123-def/` → device.id = `abc-123-def`
