# Base do produto: SpeedSeekOS (para o time de produto)

Leia isto antes de propor qualquer coisa. Atualize quando uma decisão for aprovada pelo dono.

## O que é
SaaS de gestão para **oficina e loja de peças de moto**: OS, agenda, caixa, balcão, estoque, fiado, cotação de peças, encomendas, pós-venda, satisfação e IA de atendimento no WhatsApp.
- Cliente principal e laboratório: **Bandara Motos** (Paulo Afonso-BA), que usa todo dia. Mais algumas lojas no SaaS.
- Planos: Básico (só OS/agenda/oficina) • Pro (+caixa, balcão, estoque, fiado, relatórios, cotação) • Premium (+IA) • Enterprise.
- Endereços: app.speedseekos.com.br e os-bandara.vercel.app (mesmo código).

## Quem usa (pense sempre nessas pessoas)
- **Dono da oficina**: decide, olha caixa e relatórios, configura. Pouco tempo, pouca paciência com tela complicada.
- **Balconista/atendente**: abre OS, vende peça no balcão, recebe pagamento, cobra fiado, responde cliente. Faz isso **com cliente na frente**, com pressa.
- **Mecânico**: vê o que fazer, muda etapa da moto, às vezes com a mão suja e pelo celular.
- Aparelhos: **celular** (maioria) e PC no balcão. Internet às vezes ruim.
- A loja costuma usar **um login só para todos** (o do dono).

## O problema que a v2 resolve
O sistema cresceu feature por feature. Hoje: funções misturadas e repetidas, o cliente não acha o que existe e pensa que não tem.
Inventário completo de telas, funções e problemas: `docs/v2/INVENTARIO-SPEEDSEEKOS.md`. **Leia antes de propor.**

## Regras do dono (não negociáveis)
1. **Mesma função = mesmo visual e mesmo comportamento em todo lugar.** Exemplo dele: a busca de cliente da Nova OS e a do Express são diferentes; na v2 é uma só, usada em toda tela que busca cliente.
2. **Não pode quebrar o que funciona.** A Bandara usa todo dia. Nada de reescrever do zero: mudar por partes, tela por tela, sempre com o sistema no ar.
3. **Facilitar a vida do cliente** vem antes de ficar bonito. Visual harmonizado, mas a métrica é "ele acha e faz rápido".
4. **Tem que ter modo mobile de verdade** (lembrete do dono, 12/11): toda tela e todo padrão desenhados primeiro para o celular (uma mão, toque grande, sem rolar para o lado) e depois adaptados ao PC do balcão. Proposta que só funciona bem no PC não serve.
5. Nada de código sem o dono aprovar o plano.
6. Segurança fica para a última etapa (mas não pode piorar).

## Técnico (o que já existe)
- React 18 + Vite + TypeScript, **Tailwind + shadcn/ui** (`src/components/ui/`), ícones lucide, toasts sonner, TanStack Query.
- Supabase (Postgres com RLS por loja, edge functions Deno, realtime). Banco e regras de negócio estão testados: a v2 é principalmente **a casca (telas, navegação, componentes)**.
- Navegação atual: um `Index.tsx` que troca de "view" + barra de baixo com 19 botões (`BottomNav.tsx`). Configurações em `/config`.
- Telas gigantes: `OrderDetails.tsx` (2.400 linhas), `BalcaoNotaDetail.tsx` (1.500), `SuperAdminPage.tsx` (1.500).
- Tema escuro predominante, vermelho Bandara (#C1272D) usado como destaque em vários lugares.

## Decisões já tomadas
- (12/11/2026) Fazer v2 por reorganização + padronização, não reescrita do zero.
- (12/11/2026) Ordem: inventário (feito) → plano de reorganização/visual (time de produto, `docs/v2/PLANO-V2.md`) → execução por partes → **pente fino função por função** (simplificar por dentro, como foi feito na Cotação) → segurança.
