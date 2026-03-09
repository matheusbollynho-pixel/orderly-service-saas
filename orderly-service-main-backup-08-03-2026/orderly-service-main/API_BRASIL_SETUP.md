# Integração com API Brasil para Busca de Placa

## Configuração

### 1. Obtenha a Chave da API Brasil
- Acesse: https://www.apibrasil.com.br/
- Cadastre-se ou faça login
- Gere uma chave de API (token)
- Você tem **55 consultas/mês** disponíveis

### 2. Configure a Variável de Ambiente
1. Abra o arquivo `.env.local` (raiz do projeto)
2. Substitua `SUA_CHAVE_API_BRASIL_AQUI` pela sua chave:
   ```
   VITE_API_BRASIL_TOKEN=eyJhbGc...
   ```
3. Salve o arquivo
4. Reinicie o servidor de desenvolvimento: `npm run dev`

## Como Funciona

### Ao Criar uma OS:
1. Preencha o **CPF** (cliente) primeiro
2. Na aba **Motos**, insira a **Placa** no formato: `ABC1D23`
3. Clique no botão **🔍** ao lado da placa
4. A API buscará automaticamente:
   - ✅ Modelo da moto
   - ✅ Ano de fabricação
   - ✅ Cor do veículo

### Se a Busca Falhar:
- Mensagem de erro aparece em vermelho
- Você pode **preencher manualmente** os campos (Modelo, Ano, Cor)
- Isso não conta como busca falhada (sem limite de tentativas manuais)

## Limitações

- **55 buscas/mês**: Após esgotar, você terá que preencher **manualmente**
- **Placas válidas**: Apenas placas brasileiras registradas funcionam
- **Sem histórico**: Cada busca consume 1 crédito, mesmo que seja a mesma placa

## Dicas

1. **Reutilize placas**: Se for adicionar a mesma moto novamente, copie os dados já preenchidos
2. **Verificação**: Sempre confirme se os dados retornados estão corretos
3. **Manual**: Não hesite em preencher manualmente se a busca falhar

## Troubleshooting

### "Não foi possível buscar a placa"
- Verifique se a chave `.env.local` está correta
- Confirme que tem buscas disponíveis neste mês
- Tente com outra placa para validar a conexão

### "Dados do veículo não encontrados"
- A placa pode estar incorreta
- Verifique se o veículo é registrado no Brasil
- Tente preencher manualmente

## Documentação da API Brasil

- **Endpoint**: `GET https://www.apibrasil.com.br/api/v2/veiculo/placa/{PLACA}`
- **Headers**: `Authorization: Bearer {TOKEN}`
- **Response**: JSON com dados: `modelo`, `ano`, `cor`
