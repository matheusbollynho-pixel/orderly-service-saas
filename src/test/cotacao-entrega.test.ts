import { describe, it, expect } from 'vitest';
import {
  proximaEntregaGratis, resumoEntrega, mensagemCotacao, normalizarWhats, linksInternet, ordenarOpcoes,
  type Representante, type CotacaoPreco,
} from '@/hooks/useCotacao';

const base: Representante = {
  id: 'r1', store_id: 's1', nome: 'Osia', whatsapp: null, perfil: null,
  entrega_dia_semana: null, entrega_quinzenal: false, entrega_quinzenal_ref: null,
  pedido_minimo: null, prazo_dias: null, horario_corte: null, entrega_extra: null,
  frete_extra_valor: null, tem_tabela: false, tabela_atualizada_em: null, observacoes: null, ativo: true,
};

// Quarta-feira, 11/11/2026
const quarta10h = new Date(2026, 10, 11, 10, 0);
const quarta21h = new Date(2026, 10, 11, 21, 0);
const sexta10h = new Date(2026, 10, 13, 10, 0);
const sexta13h = new Date(2026, 10, 13, 13, 0);

describe('proximaEntregaGratis', () => {
  it('dia fixo semanal: próxima sexta', () => {
    const d = proximaEntregaGratis({ ...base, entrega_dia_semana: 5 }, quarta10h)!;
    expect(d.getDate()).toBe(13);
  });

  it('no próprio dia, antes do corte: hoje', () => {
    const d = proximaEntregaGratis({ ...base, entrega_dia_semana: 5, horario_corte: '12:00:00' }, sexta10h)!;
    expect(d.getDate()).toBe(13);
  });

  it('no próprio dia, depois do corte: semana que vem', () => {
    const d = proximaEntregaGratis({ ...base, entrega_dia_semana: 5, horario_corte: '12:00:00' }, sexta13h)!;
    expect(d.getDate()).toBe(20);
  });

  it('quinzenal: pula a semana "não"', () => {
    // Entrega aconteceu na quarta 04/11 -> próxima é 18/11, não 11/11
    const rep = { ...base, entrega_dia_semana: 3, entrega_quinzenal: true, entrega_quinzenal_ref: '2026-11-04' };
    expect(proximaEntregaGratis(rep, quarta10h)!.getDate()).toBe(18);
  });

  it('quinzenal: semana "sim" é hoje', () => {
    const rep = { ...base, entrega_dia_semana: 3, entrega_quinzenal: true, entrega_quinzenal_ref: '2026-10-28' };
    expect(proximaEntregaGratis(rep, quarta10h)!.getDate()).toBe(11);
  });

  it('sem dia fixo: null', () => {
    expect(proximaEntregaGratis(base, quarta10h)).toBeNull();
  });
});

describe('resumoEntrega (caso Osia: sexta grátis, van R$45, até 12h chega no mesmo dia)', () => {
  const osia = { ...base, entrega_dia_semana: 5, entrega_extra: 'van' as const, frete_extra_valor: 45, prazo_dias: 0, horario_corte: '12:00:00' };

  it('quarta 10h: van chega hoje', () => {
    const r = resumoEntrega(osia, quarta10h).join(' | ');
    expect(r).toContain('Grátis: sex 13/11');
    expect(r).toContain('Van: chega hoje');
    expect(r).toContain('45,00');
  });

  it('quarta 21h: van chega amanhã', () => {
    const r = resumoEntrega(osia, quarta21h).join(' | ');
    expect(r).toContain('Van: chega qui 12/11');
  });

  it('pedido mínimo (Pellegrino)', () => {
    const r = resumoEntrega({ ...base, pedido_minimo: 500, prazo_dias: 2, entrega_extra: 'onibus' }, quarta10h).join(' | ');
    expect(r).toContain('Grátis acima de');
    expect(r).toContain('500,00');
    expect(r).toContain('Ônibus: chega sex 13/11 (frete a combinar)');
  });
});

describe('mensagem e links', () => {
  it('mensagem vai com o texto EXATO da loja e não fala em comparar', () => {
    const m = mensagemCotacao([{ texto: 'Relacao pop 110', quantidade: 1 }, { texto: 'camara de ar 18 grossa', quantidade: 2 }]);
    expect(m).toContain('- Relacao pop 110\n');
    expect(m).toContain('- camara de ar 18 grossa (2)');
    expect(m.toLowerCase()).not.toContain('compar');
    expect(m.toLowerCase()).not.toContain('orçamento');
  });

  it('normaliza WhatsApp com e sem 55', () => {
    expect(normalizarWhats('(75) 9 8838-8629')).toBe('5575988388629');
    expect(normalizarWhats('5575988388629')).toBe('5575988388629');
    expect(normalizarWhats('')).toBe('');
  });

  it('links de busca', () => {
    const l = linksInternet('Relacao pop 110');
    expect(l.mercadoLivre).toBe('https://lista.mercadolivre.com.br/Relacao-pop-110');
    expect(l.shopee).toBe('https://shopee.com.br/search?keyword=Relacao%20pop%20110');
  });
});

describe('ordenarOpcoes', () => {
  const p = (id: string, situacao: CotacaoPreco['situacao'], preco: number | null, frete: number | null = null) =>
    ({ id, situacao, preco, frete } as CotacaoPreco);

  it('cotado mais barato (preço + frete) primeiro, depois dúvida, não tem, não serve', () => {
    const r = ordenarOpcoes([p('a', 'nao_serve', 10), p('b', 'cotado', 100), p('c', 'duvida', 5), p('d', 'cotado', 80, 30), p('e', 'nao_tem', null)]);
    expect(r.map((x) => x.id)).toEqual(['b', 'd', 'c', 'e', 'a']);
  });
});

describe('dataEntregaExtra / textoData (van paga da Osia)', () => {
  const osia = { ...base, entrega_dia_semana: 5, entrega_extra: 'van' as const, frete_extra_valor: 45, prazo_dias: 0, horario_corte: '12:00:00' };
  const madrugada = new Date(2026, 10, 12, 2, 0); // quinta 02h

  it('antes do corte: chega hoje', async () => {
    const { dataEntregaExtra, textoData } = await import('@/hooks/useCotacao');
    expect(textoData(dataEntregaExtra(osia, madrugada)!, madrugada)).toBe('hoje');
  });
  it('depois do corte: chega amanhã', async () => {
    const { dataEntregaExtra, textoData } = await import('@/hooks/useCotacao');
    const tarde = new Date(2026, 10, 12, 13, 0);
    expect(textoData(dataEntregaExtra(osia, tarde)!, tarde)).toBe('amanhã');
  });
  it('grátis: de quinta, a sexta é "amanhã"; de terça, "sexta (13/11)"', async () => {
    const { textoData } = await import('@/hooks/useCotacao');
    expect(textoData(proximaEntregaGratis(osia, madrugada)!, madrugada)).toBe('amanhã');
    const terca = new Date(2026, 10, 10, 9, 0);
    expect(textoData(proximaEntregaGratis(osia, terca)!, terca)).toBe('sexta (13/11)');
  });
});

describe('prazo em dias pula domingo (sábado conta)', () => {
  it('quinta + 3 dias = segunda; sexta + 1 = sábado; sábado + 1 = segunda', async () => {
    const { somarDiasEntrega } = await import('@/hooks/useCotacao');
    expect(somarDiasEntrega(new Date(2026, 10, 12, 9), 3).getDate()).toBe(16); // qui 12 -> seg 16
    expect(somarDiasEntrega(new Date(2026, 10, 13, 9), 1).getDate()).toBe(14); // sex 13 -> sáb 14
    expect(somarDiasEntrega(new Date(2026, 10, 14, 9), 1).getDate()).toBe(16); // sáb 14 -> seg 16
    expect(somarDiasEntrega(new Date(2026, 10, 15, 9), 0).getDate()).toBe(16); // domingo "hoje" -> segunda
  });
});
