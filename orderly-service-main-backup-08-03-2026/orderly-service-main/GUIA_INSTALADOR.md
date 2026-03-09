# 📦 Instalador Bandara Motos - Sistema de OS

## ✅ Opções Disponíveis

### 1️⃣ **Launcher Rápido (RECOMENDADO)**
- **Arquivo**: `Iniciar.bat` ou `BandaraMotos-Launcher.vbs`
- **O que faz**: Clica → abre a aplicação no navegador
- **Tamanho**: 1KB
- **Como usar**: 
  - Duplo-clique em `Iniciar.bat` ou `BandaraMotos-Launcher.vbs`
  - A aplicação abre em https://os-bandara.vercel.app
  - Instale como PWA (clique no ícone de instalação no navegador)

### 2️⃣ **Instalador NSIS Profissional**
- **Arquivo**: `installer.nsi` (script) → compila em `.exe`
- **O que faz**: 
  - Instala a aplicação propriamente
  - Cria atalhos no Desktop e Menu Iniciar
  - Adiciona entrada em Adicionar/Remover Programas
  - Desinstala limpo
- **Tamanho**: ~2MB executável
- **Como compilar**:
  1. Baixe NSIS em: https://nsis.sourceforge.io/Download
  2. Instale o NSIS
  3. Clique direito em `installer.nsi` → "Compile NSIS Script"
  4. Pronto! Terá um `BandaraMotos-Installer.exe`

### 3️⃣ **Script PowerShell Compilado**
- **Arquivo**: `criar-exe.ps1`
- **O que faz**: Compila o PowerShell para .exe profissional
- **Como compilar**:
  1. Baixe PS2EXE: https://github.com/MScholtes/PS2EXE
  2. Execute: `ps2exe -inputFile launcher.ps1 -outputFile BandaraMotos-Launcher.exe`
  3. Pronto! Executável standalone

---

## 🚀 Recomendação para Loja

### **Para PC da Loja (Mais Prático)**
Use o `Iniciar.bat`:
- ✅ Funciona imediatamente
- ✅ Sem instalação necessária
- ✅ Pode colocar atalho no Desktop
- ✅ Abre direto na aplicação web

**Passos:**
1. Copie `Iniciar.bat` para a pasta desktop da loja
2. Renomeie para algo como "OS - Bandara Motos.bat"
3. Mude o ícone (clique direito → Propriedades → Alterar Ícone)
4. Pronto! Clique para abrir

### **Para Distribuição Profissional**
Use o `installer.nsi`:
- ✅ Parece profissional
- ✅ Gerencia desinstalação
- ✅ Atalhos automáticos
- ✅ Entrada no Painel de Controle

---

## 💡 Se Quiser Ícone Customizado

O ícone está em `public/icon-192.png`. Para usar como .ico:

```powershell
# Converter PNG para ICO (usando ImageMagick ou online tool)
# https://convertio.co/png-ico/
# Salve como: icon.ico
# Coloque na mesma pasta do launcher
```

Depois atualize os scripts para apontar ao .ico correto.

---

## 🔧 Troubleshooting

| Problema | Solução |
|----------|---------|
| Abre navegador mas app não carrega | Verifique internet em https://os-bandara.vercel.app |
| "Arquivo não reconhecido" | Clique com direito → "Abrir com" → Selecione cmd.exe ou PowerShell |
| Quer offline | Instale a PWA: abra em navegador → Menu (⋮) → Instalar |

---

## 📱 Para Celular na Loja

1. Acesse https://os-bandara.vercel.app no navegador do celular
2. Toque no menu (⋮)
3. Selecione "Adicionar à tela inicial"
4. Pronto! App local funcionando

---

## 🎯 Próximas Etapas

- [ ] Testar `Iniciar.bat` na máquina da loja
- [ ] Confirmar que abre https://os-bandara.vervet.app
- [ ] Instalar como PWA (ícone + menu no navegador)
- [ ] Testar sync com celular na mesma WiFi
- [ ] Se precisar de ícone customizado: converter PNG → ICO
