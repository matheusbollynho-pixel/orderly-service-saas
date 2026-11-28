import { describe, expect, it } from 'vitest';
import { brl, hojeLoja, montarResumoFinanceiro, periodoDoResumo, variacao, type DadosFinanceiro } from '../../supabase/functions/_shared/financeiro/mensagem';

const zero = { caixa: { entradas: 0, saidas: 0, retiradas: 0 }, os: { qtd: 0, total: 0, desconto: 0, a_receber: 0 }, notas: { qtd: 0, total: 0, no_fiado: 0 }, fiado_vencido: { qtd: 0, valor: 0 } };
const base = (extra: Partial<DadosFinanceiro> = {}): DadosFinanceiro => ({
  periodo: { ini: '2026-11-27', fim: '2026-11-27', dias: 1 },
  resumo: {
    caixa: { entradas: 1500, saidas: 200, retiradas: 500, entradas_os: 900, entradas_notas: 520, entradas_fiado: 0, entradas_estorno: 0 },
    os: { qtd: 2, total: 1000, desconto: 50, a_receber: 100 },
    notas: { qtd: 3, total: 600, no_fiado: 80 },
    fiado_vencido: { qtd: 2, valor: 350 },
  },
  anterior: { ...zero, os: { qtd: 1, total: 1500, desconto: 0, a_receber: 0 } },
  por_forma: [{ forma: 'pix', valor: 900 }, { forma: 'dinheiro', valor: 400 }, { forma: 'cartao_credito', valor: 200 }],
  pecas: { faturamento: 800, custo: 500, sem_custo_produtos: 1, sem_custo_valor: 40 },
  abaixo_custo: [{ produto: 'Óleo 20W50', preco: 20, custo: 25, qtd: 2 }],
  caixa_diferencas: [{ fechado_em: '2026-11-27T21:00:00Z', quem: 'Aislan', diferenca: -12 }],
  caixa_aberto_desde: null,
  contas_proximas: { vencidas_qtd: 0, vencidas_valor: 0, proximas_qtd: 1, proximas_valor: 800 },
  ...extra,
});

describe('resumo financeiro: texto', () => {
  it('valores em reais e variação', () => {
    expect(brl(1234567.5)).toBe('R$ 1.234.567,50');
    expect(brl(-12)).toBe('−R$ 12,00');
    expect(variacao(1550, 1500)).toBe('+3%');
    expect(variacao(750, 1500)).toBe('−50%');
    expect(variacao(100, 0)).toBeNull();
    expect(variacao(1500, 1500)).toBe('igual');
  });

  it('dia com movimento: vendas, caixa, lucro das peças e alertas', () => {
    const m = montarResumoFinanceiro(base(), 'Rei Acessórios', 'diario')!;
    expect(m).toContain('*Fechamento do dia · Rei Acessórios*');
    expect(m).toContain('sexta, 27/11');
    expect(m).toContain('*Vendeu:* R$ 1.630,00 (+9% vs sexta passada)'); // 1000 − 50 + 600 + 80 à mão
    expect(m).toContain('• Lançado à mão no caixa: R$ 80,00'); // 1500 − 900 − 520
    expect(m).toContain('• 2 OS entregues: R$ 950,00');
    expect(m).toContain('• 3 vendas no balcão: R$ 600,00');
    expect(m).toContain('Ficou a receber (fiado/pendente): R$ 180,00');
    expect(m).toContain('Pix R$ 900,00 · Dinheiro R$ 400,00 · Crédito R$ 200,00');
    expect(m).toContain('*Saldo:* R$ 1.300,00');
    expect(m).toContain('*Lucro bruto das peças:* R$ 300,00 (38%)');
    expect(m).toContain('1 produto vendido está sem preço de custo (R$ 40,00) e ficou fora do lucro.');
    expect(m).toContain('Caixa fechado com falta de R$ 12,00 (Aislan)');
    expect(m).toContain('2 fiados vencidos: R$ 350,00');
    expect(m).toContain('1 conta vence nos próximos 2 dias: R$ 800,00');
    expect(m).toContain('Óleo 20W50 por R$ 20,00 (custo R$ 25,00) × 2');
  });

  it('loja que lança a venda à mão no caixa (sem nota): entra no vendeu', () => {
    const r = { ...zero, caixa: { entradas: 7554, saidas: 0, retiradas: 0, entradas_os: 2512, entradas_notas: 0, entradas_fiado: 0, entradas_estorno: 0 },
      os: { qtd: 3, total: 2512, desconto: 0, a_receber: 0 } };
    const m = montarResumoFinanceiro(base({ resumo: r }), 'Loja', 'diario')!;
    expect(m).toContain('*Vendeu:* R$ 7.554,00');
    expect(m).toContain('• Lançado à mão no caixa: R$ 5.042,00');
  });

  it('sem movimento e sem alerta não manda nada; com alerta manda só o alerta', () => {
    const vazio = base({ resumo: zero, por_forma: [], pecas: null, abaixo_custo: [], caixa_diferencas: [], contas_proximas: null });
    expect(montarResumoFinanceiro(vazio, 'Loja', 'diario')).toBeNull();
    const soAlerta = montarResumoFinanceiro({ ...vazio, caixa_aberto_desde: '2026-11-25' }, 'Loja', 'diario')!;
    expect(soAlerta).toContain('Sem vendas nem movimento no caixa hoje.');
    expect(soAlerta).toContain('Caixa aberto desde 25/11');
    expect(soAlerta).not.toContain('Vendeu');
  });

  it('semanal: título com o período e comparação com a semana anterior', () => {
    const m = montarResumoFinanceiro(base({ periodo: { ini: '2026-11-16', fim: '2026-11-22', dias: 7 } }), 'Loja', 'semanal')!;
    expect(m).toContain('*Resumo da semana · Loja*');
    expect(m).toContain('16/11 a 22/11');
    expect(m).toContain('vs semana anterior');
    expect(m).toContain('(Aislan) em 27/11');
  });
});

describe('resumo financeiro: datas', () => {
  it('hoje no horário de Brasília', () => {
    expect(hojeLoja(Date.parse('2026-11-28T02:30:00Z'))).toBe('2026-11-27');
    expect(hojeLoja(Date.parse('2026-11-28T03:30:00Z'))).toBe('2026-11-28');
  });
  it('diário = hoje; semanal = segunda a domingo da semana passada', () => {
    expect(periodoDoResumo('diario', '2026-11-27')).toEqual({ ini: '2026-11-27', fim: '2026-11-27' });
    expect(periodoDoResumo('semanal', '2026-11-30')).toEqual({ ini: '2026-11-23', fim: '2026-11-29' }); // segunda
    expect(periodoDoResumo('semanal', '2026-11-27')).toEqual({ ini: '2026-11-16', fim: '2026-11-22' }); // sexta
    expect(periodoDoResumo('semanal', '2027-01-04')).toEqual({ ini: '2026-12-28', fim: '2027-01-03' }); // virada de ano
  });
});
