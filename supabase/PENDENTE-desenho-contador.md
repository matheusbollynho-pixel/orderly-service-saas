# Acesso do contador — desenho (ainda NÃO construído)

Escrito em 26/11/2026. Só desenho: nada aqui está no código nem no banco.

## O que o contador precisa
1. Pegar os XMLs do mês (NFC-e, NF-e, canceladas, inutilizações).
2. Ver o resumo (quantas notas, valores, canceladas).
3. Fazer isso para várias lojas que ele atende, sem pedir para o dono toda vez.

## Fase 1 — já pronta no código (sem login do contador)
- **CPF/CNPJ do contador** em Configurações › Nota fiscal. Vai em toda nota no grupo autXML:
  o contador baixa os XMLs direto no portal da SEFAZ com o certificado dele.
  Na Bahia o autXML é obrigatório na NF-e (rejeição 486). Sem contador, vai o CNPJ da SEFAZ-BA.
- **"XMLs do período"** no painel de notas: o dono baixa um .zip (XMLs + planilha resumo + inutilizações) e manda.

Para a maioria das lojas pequenas isso já resolve.

## Fase 2 — login próprio do contador (quando houver demanda)
**Regra principal:** o contador não é colaborador. Não entra em `store_members`, então não conta no limite de usuários do plano e não vê nada além do fiscal.

### Banco
```sql
CREATE TABLE public.contador_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.store_settings(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  convidado_por uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id)
);
-- RLS: o contador lê os próprios acessos; o dono da loja lê/gera/revoga os da loja dele.
-- Leitura extra (só SELECT) para o contador:
CREATE POLICY "notas_fiscais: contador ler" ON public.notas_fiscais FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.contador_acessos WHERE user_id = auth.uid() AND ativo));
-- idem fiscal_inutilizacoes e (só nome/CNPJ) fiscal_emissores
```
- A função `fiscal` ganha `store_id` opcional na ação `xmls_periodo`. Ela só aceita se houver um `contador_acessos` ativo para aquele usuário e aquela loja. Para dono e colaborador nada muda: a loja continua vindo de `get_my_store_id()`.
- Todas as outras ações (emitir, cancelar, inutilizar, certificado) **continuam bloqueadas** para o contador.

### Convite
1. O dono vai em Configurações › Nota fiscal › Contador › **"Dar acesso ao contador"** e digita o e-mail.
2. Uma função de servidor convida por e-mail (`auth.admin.inviteUserByEmail`, com segredo e só pelo dono) e cria o `contador_acessos`.
3. Se o contador já tem login (atende outra loja), só cria o acesso novo, sem outro convite.
4. "Tirar acesso" põe `ativo = false` e o contador para de ver na hora (RLS).

### Tela
- Rota `/contador`, que **não usa o menu da loja**:
  - lista das lojas que ele atende;
  - ao escolher uma, mostra o painel de notas só de leitura, com o botão "XMLs do período" e o mês anterior já selecionado.
- No login: se o usuário só tem `contador_acessos` (nenhum `store_members`), vai direto para `/contador`.

### Cuidados
- Testar com 2 lojas fictícias que **uma não vaza para a outra**. É o mesmo teste do F12 feito em 25/11.
- O contador nunca vê a chave da Spedy, o certificado nem dados de clientes fora das notas.
- Pensar no "mandar todo mês por e-mail" (Resend) só depois, como opção do dono.

## Ordem sugerida
Fase 1 já está pronta. Fazer a Fase 2 quando o primeiro contador pedir, ou quando a Rei e a Bandara usarem o mesmo escritório.
