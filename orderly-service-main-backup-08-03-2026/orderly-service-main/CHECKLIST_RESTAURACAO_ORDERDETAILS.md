# Checklist de Restauração e Atualização OrderDetails

## 1. Restaurar OrderDetails.tsx
- Substitua o conteúdo de src/components/OrderDetails.tsx pelo backup funcional (OrderDetails_backup_2026_03_08.tsx).
- Teste o site para garantir que está funcionando.

## 2. Adicionar campo de seleção de atendente obrigatório (ExpressCadastroPage)
- Em src/pages/ExpressCadastroPage.tsx:
  - Adicione campo de seleção de atendente (responsável) obrigatório.
  - Implemente validação: bloqueie submit se não houver atendente selecionado.
  - Garanta que atendimento_id seja salvo na OS Express.

## 3. Exibir criador (atendimento_id) na OS
- Em src/components/OrderDetails.tsx:
  - Mostre o nome do atendente (criador) usando lookup por ID (teamMembers).
  - Exiba o campo no painel de detalhes da OS.

## 4. Garantir menu admin sempre visível
- Em src/components/OrderDetails.tsx:
  - Certifique-se de que o menu admin aparece para usuários com permissão, mesmo em OS Express.

## 5. Alinhar status e mecânico na UI
- Em src/components/OrderDetails.tsx:
  - Ajuste o layout para que status e mecânico fiquem na mesma linha/direção.

## 6. Correções de sintaxe e fechamento JSX
- Revise OrderDetails.tsx:
  - Corrija tags JSX abertas/fechadas.
  - Remova divs extras e imports redundantes.

## 7. Testar após cada etapa
- Após cada alteração, teste o site para garantir estabilidade.

---

## Referências de arquivos
- src/pages/ExpressCadastroPage.tsx
- src/components/OrderDetails.tsx
- src/components/OrderDetails_backup_2026_03_08.tsx
- src/hooks/useTeamMembers.ts
- src/hooks/useServiceOrders.ts

---

## Dica
Se preferir, aplique as mudanças uma a uma, validando o funcionamento antes de prosseguir para a próxima.

---

## Prompt para agente/IA

"Restaure o arquivo OrderDetails.tsx para o backup funcional. Em seguida, implemente as seguintes melhorias:
1. Campo de seleção de atendente obrigatório na ExpressCadastroPage.
2. Salvamento e exibição do criador (atendimento_id) na OS.
3. Menu admin sempre visível.
4. Alinhamento de status e mecânico na UI.
5. Correções de sintaxe e fechamento JSX.
Teste o site após cada etapa e valide a estabilidade."
