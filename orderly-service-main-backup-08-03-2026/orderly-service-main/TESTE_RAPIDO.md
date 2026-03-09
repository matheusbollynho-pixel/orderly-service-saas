# ⚡ Teste Rápido - Sistema de Reprogramação de Lembretes

## 🚀 Método 1: Painel de Debug (Recomendado)

### Passo 1: Acesse o Painel Debug
1. Abra a aplicação: https://os-bandara.vercel.app
2. Vá para **"Pós-Venda"** (menu inferior)
3. Clique na aba **"Debug"** (você verá um ícone de chave inglesa 🔧)

### Passo 2: Execue os Testes Automáticos
1. Clique no botão **"Executar Testes"**
2. Aguarde 2-3 segundos
3. Veja os resultados:

**Esperado:**
- ✅ Todos os items em verde (pass)
- 📊 Taxa de sucesso: 100%
- ℹ️ Detalhes como: "7 lembretes (3 pendentes, 4 enviados)"

**Problemas Comuns:**
- ❌ "Tabela de Palavras-chave" em vermelho → Palavras-chave não foram criadas
- ❌ "Tabela de Lembretes" em amarelo → Nenhum lembrete foi criado ainda
- ⚠️ "Clientes com Autorização" em amarelo → Nenhum cliente autorizado

---

## 🧪 Método 2: Teste Manual Completo

### Cenário: Cliente retorna antes do prazo

#### Passo 1: Criar Nova Ordem de Serviço
1. Clique em **"Nova OS"** (home)
2. Preencha:
   - Cliente: Escolha um com ✅ autorização de lembretes
   - Moto: Qualquer uma
   - Problema: "Teste de lembrete"
3. Clique **"Salvar"**

#### Passo 2: Adicionar Primeiro Material (Gera Lembrete)
1. Clique na OS criada
2. No campo **"Peças e Serviços"**, digite: **`Troca de óleo cambio`**
3. Clique **"Adicionar Material"**

**Verificar:** Toast deve aparecer:
```
✅ Lembrete criado para 'Óleo' em 10 dias! 🔔
```

#### Passo 3: Ver Lembrete Criado
1. Abra **"Pós-Venda"** → **"Manutenção"**
2. Verifique:
   - Card "Pendentes": aumentou em 1
   - Card "Total criados": aumentou em 1
3. Veja o lembrete na lista

#### Passo 4: Cliente Retorna (Reprogramação)
1. Volte para a OS
2. Adicione novo material: **`Revisão do óleo cambio`**
3. Clique **"Adicionar Material"**

**Verificar:** Toast deve aparecer:
```
✅ Lembrete anterior cancelado. Novo agendado para 'Óleo' em 10 dias! 🔔
```

#### Passo 5: Confirmar Reprogramação
1. Abra **"Pós-Venda"** → **"Manutenção"**
2. Verifique:
   - Lembrete antigo desapareceu
   - Novo lembrete aparece com data atualizada
   - "Total criados": aumentou em 1
   - "Pendentes": aumentou em 1

---

## 🔍 Verificações Rápidas (5 minutos)

### ✅ Checklist Mínimo

- [ ] Abri a aba **"Debug"** sem erro
- [ ] Cliquei "Executar Testes" e aparecem resultados
- [ ] Pelo menos **5 de 7 testes** passaram em verde
- [ ] Criei uma nova OS com cliente autorizado
- [ ] Adicionei material com palavra-chave
- [ ] Recebi toast "Lembrete criado..."
- [ ] Dashboard Manutenção atualizou automaticamente
- [ ] Adicionei segundo material
- [ ] Recebi toast "Lembrete anterior cancelado..."

---

## 🚨 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| Aba "Debug" não aparece | Você é usuário restrito (bandaramotos2@gmail.com) - não tem acesso |
| Toast não aparece | 1. Cliente tem autorização? 2. Palavra-chave está ativa? 3. Descrição contém a palavra-chave? |
| Dashboard não atualiza | Aguarde 2s ou atualize a página (F5) |
| Testes mostram erro "Conexão" | Supabase está indisponível - tente mais tarde |
| Nenhum lembrete aparece | Crie primeiro um material com palavra-chave |

---

## 📊 Interpretando os Resultados

### Cards do Dashboard Manutenção

| Card | Significado | Esperado |
|------|-------------|----------|
| **Total criados** | Todos os lembretes (pendentes + enviados) | > 0 |
| **Pendentes** | Lembretes não enviados | > 0 |
| **Enviados** | Lembretes já enviados | ≥ 0 |
| **Bloqueados** | Clientes sem autorização | 0 (ideal) |

### Lista de Lembretes

**"Para envio agora"** - Lembretes com data ≤ hoje
- ✅ Se há lembretes aqui, significa que estão prontos para notificação

**"Próximos agendados"** - Lembretes com data > hoje
- ✅ Se há lembretes aqui, significa que foram criados corretamente

---

## 🎯 Conclusão

**Sistema funcionando 100% se:**

✅ Painel Debug mostra 6-7 testes passando  
✅ Ao adicionar material → Toast aparece  
✅ Ao retornar cliente → Toast mostra "cancelado"  
✅ Dashboard atualiza automaticamente  
✅ Lembretes aparecem na lista  

**Teste completo em ~5 minutos! 🚀**

Se tudo passou, o sistema está **operacional e pronto para produção** ✅
