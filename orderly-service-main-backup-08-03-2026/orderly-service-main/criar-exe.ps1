# Script para compilar o launcher para .exe
# Este script converte o batch em um executável profissional

# Criar um script PowerShell que será convertido
$psScript = @'
# Bandara Motos Launcher
$url = "https://os-bandara.vervet.app"

# Tentar abrir no navegador padrão
try {
    Start-Process $url
} catch {
    # Se falhar, mostrar mensagem
    [System.Windows.Forms.MessageBox]::Show("A aplicacao esta sendo aberta em seu navegador.`n`nURL: $url", "Bandara Motos", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
    Start-Process $url
}

# Mostrar notificação
Add-Type –AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show("Sistema de OS da Bandara Motos iniciando...`n`nAbra o navegador se nao abrir automaticamente!", "Bandara Motos", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
'@

# Salvar o script PowerShell
$psScript | Out-File -FilePath "$PSScriptRoot\launcher.ps1" -Encoding UTF8 -Force

Write-Host "Script criado: launcher.ps1"
Write-Host ""
Write-Host "Para criar um .exe, voce tem 3 opcoes:"
Write-Host ""
Write-Host "1. PS2EXE (Recomendado) - Download em: https://www.microsoft.com/en-us/download/details.aspx?id=102215"
Write-Host "   Comando: ps2exe -inputFile launcher.ps1 -outputFile BandaraMotos-Launcher.exe"
Write-Host ""
Write-Host "2. Usar o NSIS installer (ja criado em installer.nsi)"
Write-Host "   Download NSIS em: https://nsis.sourceforge.io/"
Write-Host "   Comando: makensis installer.nsi"
Write-Host ""
Write-Host "3. Usar este batch diretamente (Iniciar.bat)"
