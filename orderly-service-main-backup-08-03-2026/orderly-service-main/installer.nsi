; Instalador Bandara Motos - Sistema de OS
; Script NSIS para Windows

!include "MUI2.nsh"
!include "x64.nsh"

; Configurações básicas
Name "Bandara Motos - Sistema de OS"
OutFile "BandaraMotos-Installer.exe"
InstallDir "$PROGRAMFILES\BandaraMotos"
InstallDirRegKey HKCU "Software\BandaraMotos" "InstallPath"

; Configurações de UI
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "PortugueseBR"

; Variáveis
Var StartMenuFolder

; Seção de instalação
Section "Instalar"
  SetOutPath "$INSTDIR"
  
  ; Criar arquivo launcher
  FileOpen $9 "$INSTDIR\Iniciar.vbs" w
  FileWrite $9 'Set objShell = CreateObject("WScript.Shell")$\r$\n'
  FileWrite $9 'objShell.Run "https://os-bandara.vercel.app", 1, FALSE$\r$\n'
  FileWrite $9 'Set objShell = Nothing$\r$\n'
  FileClose $9
  
  ; Criar batch para abrir URL
  FileOpen $9 "$INSTDIR\Abrir.bat" w
  FileWrite $9 '@echo off$\r$\n'
  FileWrite $9 'start "" https://os-bandara.vercel.app$\r$\n'
  FileClose $9
  
  ; Salvar informações de instalação no registro
  WriteRegStr HKCU "Software\BandaraMotos" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\BandaraMotos" "Version" "1.0"
  
  ; Criar desinstalador
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Criar entrada no registro para Adicionar/Remover Programas
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BandaraMotos" "DisplayName" "Bandara Motos - Sistema de OS"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BandaraMotos" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BandaraMotos" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BandaraMotos" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BandaraMotos" "Publisher" "Bandara Motos"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BandaraMotos" "DisplayVersion" "1.0"
  
  ; Menu Iniciar
  CreateDirectory "$SMPROGRAMS\Bandara Motos"
  CreateShortCut "$SMPROGRAMS\Bandara Motos\Sistema de OS.lnk" "$INSTDIR\Abrir.bat" "" "$INSTDIR\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\Bandara Motos\Desinstalar.lnk" "$INSTDIR\Uninstall.exe"
  
  ; Desktop
  CreateShortCut "$DESKTOP\Bandara Motos.lnk" "$INSTDIR\Abrir.bat" "" "$INSTDIR\icon.ico" 0
  
  ; Executar aplicação
  ExecShell "open" "https://os-bandara.vercel.app"
SectionEnd

; Seção de desinstalação
Section "Uninstall"
  ; Remover arquivos
  Delete "$INSTDIR\Iniciar.vbs"
  Delete "$INSTDIR\Abrir.bat"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  
  ; Remover atalhos
  Delete "$DESKTOP\Bandara Motos.lnk"
  Delete "$SMPROGRAMS\Bandara Motos\Sistema de OS.lnk"
  Delete "$SMPROGRAMS\Bandara Motos\Desinstalar.lnk"
  RMDir "$SMPROGRAMS\Bandara Motos"
  
  ; Remover do registro
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\BandaraMotos"
  DeleteRegKey HKCU "Software\BandaraMotos"
SectionEnd

Function .onInstSuccess
  MessageBox MB_OK "Bandara Motos instalado com sucesso!$\n$\nA aplicação será aberta agora no navegador."
FunctionEnd
