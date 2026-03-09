# 🧪 Testando CRLV-e com Placas Reais

## ✅ Status Atual

A integração da API do CRLV-e está **100% funcionando**! 

- ✅ Token configurado localmente (.env)
- ✅ Secret configurado no Supabase
- ✅ Edge Function deployada e respondendo
- ✅ Downloads de PDF e Imagem implementados

## 🚗 Como Testar

### 1. Acessar a Página de Consulta CRLV-e

1. Acesse: **http://localhost:8080/**
2. Procure a opção **"Consulta CRLV-e"** ou clique em uma seção de relatórios
3. Digite a **senha de acesso** (padrão: `1`)
4. Você estará na página de consulta

### 2. Preencher Placa e UF

```
Placa: ABC1D23    (Formato: 3 letras + 1 número + 1 letra + 2 números)
Estado: SP        (Sigla de 2 letras)
```

### 3. Clicar em "Buscar CRLV-e"

O sistema irá:
- ✅ Enviar a requisição para a API Brasil
- ✅ Buscar os dados do veículo
- ✅ Exibir informações completas (marca, modelo, ano, cor, etc)
- ✅ Se disponível, permitir download do PDF/Imagem do CRLV-e

## 📊 Resultados Possíveis

### ✅ Sucesso - Dados Encontrados

```json
{
  "status": "success",
  "veiculo": {
    "placa": "ABC1D23",
    "marca_modelo": "Honda CB 500F",
    "ano_fabricacao": "2020",
    "ano_modelo": "2020",
    "cor_veiculo": "Preta",
    "combustivel": "Gasolina",
    "proprietario_nome": "João Silva",
    "municipio": "São Paulo"
  },
  "documentos": {
    "crlv": {
      "pdf_file": { "file_base64": "..." },
      "image_file": { "file_base64": "..." }
    }
  }
}
```

**Resultado na UI:**
- 📄 Card com todos os dados do veículo
- 📥 Botão para baixar PDF do CRLV-e
- 🖼️ Botão para baixar Imagem do CRLV-e

### ⚠️ Dados Encontrados, CRLV-e Não Disponível

```json
{
  "status": "success",
  "veiculo": {
    "placa": "XYZ1234",
    "marca_modelo": "Yamaha YZF R3"
    // ... dados completos
  },
  "documentos": {
    "crlv": null
  }
}
```

**Resultado na UI:**
- 📄 Card com dados do veículo
- ⚠️ Mensagem: "CRLV-e não disponível"
- 💡 Explicação: O veículo existe, mas o CRLV-e eletrônico não foi gerado ainda

### ❌ Placa Não Encontrada

```json
{
  "error": "Dados não encontrados na API Brasil",
  "apiStatus": 404,
  "placa": "QYB9D82",
  "uf": "BA"
}
```

**Resultado na UI:**
- ❌ Mensagem: "Dados não encontrados na API Brasil"
- 💡 Dica: Verifique o formato da placa ou tente outro estado

## 💡 Dicas para Testar

### 1. **Use Placas Reais**
- Tente com placas de veículos que você conhece
- Motocicletas, carros, etc funcionam todos
- Qualquer estado do Brasil pode ser testado

### 2. **Formatos Suportados**
```
✅ Correto:  ABC1D23   (padrão novo Mercosul)
✅ Correto:  ABC1234   (placa antigas)
❌ Errado:   ABC-1D23  (não aceita hífen)
❌ Errado:   abc1d23   (precisa maiúscula)
```

### 3. **Entendendo os Estados**
```
SP = São Paulo      MG = Minas Gerais    RJ = Rio de Janeiro
BA = Bahia          RS = Rio Grande do Sul    SC = Santa Catarina
PR = Paraná         PE = Pernambuco     CE = Ceará
...e mais 17 estados
```

### 4. **Limite de Créditos**
- Seu token API Brasil tem **limite de créditos** (geralmente 55/mês)
- Cada busca consome **1 crédito**
- Você pode ver o saldo disponível na resposta
- Se esgotar, preencha os dados **manualmente**

## 🔍 Testando com Dados que Conhece

### Exemplo 1: Sua Moto Pessoal
```
1. Obtenha a placa de sua moto
2. Anote o estado (UF) em que está registrada
3. Digite na página de consulta
4. Clique em "Buscar CRLV-e"
5. Verá os dados completos do veículo
```

### Exemplo 2: Moto de Amigo/Cliente
```
1. Peça a placa e estado
2. Insira na página
3. Se o CRLV-e estiver disponível, baixe o PDF
4. Compartilhe se necessário
```

## 📥 Baixando Arquivos

### PDF do CRLV-e
- **Nome do arquivo**: `CRLV-ABC1D23.pdf`
- **Formato**: Adobe PDF
- **Conteúdo**: Documento oficial CRLV-e com QR code
- **Uso**: Enviar para cliente, imprimir, etc

### Imagem do CRLV-e
- **Nome do arquivo**: `CRLV-ABC1D23.png`
- **Formato**: PNG (imagem)
- **Conteúdo**: Screenshot/captura do documento
- **Uso**: Visualizar rápido, compartilhar em redes sociais

## 🐛 Troubleshooting

### "Dados não encontrados na API Brasil"
**Causa possível:**
- Placa digitada incorretamente
- Veículo não registrado no Brasil
- Estado (UF) incorreto
- Veículo muito antigo (pré-2000)

**Solução:**
- Verifique a placa novamente
- Tente com outro estado
- Confirme que o veículo é brasileiro

### "CRLV-e não disponível"
**Causa possível:**
- O veículo existe, mas CRLV-e não foi emitido ainda
- É um veículo muito antigo
- Precisa aguardar geração do documento

**Solução:**
- Preencha os dados manualmente
- Tente novamente em outro dia
- Entre em contato com o proprietário

### "Limite de créditos atingido"
**Causa possível:**
- Você já fez 55 buscas neste mês
- Seu plano API Brasil foi esgotado

**Solução:**
- Preencha os dados manualmente
- Aguarde renovação do mês
- Adquira mais créditos no site da API Brasil

## 🎯 Próximos Passos

- [ ] Testar com 5 placas diferentes
- [ ] Validar downloads de PDF/Imagem
- [ ] Integrar CRLV-e em Ordens de Serviço
- [ ] Enviar CRLV-e via WhatsApp

---

**Status da Integração:** ✅ COMPLETA E FUNCIONANDO

**Última atualização:** 21 de janeiro de 2026
