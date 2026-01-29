# ⚠️ MIGRATION URGENTE - Executar Agora!

## Erro Atual
Você está recebendo erro `400` ao tentar salvar porque o campo `terms_accepted` não existe no banco de dados ainda.

## ✅ SOLUÇÃO RÁPIDA

### Acesse o Supabase Dashboard:
https://app.supabase.com/project/xqndblstrblqleraepzs/sql/new

### Cole este comando SQL:
```sql
ALTER TABLE public.service_orders
ADD COLUMN terms_accepted BOOLEAN DEFAULT false;
```

### Clique em "RUN" (botão azul)

### Pronto! ✅
Depois disso, o campo estará disponível e os termos serão salvos normalmente.

---

## Informações Técnicas
- **Arquivo Migration:** [supabase/migrations/202601290002_add_terms_accepted_column.sql](supabase/migrations/202601290002_add_terms_accepted_column.sql)
- **Status:** Pendente de execução no banco
- **Impacto:** Sem dados, apenas adiciona uma coluna nova
