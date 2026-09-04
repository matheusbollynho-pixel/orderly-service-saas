import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Regressão do vazamento do número global (Bandara) em mensagens de outras lojas.
 *
 * Réplica EXATA da lógica de `resolveConfig` em
 * supabase/functions/_shared/whatsapp.ts (não dá pra importar o módulo real:
 * ele faz `import ... from 'https://esm.sh/...'` no topo).
 *
 * Se mudar o original, atualizar aqui.
 */

type StoreWhatsAppConfig = {
  provider?: string;
  instance_url?: string;
  instance_token?: string;
};

const env: Record<string, string | undefined> = {};
const DenoEnvGet = (k: string) => env[k];

function resolveConfig(storeConfig?: StoreWhatsAppConfig, allowGlobalFallback = false) {
  const isStoreScoped = storeConfig !== undefined;
  if (!isStoreScoped && !allowGlobalFallback) {
    throw new Error(
      'Envio de WhatsApp sem config da loja e sem allowGlobalFallback — bloqueado ' +
      'pra não usar a instância global (número da Bandara). Passe o storeConfig da loja.'
    );
  }
  const provider = (storeConfig?.provider || (!isStoreScoped ? DenoEnvGet('WHATSAPP_PROVIDER') : undefined) || 'uazapi').toLowerCase();

  if (provider === 'uazapi') {
    const base = (storeConfig?.instance_url || (!isStoreScoped ? (DenoEnvGet('UAZAPI_BASE_URL') || DenoEnvGet('UAZAPI_SERVER_URL')) : undefined) || '').replace(/\/$/, '');
    const token = storeConfig?.instance_token || (!isStoreScoped ? (DenoEnvGet('UAZAPI_INSTANCE_TOKEN') || DenoEnvGet('UAZAPI_TOKEN')) : undefined) || '';
    if (isStoreScoped && (!base || !token)) {
      throw new Error('Esta loja não tem WhatsApp configurado corretamente — falta URL ou token da instância (Configurações → Ferramentas). Envio cancelado.');
    }
    return { provider: 'uazapi', base, token };
  }

  const instanceId = (!isStoreScoped ? DenoEnvGet('ZAPI_INSTANCE_ID') : undefined) || '';
  const token = storeConfig?.instance_token || (!isStoreScoped ? DenoEnvGet('ZAPI_TOKEN') : undefined) || '';
  const clientToken = (!isStoreScoped ? DenoEnvGet('ZAPI_CLIENT_TOKEN') : undefined) || '';
  if (isStoreScoped && (!instanceId || !token)) {
    throw new Error('Esta loja não tem WhatsApp configurado corretamente — falta ID da instância ou token (Configurações → Ferramentas). Envio cancelado.');
  }
  return { provider: 'zapi', instanceId, token, clientToken };
}

const BANDARA = { base: 'https://bandara.uazapi.com', token: 'eec5f573-GLOBAL-DA-BANDARA' };

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  // Simula os secrets de produção (instância global = Bandara)
  env.UAZAPI_BASE_URL = BANDARA.base;
  env.UAZAPI_INSTANCE_TOKEN = BANDARA.token;
});

describe('envio sem config da loja', () => {
  it('SEM flag → bloqueia (não vaza o número global)', () => {
    expect(() => resolveConfig(undefined)).toThrow(/bloqueado/i);
    expect(() => resolveConfig()).toThrow(/bloqueado/i);
  });

  it('COM allowGlobalFallback → usa o global (alerta interno de operação)', () => {
    const cfg = resolveConfig(undefined, true);
    expect(cfg).toMatchObject({ provider: 'uazapi', base: BANDARA.base, token: BANDARA.token });
  });
});

describe('envio com config da loja (store-scoped)', () => {
  it('loja com instância própria → usa a dela, nunca o global', () => {
    const cfg = resolveConfig({
      provider: 'uazapi',
      instance_url: 'https://minhaoficina.uazapi.com',
      instance_token: 'TOKEN-DA-LOJA-X',
    });
    expect(cfg.base).toBe('https://minhaoficina.uazapi.com');
    expect(cfg.token).toBe('TOKEN-DA-LOJA-X');
    expect(cfg.token).not.toBe(BANDARA.token);
  });

  it('loja sem url/token → lança erro, NÃO cai no global', () => {
    expect(() => resolveConfig({ instance_url: undefined, instance_token: undefined })).toThrow(/não tem WhatsApp configurado/i);
    expect(() => resolveConfig({})).toThrow(/não tem WhatsApp configurado/i);
  });

  it('config store-scoped nunca lê env, mesmo com secrets presentes', () => {
    // BAMOTOS: mesmo servidor da Bandara, token próprio — tem que sair o token próprio
    const cfg = resolveConfig({
      provider: 'uazapi',
      instance_url: 'https://bandara.uazapi.com',
      instance_token: 'df67f1a5-TOKEN-DO-BAMOTOS',
    });
    expect(cfg.token).toBe('df67f1a5-TOKEN-DO-BAMOTOS');
    expect(cfg.token).not.toBe(BANDARA.token);
  });
});
