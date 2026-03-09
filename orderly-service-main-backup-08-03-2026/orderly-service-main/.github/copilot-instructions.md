# Instruções para agentes de IA

## Visão geral do projeto
- App web Vite + React + TypeScript com Tailwind + shadcn-ui (config em [vite.config.ts](vite.config.ts) e [tailwind.config.ts](tailwind.config.ts)).
- Backend principal é Supabase (auth, PostgREST e Edge Functions). Cliente fica em [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts) com storage em memória para compatibilidade Safari/iOS.
- Rotas React Router ficam em [src/App.tsx](src/App.tsx): a rota pública de avaliação é /avaliar/:token e usa Edge Function sem autenticação (ver [src/pages/PublicSatisfactionPage.tsx](src/pages/PublicSatisfactionPage.tsx)).

## Fluxos e integrações críticas
- WhatsApp: chamadas para a Edge Function enviar-documento-whatsapp via fetch no serviço [src/services/whatsappService.ts](src/services/whatsappService.ts). Exige VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.
- Avaliação pública: GET/POST para /functions/v1/satisfaction-public em [src/pages/PublicSatisfactionPage.tsx](src/pages/PublicSatisfactionPage.tsx).
- Lembretes de manutenção: regras de detecção e deduplicação em [src/services/maintenanceReminderService.ts](src/services/maintenanceReminderService.ts), usado em [src/pages/AfterSalesPage.tsx](src/pages/AfterSalesPage.tsx).
- PDF da OS: geração com jsPDF em [src/lib/pdfGenerator.ts](src/lib/pdfGenerator.ts) (inclui logo base64 em assets).

## Convenções de código e arquitetura
- Imports absolutos usam alias @ apontando para src (ver [tsconfig.json](tsconfig.json)).
- Supabase tipado em [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts); alguns serviços usam client “any” quando tabelas novas ainda não estão no tipo.
- main.tsx usa import dinâmico + delay curto por compatibilidade Safari; preserve esse padrão ao mexer no bootstrap ([src/main.tsx](src/main.tsx)).
- Autenticação e permissões simples por e-mail em [src/hooks/useAuth.ts](src/hooks/useAuth.ts); páginas devem respeitar flags como canAccessCashFlow/canAccessReports.

## Workflows de desenvolvimento
- Dev server: npm run dev
- Build: npm run build (ou build:dev)
- Testes: npm run test / npm run test:watch (Vitest)
- Lint: npm run lint

## Banco e migrations
- Migrations e diagnósticos SQL estão na raiz (ex.: [EXECUTAR_ESTA_MIGRATION.sql](EXECUTAR_ESTA_MIGRATION.sql)). Use esses scripts como referência do schema real do Supabase.

## Pontos de atenção
- Safari/iOS é alvo explícito: polyfills em [src/polyfills.ts](src/polyfills.ts) e ajustes de build no Vite.
- Edge Functions são a ponte para integrações externas (WhatsApp e satisfação). Evite chamadas diretas quando já existe função.
