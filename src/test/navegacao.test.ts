import { describe, it, expect, beforeEach, vi } from 'vitest';

// O Node deste ambiente não traz localStorage: guarda em memória só para o teste.
const memoria = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => { memoria.set(k, v); },
  removeItem: (k: string) => { memoria.delete(k); },
  clear: () => memoria.clear(),
});
import { acesso, telaDaArea, areaVisivel, lerTelaInicial } from '@/lib/navegacao';
import type { MemberPermissions } from '@/hooks/useAuth';

const TODAS: MemberPermissions = {
  nova_os: true, express: true, orders: true, agenda: true, quadro: true,
  caixa: true, balcao: true, relatorios: true, boletos: true, fiados: true,
  estoque: true, equipe: true, pos_venda: true, satisfacao: true,
};
const SO_OFICINA: MemberPermissions = {
  ...TODAS, caixa: false, balcao: false, relatorios: false, boletos: false, fiados: false,
  estoque: false, equipe: false, pos_venda: false, satisfacao: false,
};
// Plano Básico (usePlanFeatures): só OS, agenda, oficina e equipe
const BASICO = new Set(['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics']);
const basico = (r: string) => BASICO.has(r);
const tudo = () => true;

describe('porta única de navegação', () => {
  it('plano Básico: caixa e balcão aparecem bloqueados por plano (cadeado), não somem', () => {
    expect(acesso('fluxo-caixa', TODAS, basico)).toBe('plano');
    expect(acesso('balcao', TODAS, basico)).toBe('plano');
    expect(acesso('orders', TODAS, basico)).toBe('ok');
    expect(areaVisivel('caixa', TODAS, basico)).toBe(true);
  });

  it('colaborador sem permissão não vê a tela nem a área', () => {
    expect(acesso('fluxo-caixa', SO_OFICINA, tudo)).toBe('sem_permissao');
    expect(areaVisivel('caixa', SO_OFICINA, tudo)).toBe(false);
    expect(areaVisivel('balcao', SO_OFICINA, tudo)).toBe(false);
    expect(areaVisivel('oficina', SO_OFICINA, tudo)).toBe(true);
  });

  it('área abre na primeira tela liberada (Oficina começa em Ordens)', () => {
    expect(telaDaArea('oficina', TODAS, tudo)).toBe('orders');
    expect(telaDaArea('caixa', TODAS, tudo)).toBe('fluxo-caixa');
    expect(telaDaArea('caixa', { ...TODAS, caixa: false }, tudo)).toBe('fiados');
  });

  it('cotação e encomendas seguem o plano (Pro em diante)', () => {
    expect(acesso('cotacao', TODAS, basico)).toBe('plano');
    expect(acesso('encomendas', TODAS, (r) => r !== 'encomendas')).toBe('plano');
  });
});

describe('tela inicial do aparelho', () => {
  beforeEach(() => localStorage.clear());
  it('padrão é o Início; colaborador só de oficina abre nas Ordens', () => {
    expect(lerTelaInicial(TODAS)).toBe('dashboard');
    expect(lerTelaInicial(SO_OFICINA)).toBe('orders');
  });
  it('respeita a escolha salva no aparelho', () => {
    localStorage.setItem('v2-tela-inicial', 'quadro');
    expect(lerTelaInicial(TODAS)).toBe('quadro');
  });
});
