# ============================================================
# Tech Board Pro — Fase 1: Script de Limpeza
# Execute na pasta raiz do techboard-boardview:
#   cd "C:\Users\PC-ZTEC UNLOCK\techboard-boardview"
#   .\cleanup_fase1.ps1
# ============================================================

$root = Get-Location

Write-Host "`n=== TECH BOARD PRO — FASE 1: LIMPEZA ===" -ForegroundColor Cyan
Write-Host "Pasta: $root`n"

# ─── 1. Arquivos fix_* na raiz ────────────────────────────────
$fixFiles = @("fix", "fix_boardview", "fix_filter", "fix_interface", "fix_type_cast", "fix_typescript")

Write-Host "[ 1/4 ] Removendo arquivos fix_* da raiz..." -ForegroundColor Yellow
foreach ($f in $fixFiles) {
    $path = Join-Path $root $f
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  ✓ Deletado: $f" -ForegroundColor Green
    } else {
        Write-Host "  - Não encontrado (já deletado?): $f" -ForegroundColor DarkGray
    }
}

# ─── 2. Páginas mortas de schematics ──────────────────────────
Write-Host "`n[ 2/4 ] Removendo páginas duplicadas/mortas de schematics..." -ForegroundColor Yellow
$deadPages = @(
    "src\app\schematics\page_with_search.tsx",
    "src\app\schematics\[deviceId]\page_final.tsx"
)
foreach ($p in $deadPages) {
    $path = Join-Path $root $p
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "  ✓ Deletado: $p" -ForegroundColor Green
    } else {
        Write-Host "  - Não encontrado: $p" -ForegroundColor DarkGray
    }
}

# ─── 3. MiniMap duplicado ─────────────────────────────────────
Write-Host "`n[ 3/4 ] Removendo MiniMap duplicado..." -ForegroundColor Yellow
$dupMinimap = "src\components\minimap\MiniMap.tsx"
$path = Join-Path $root $dupMinimap
if (Test-Path $path) {
    Remove-Item $path -Force
    Write-Host "  ✓ Deletado: $dupMinimap" -ForegroundColor Green
    # Remove pasta se ficou vazia
    $folder = Join-Path $root "src\components\minimap"
    if ((Get-ChildItem $folder -Force).Count -eq 0) {
        Remove-Item $folder -Force
        Write-Host "  ✓ Pasta vazia removida: src\components\minimap" -ForegroundColor Green
    }
} else {
    Write-Host "  - Não encontrado: $dupMinimap" -ForegroundColor DarkGray
}

# ─── 4. Copia arquivos novos da Fase 1 ────────────────────────
Write-Host "`n[ 4/4 ] Instrução: copie os arquivos gerados para o projeto." -ForegroundColor Yellow
Write-Host @"

  Arquivos gerados pela Fase 1 (copiar manualmente):

  fase1\src\lib\constants.ts         → src\lib\constants.ts          (NOVO)
  fase1\src\lib\supabase.ts          → src\lib\supabase.ts           (SUBSTITUIR)
  fase1\src\app\layout.tsx           → src\app\layout.tsx            (SUBSTITUIR)
  fase1\src\hooks\useGlobalHotkeys.ts → src\hooks\useGlobalHotkeys.ts (SUBSTITUIR — bug corrigido)
  fase1\src\components\diagnostic\DiagnosticAI.tsx   → src\components\diagnostic\DiagnosticAI.tsx
  fase1\src\components\ui\ComponentSidebar.tsx       → src\components\ui\ComponentSidebar.tsx

"@ -ForegroundColor Gray

Write-Host "=== FASE 1 CONCLUÍDA ===" -ForegroundColor Cyan
Write-Host "Próximo: rode 'npm run dev' e verifique se tudo ainda funciona.`n"
