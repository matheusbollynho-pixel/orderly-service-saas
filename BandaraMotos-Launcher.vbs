'' Bandara Motos - Sistema de OS Launcher
'' Executável para abrir a aplicação no navegador

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' URL da aplicação
strURL = "https://os-bandara.vercel.app"

' Abrir URL no navegador padrão
objShell.Run "explorer """ & strURL & """", 1, FALSE

' Mostrar notificação
Set objWshShell = CreateObject("WScript.Shell")
objWshShell.Popup "Bandara Motos - Sistema de OS" & vbCrLf & vbCrLf & _
    "A aplicação está sendo aberta em seu navegador..." & vbCrLf & vbCrLf & _
    "Se não abrir automaticamente, acesse:" & vbCrLf & _
    strURL, 5, "Bandara Motos", 64

Set objShell = Nothing
Set objFSO = Nothing
