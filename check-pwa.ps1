# Script para verificar se tudo está pronto para deploy

Write-Host "🔍 Verificando sistema de sincronização local..." -ForegroundColor Cyan
Write-Host ""

# 1. Verificar ícones PWA
Write-Host "📱 Verificando ícones PWA..." -ForegroundColor Yellow
$icon192 = Test-Path "public/icon-192.png"
$icon512 = Test-Path "public/icon-512.png"

if ($icon192 -and $icon512) {
    Write-Host "  ✅ Ícones encontrados" -ForegroundColor Green
} else {
    Write-Host "  ❌ Ícones faltando!" -ForegroundColor Red
    Write-Host "     Crie icon-192.png (192x192) e icon-512.png (512x512)" -ForegroundColor Yellow
    Write-Host "     Use: https://www.pwabuilder.com/imageGenerator" -ForegroundColor Yellow
}

# 2. Verificar arquivos PWA
Write-Host ""
Write-Host "📄 Verificando arquivos PWA..." -ForegroundColor Yellow
$sw = Test-Path "public/sw.js"
$manifest = Test-Path "public/manifest.json"
$offline = Test-Path "public/offline.html"

if ($sw -and $manifest -and $offline) {
    Write-Host "  ✅ Todos os arquivos PWA presentes" -ForegroundColor Green
} else {
    if (-not $sw) { Write-Host "  ❌ public/sw.js faltando" -ForegroundColor Red }
    if (-not $manifest) { Write-Host "  ❌ public/manifest.json faltando" -ForegroundColor Red }
    if (-not $offline) { Write-Host "  ❌ public/offline.html faltando" -ForegroundColor Red }
}

# 3. Verificar código de sincronização
Write-Host ""
Write-Host "🔧 Verificando código de sincronização..." -ForegroundColor Yellow
$localSync = Test-Path "src/lib/localSync.ts"
$useLocalSync = Test-Path "src/hooks/useLocalSync.ts"

if ($localSync -and $useLocalSync) {
    Write-Host "  ✅ Código de sincronização presente" -ForegroundColor Green
} else {
    if (-not $localSync) { Write-Host "  ❌ src/lib/localSync.ts faltando" -ForegroundColor Red }
    if (-not $useLocalSync) { Write-Host "  ❌ src/hooks/useLocalSync.ts faltando" -ForegroundColor Red }
}

# 4. Verificar se está integrado no App.tsx
Write-Host ""
Write-Host "🎯 Verificando integração no App.tsx..." -ForegroundColor Yellow
$appContent = Get-Content "src/App.tsx" -Raw
if ($appContent -match "useLocalSync") {
    Write-Host "  ✅ useLocalSync integrado no App.tsx" -ForegroundColor Green
} else {
    Write-Host "  ❌ useLocalSync NÃO está integrado no App.tsx" -ForegroundColor Red
}

# 5. Verificar index.html
Write-Host ""
Write-Host "📝 Verificando index.html..." -ForegroundColor Yellow
$indexContent = Get-Content "index.html" -Raw
$hasManifest = $indexContent -match 'manifest\.json'
$hasThemeColor = $indexContent -match 'theme-color.*#C1272D'

if ($hasManifest -and $hasThemeColor) {
    Write-Host "  ✅ index.html configurado corretamente" -ForegroundColor Green
} else {
    if (-not $hasManifest) { Write-Host "  ❌ manifest.json não referenciado" -ForegroundColor Red }
    if (-not $hasThemeColor) { Write-Host "  ❌ theme-color não configurado" -ForegroundColor Red }
}

# Resumo
Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "RESUMO" -ForegroundColor White -BackgroundColor Blue
Write-Host "========================================================" -ForegroundColor Cyan

$allGood = $icon192 -and $icon512 -and $sw -and $manifest -and $offline -and $localSync -and $useLocalSync -and ($appContent -match "useLocalSync") -and $hasManifest

if ($allGood) {
    Write-Host ""
    Write-Host "✅ TUDO PRONTO PARA DEPLOY!" -ForegroundColor Green -BackgroundColor Black
    Write-Host ""
    Write-Host "Próximos passos:" -ForegroundColor Yellow
    Write-Host "  1. npm run build" -ForegroundColor White
    Write-Host "  2. npm run preview (testar localmente)" -ForegroundColor White
    Write-Host "  3. git add . && git commit -m 'PWA sync local'" -ForegroundColor White
    Write-Host "  4. git push (deploy automático)" -ForegroundColor White
    Write-Host ""
    Write-Host "Quando estiver na loja:" -ForegroundColor Yellow
    Write-Host "  - Conectar PC e celular no MESMO WiFi" -ForegroundColor White
    Write-Host "  - Instalar app PWA no celular" -ForegroundColor White
    Write-Host "  - Testar sincronização" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "⚠️  AÇÃO NECESSÁRIA!" -ForegroundColor Yellow -BackgroundColor Black
    Write-Host ""
    
    if (-not ($icon192 -and $icon512)) {
        Write-Host "📱 CRIAR ÍCONES PWA:" -ForegroundColor Yellow
        Write-Host "   1. Acesse: https://www.pwabuilder.com/imageGenerator" -ForegroundColor White
        Write-Host "   2. Upload do logo da Bandara Motos" -ForegroundColor White
        Write-Host "   3. Download e salvar em public/" -ForegroundColor White
        Write-Host "      - icon-192.png (192x192)" -ForegroundColor White
        Write-Host "      - icon-512.png (512x512)" -ForegroundColor White
        Write-Host ""
    }
    
    Write-Host "Apos corrigir, execute este script novamente." -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
