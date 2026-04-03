#!/usr/bin/env node
/**
 * setup-cliente.js
 * Ativa um novo cliente no sistema Orderly.
 *
 * Como usar:
 *   node scripts/setup-cliente.js
 *
 * O que faz automaticamente:
 *   1. Preenche store_settings no projeto do cliente
 *   2. Cria o usuário admin do cliente
 *   3. Mostra os comandos CLI para rodar migrations e deploy das functions
 *   4. Mostra os secrets que precisam ser configurados
 */

const readline = require('readline');
const https = require('https');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

// ─── Helpers HTTP ────────────────────────────────────────────────────────────

function apiRequest(method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Cores no terminal ───────────────────────────────────────────────────────

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + c.bold('═══════════════════════════════════════════════'));
  console.log(c.bold('   SETUP DE NOVO CLIENTE — Orderly Service SaaS'));
  console.log(c.bold('═══════════════════════════════════════════════') + '\n');

  // ── DADOS DO CLIENTE ──────────────────────────────────────────────────────

  console.log(c.cyan('📋 DADOS DA LOJA\n'));
  const company_name   = await ask('  Nome da empresa/oficina: ');
  const store_owner    = await ask('  Nome do dono/responsável: ');
  const store_phone    = await ask('  Telefone da loja (com DDD, ex: 11999990000): ');
  const store_cnpj     = await ask('  CNPJ ou CPF: ');
  const store_address  = await ask('  Endereço completo: ');
  const store_instagram = await ask('  Instagram (sem @, deixe em branco se não tiver): ');

  console.log('\n' + c.cyan('🤖 CONFIGURAÇÃO DA IA\n'));
  const ai_notes       = await ask('  Horário de funcionamento (ex: Seg-Sex 8h-18h, Sab 8h-12h): ');

  console.log('\n' + c.cyan('👤 ACESSO DO CLIENTE\n'));
  const admin_email    = await ask('  E-mail do cliente (vai usar para login): ');
  const admin_password = await ask('  Senha temporária (mínimo 6 caracteres): ');

  console.log('\n' + c.cyan('🔧 SUPABASE DO CLIENTE\n'));
  console.log(c.yellow('  → O cliente precisa criar conta em supabase.com e te adicionar como admin'));
  console.log(c.yellow('  → Project ref: Settings → General → Reference ID'));
  console.log(c.yellow('  → Service Role Key: Settings → API → service_role\n'));
  const supabase_url   = await ask('  URL do projeto (ex: https://abcdef.supabase.co): ');
  const service_key    = await ask('  Service Role Key: ');

  console.log('\n' + c.cyan('📱 WHATSAPP (UazAPI)\n'));
  const uazapi_instance = await ask('  Nome da instância UazAPI (ex: bandara-motos): ');

  console.log('\n' + c.bold('Processando...\n'));

  const baseUrl = supabase_url.replace(/\/$/, '');
  const authHeaders = {
    'apikey': service_key,
    'Authorization': `Bearer ${service_key}`,
  };

  // ── 1. STORE SETTINGS ─────────────────────────────────────────────────────

  process.stdout.write('  [1/3] Configurando store_settings... ');
  const settingsRes = await apiRequest(
    'POST',
    `${baseUrl}/rest/v1/store_settings`,
    {
      company_name,
      store_owner,
      store_phone,
      store_cnpj,
      store_address,
      store_instagram,
      ai_enabled: true,
      ai_notes,
    },
    {
      ...authHeaders,
      'Prefer': 'resolution=merge-duplicates',
    }
  );

  if (settingsRes.status === 200 || settingsRes.status === 201) {
    console.log(c.green('✓'));
  } else {
    console.log(c.red(`✗ (status ${settingsRes.status})`));
    console.log(c.red('  Resposta: ' + JSON.stringify(settingsRes.body)));
  }

  // ── 2. USUÁRIO ADMIN ──────────────────────────────────────────────────────

  process.stdout.write('  [2/3] Criando usuário admin... ');
  const userRes = await apiRequest(
    'POST',
    `${baseUrl}/auth/v1/admin/users`,
    {
      email: admin_email,
      password: admin_password,
      email_confirm: true,
      user_metadata: { role: 'admin' },
    },
    {
      ...authHeaders,
    }
  );

  if (userRes.status === 200 || userRes.status === 201) {
    console.log(c.green('✓'));
  } else if (userRes.body?.msg?.includes('already been registered')) {
    console.log(c.yellow('⚠ usuário já existe'));
  } else {
    console.log(c.red(`✗ (status ${userRes.status})`));
    console.log(c.red('  Resposta: ' + JSON.stringify(userRes.body)));
  }

  // ── 3. RESUMO FINAL ───────────────────────────────────────────────────────

  console.log(c.green('  [3/3] Gerando instruções...') + ' ' + c.green('✓'));

  const projectRef = baseUrl.replace('https://', '').replace('.supabase.co', '');

  console.log('\n' + c.bold('═══════════════════════════════════════════════'));
  console.log(c.bold(c.green('   ✓ CONFIGURAÇÃO AUTOMÁTICA CONCLUÍDA')));
  console.log(c.bold('═══════════════════════════════════════════════') + '\n');

  console.log(c.bold('📋 PRÓXIMOS PASSOS MANUAIS:\n'));

  console.log(c.cyan('PASSO 1 — Rodar migrations e deploy das functions:'));
  console.log(c.yellow(`
  npx supabase link --project-ref ${projectRef}
  npx supabase db push
  npx supabase functions deploy --all --no-verify-jwt
  `));

  console.log(c.cyan('PASSO 2 — Configurar secrets das Edge Functions:'));
  console.log(c.yellow(`
  npx supabase secrets set --project-ref ${projectRef} \\
    UAZAPI_INSTANCE_TOKEN=<token_da_instancia_uazapi> \\
    UAZAPI_BASE_URL=https://bandara.uazapi.com \\
    ANTHROPIC_API_KEY=<sua_chave_anthropic>
  `));

  console.log(c.cyan('PASSO 3 — UazAPI:'));
  console.log(`
  1. Acesse o painel UazAPI
  2. Crie uma instância chamada: ${c.bold(uazapi_instance)}
  3. Gere o QR Code e peça para o cliente escanear
  4. Confirme que ficou conectado (status verde)
  5. Copie o token e use no PASSO 2 acima
  `);

  console.log(c.cyan('PASSO 4 — Webhook UazAPI:'));
  console.log(`
  URL: ${c.bold(`${baseUrl}/functions/v1/ia-atendimento`)}
  Eventos: mensagens recebidas
  `);

  console.log(c.cyan('PASSO 5 — Entrega ao cliente:'));
  console.log(`
  URL do sistema: ${c.bold('<URL do deploy do site>')}
  E-mail: ${c.bold(admin_email)}
  Senha: ${c.bold(admin_password)}

  Orientar o cliente a:
  → Entrar em Configurações → Integrações e adicionar a API Key do Asaas
  → Ativar corretor pt-BR no Chrome: chrome://settings/languages
  `);

  console.log(c.bold('═══════════════════════════════════════════════'));
  console.log(c.bold(`  Cliente: ${company_name}`));
  console.log(c.bold(`  Projeto Supabase: ${projectRef}`));
  console.log(c.bold(`  Instância UazAPI: ${uazapi_instance}`));
  console.log(c.bold('═══════════════════════════════════════════════') + '\n');

  rl.close();
}

main().catch((err) => {
  console.error(c.red('\n❌ Erro inesperado: ' + err.message));
  rl.close();
  process.exit(1);
});
