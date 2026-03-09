# Guia de Teste - Sistema de Reprogramação de Lembretes

## ✅ Checklist de Funcionalidade

### 1. **Verificação do Banco de Dados**

#### 1.1 Tabela de Palavras-chave
```sql
-- Execute no Supabase SQL Editor
SELECT id, keyword, reminder_days, enabled 
FROM maintenance_keywords 
WHERE enabled = true 
ORDER BY keyword;
```

**Esperado:**
- ✅ Pelo menos 1 palavra-chave ativa (ex: "Óleo", "Revisão")
- ✅ Cada palavra-chave tem `reminder_days` definido (ex: 10, 180)

#### 1.2 Tabela de Lembretes
```sql
SELECT id, order_id, client_id, keyword_id, service_date, reminder_due_date, reminder_sent_at 
FROM maintenance_reminders 
ORDER BY created_at DESC 
LIMIT 20;
```

**Esperado:**
- ✅ Lembretes com `reminder_due_date` no futuro
- ✅ Alguns com `reminder_sent_at = null` (pendentes)
- ✅ Alguns com `reminder_sent_at` preenchido (já enviados)

#### 1.3 Tabela de Clientes (autoriza_lembretes)
```sql
SELECT id, name, autoriza_lembretes 
FROM clients 
WHERE autoriza_lembretes IS NOT NULL 
LIMIT 10;
```

**Esperado:**
- ✅ Clientes com `autoriza_lembretes = true` (autorizados)
- ✅ Clientes com `autoriza_lembretes = false` (bloqueados)

---

### 2. **Teste Manual - Reprogramação Automática**

#### Cenário A: Cliente retorna ANTES do prazo

**Passo 1:** Criar ordem de serviço
1. Acesse o dashboard (http://localhost:8080)
2. Clique em "Nova OS"
3. Preencha dados do cliente (importante: selecione um cliente com `autoriza_lembretes = true`)
4. Clique "Salvar"

**Passo 2:** Adicionar primeiro material
1. Clique na OS criada
2. No campo "Peças e Serviços", adicione: `Troca de óleo cambio`
3. Clique "Adicionar Material"
4. **Verifique o Toast:** Deve aparecer "✅ Lembrete criado para 'Óleo' em 10 dias!"

**Passo 3:** Verificar primeiro lembrete
1. Acesse "Pós-Venda" → "Manutenção" → "Monitoramento de Lembretes"
2. **Verifique os cards:**
   - Total criados: deve ter aumentado
   - Pendentes: deve ter aumentado
3. **Verifique a lista:** Deve aparecer um lembrete "Para envio agora" ou "Próximos agendados"
4. Anote a data do lembrete (ex: 01/03/2026)

**Passo 4:** Adicionar segundo material (retorno antecipado)
1. Volte para a OS
2. Adicione novo material: `Revisão do óleo`
3. Clique "Adicionar Material"
4. **Verifique o Toast:** Deve aparecer "✅ Lembrete anterior cancelado. Novo agendado para 'Óleo' em 10 dias! 🔔"

**Passo 5:** Verificar reprogramação
1. Acesse "Pós-Venda" → "Manutenção" → "Monitoramento de Lembretes"
2. **Verifique:**
   - Total criados: deve ter aumentado em 1
   - Pendentes: deve manter ou aumentar em 1
   - O lembrete antigo (01/03) deve ter desaparecido
   - Um novo lembrete deve aparecer com a nova data (ex: 06/03)

**Resultado Esperado:** ✅ Sistema cancelou o lembrete antigo e criou um novo

---

#### Cenário B: Cliente retorna APÓS o prazo

**Passo 1:** Simular lembrete já enviado
1. No Supabase SQL Editor, execute:
```sql
UPDATE maintenance_reminders 
SET reminder_sent_at = NOW() 
WHERE id = (SELECT id FROM maintenance_reminders ORDER BY created_at DESC LIMIT 1);
```

**Passo 2:** Adicionar novo material na mesma OS
1. Adicione novo material: `Troca de óleo motor`
2. Clique "Adicionar Material"
3. **Verifique o Toast:** Deve aparecer "✅ Lembrete criado para 'Óleo' em 10 dias! 🔔"
   (Sem mensagem de cancelamento, pois o anterior já foi enviado)

**Passo 3:** Verificar no dashboard
1. Acesse "Pós-Venda" → "Manutenção"
2. **Verifique:**
   - Total criados: aumentou em 1
   - Enviados: mantém (anterior ainda conta)
   - Pendentes: aumentou em 1 (novo lembrete)

**Resultado Esperado:** ✅ Sistema não cancelou (pois já foi enviado), apenas criou novo

---

### 3. **Teste do Console (DevTools)**

#### 3.1 Verificar Logs
1. Abra o navegador (F12)
2. Vá para aba "Console"
3. Adicione um material com palavra-chave
4. **Verifique os logs:**
   - `✅ N lembrete(s) cancelado(s) para reprogramação`
   - `📅 Lembrete reprogramado: X cancelado(s), 1 novo criado`
   - Ou apenas: `✅ Lembrete criado para 'Óleo'...`

#### 3.2 Verificar Network
1. Abra aba "Network"
2. Adicione um material
3. **Verifique chamadas:** Deve haver chamadas para:
   - `maintenance_keywords` (buscar palavras-chave)
   - `maintenance_reminders` (buscar/cancelar/criar lembretes)
   - `service_orders` (dados da OS)

---

### 4. **Verificações Críticas**

#### 4.1 Autorização Respeitada
```typescript
// Teste: Cliente com autoriza_lembretes = false
```

1. Selecione um cliente com `autoriza_lembretes = false`
2. Crie nova OS com esse cliente
3. Adicione material com palavra-chave
4. **Esperado:** Nenhum lembrete é criado, nenhum toast aparece

#### 4.2 Palavra-chave Não Detectada
1. Adicione material com descrição: `Teste aleatório xyz`
2. **Esperado:** Nenhum lembrete é criado, nenhum toast

#### 4.3 Palavra-chave com Acento
1. Adicione material: `Troca de óleo do cambio` (com acento)
2. Com palavra-chave cadastrada como `oleo` (sem acento)
3. **Esperado:** Lembrete é criado mesmo com acento na descrição

#### 4.4 Múltiplas Palavras-chave
1. Adicione material: `Óleo e filtro`
2. Se existem keywords para "óleo" e "filtro"
3. **Esperado:** Apenas a primeira palavra-chave encontrada cria lembrete

---

### 5. **Testes de Integração**

#### 5.1 Fluxo Completo
```
1. Criar cliente autorizado ✅
2. Criar OS ✅
3. Adicionar material com palavra-chave ✅
   → Lembrete criado ✅
4. Adicionar novo material (mesma palavra-chave) ✅
   → Lembrete anterior cancelado ✅
   → Novo lembrete criado ✅
5. Ir para Manutenção → Monitoramento ✅
   → Dashboard atualizado ✅
6. Filtros funcionam (período, cliente, palavra-chave) ✅
```

#### 5.2 Verificar Toast Notifications
- "✅ Lembrete criado..." → Verde ✅
- "✅ Lembrete anterior cancelado..." → Verde ✅
- Erro (ex: cliente não autorizado) → Sem toast ✅

---

### 6. **Monitoramento no Dashboard Pós-Venda**

#### 6.1 Cards de Resumo
- [ ] "Total criados" - aumenta com novos lembretes
- [ ] "Pendentes" - mostra não enviados
- [ ] "Enviados" - mostra já enviados
- [ ] "Bloqueados" - mostra clientes sem autorização

#### 6.2 Lista de Lembretes
- [ ] "Para envio agora" - apenas lembretes com data <= hoje
- [ ] "Próximos agendados" - apenas lembretes com data > hoje
- [ ] Filtro por período funciona
- [ ] Filtro por cliente funciona
- [ ] Filtro por palavra-chave funciona

#### 6.3 Botão Expand/Collapse
- [ ] Clique no olho para minimizar "Próximos agendados"
- [ ] Clique novamente para expandir
- [ ] Estado persiste durante a sessão

---

## 🔍 Queries SQL para Debugging

### Verificar Lembretes Cancelados
```sql
-- Ver quantos lembretes foram criados/cancelados
SELECT 
  COUNT(*) as total_lembretes,
  COUNT(CASE WHEN reminder_sent_at IS NULL THEN 1 END) as pendentes,
  COUNT(CASE WHEN reminder_sent_at IS NOT NULL THEN 1 END) as enviados
FROM maintenance_reminders;

-- Ver lembretes por cliente
SELECT 
  so.client_name,
  COUNT(*) as total,
  COUNT(CASE WHEN reminder_sent_at IS NULL THEN 1 END) as pendentes
FROM maintenance_reminders mr
LEFT JOIN service_orders so ON mr.order_id = so.id
GROUP BY so.client_name
ORDER BY total DESC;

-- Ver lembretes por palavra-chave
SELECT 
  mk.keyword,
  COUNT(*) as total,
  COUNT(CASE WHEN reminder_sent_at IS NULL THEN 1 END) as pendentes
FROM maintenance_reminders mr
LEFT JOIN maintenance_keywords mk ON mr.keyword_id = mk.id
GROUP BY mk.keyword
ORDER BY total DESC;
```

### Verificar Histórico (se tabela existir)
```sql
SELECT * FROM maintenance_reminder_history 
WHERE action = 'cancelled'
ORDER BY created_at DESC 
LIMIT 10;
```

---

## 📊 Expectativas de Performance

| Ação | Tempo Esperado | Status |
|------|---|---|
| Criar lembrete | < 1s | ✅ |
| Cancelar + criar | < 2s | ✅ |
| Buscar lembretes pendentes | < 500ms | ✅ |
| Atualizar dashboard | < 1s | ✅ |

---

## 🐛 Troubleshooting

### Problema: Toast não aparece ao adicionar material
**Checklist:**
- [ ] Palavra-chave existe e está `enabled = true`
- [ ] Cliente tem `autoriza_lembretes = true`
- [ ] Descrição contém a palavra-chave (com/sem acento)
- [ ] Console não mostra erro

### Problema: Lembrete não é cancelado ao retornar
**Checklist:**
- [ ] Lembrete anterior está em `reminder_sent_at = null` (pendente)
- [ ] Cliente e palavra-chave são iguais
- [ ] Console mostra "N lembrete(s) cancelado(s)"

### Problema: Dashboard não atualiza
**Solução:** Aguarde 2 segundos ou atualize a página (F5)

### Problema: Erro 404 ou não encontrado
**Checklist:**
- [ ] Tabelas `maintenance_keywords` e `maintenance_reminders` existem
- [ ] Supabase está conectado
- [ ] JWT token é válido

---

## ✅ Checklist Final

- [ ] Lembretes são criados quando material com palavra-chave é adicionado
- [ ] Toast mostra mensagem apropriada
- [ ] Dashboard atualiza automaticamente
- [ ] Lembrete anterior é cancelado quando cliente retorna antes do prazo
- [ ] Novo lembrete é criado com base na nova data
- [ ] Toast mostra "cancelado" quando aplicável
- [ ] Clientes sem autorização não recebem lembretes
- [ ] Palavra-chave com acento é detectada corretamente
- [ ] Filtros funcionam no dashboard
- [ ] Expand/collapse funciona
- [ ] Console não mostra erros críticos
- [ ] Performance é aceitável (< 2s por ação)

---

## 🚀 Próximos Passos

Se tudo passar:
1. ✅ Deploy em produção confirmado
2. ✅ Monitorar logs por 24h
3. ✅ Solicitar feedback do cliente
4. ✅ Documentar padrões de uso

Se algo falhar:
1. 🔴 Verificar console (F12)
2. 🔴 Executar queries de debugging
3. 🔴 Checar logs do Supabase
4. 🔴 Ajustar e testar novamente
