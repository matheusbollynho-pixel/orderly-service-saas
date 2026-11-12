import { describe, it, expect } from 'vitest';
import { etapaDe, patchPara, acoesDa, precisaMecanico, ehExpress, podeEntregar, quitarMarcaEntregue } from '@/lib/etapaOS';

describe('etapaDe (o status da OS manda)', () => {
  it('as 5 etapas', () => {
    expect(etapaDe({ status: 'aberta', status_oficina: null })).toBe('fila');
    expect(etapaDe({ status: 'aberta', status_oficina: 'aguardando_inspecao' })).toBe('fila');
    expect(etapaDe({ status: 'em_andamento', status_oficina: 'em_servico' })).toBe('servico');
    expect(etapaDe({ status: 'em_andamento', status_oficina: 'aguardando_peca' })).toBe('peca');
    expect(etapaDe({ status: 'concluida', status_oficina: 'pronta_para_buscar' })).toBe('pronta');
    expect(etapaDe({ status: 'concluida_entregue', status_oficina: 'em_servico' })).toBe('entregue');
  });
  it('dados antigos fora de sincronia aparecem certo', () => {
    expect(etapaDe({ status: 'aberta', status_oficina: 'em_servico' })).toBe('servico');      // 9 OS hoje
    expect(etapaDe({ status: 'aberta', status_oficina: 'aguardando_peca' })).toBe('peca');
    expect(etapaDe({ status: 'em_andamento', status_oficina: 'servico_concluido' })).toBe('servico'); // não estava concluída
    expect(etapaDe({ status: 'concluida', status_oficina: null })).toBe('pronta');
    expect(etapaDe({ status: 'concluida', status_oficina: 'servico_concluido' })).toBe('pronta');
    expect(etapaDe({ status: 'em_andamento', status_oficina: null })).toBe('servico');
  });
});

describe('patchPara (grava os dois campos juntos)', () => {
  it('pronta grava status, oficina, conclusão e saída ao meio-dia', () => {
    const p = patchPara('pronta', new Date(2026, 10, 12, 15, 30));
    expect(p).toMatchObject({ status: 'concluida', status_oficina: 'pronta_para_buscar' });
    expect(new Date(p.exit_date!).getHours()).toBe(12);
    expect(p.conclusion_date).toBeTruthy();
  });
  it('peça e serviço continuam em andamento', () => {
    expect(patchPara('peca')).toEqual({ status: 'em_andamento', status_oficina: 'aguardando_peca' });
    expect(patchPara('servico')).toEqual({ status: 'em_andamento', status_oficina: 'em_servico' });
  });
});

describe('botões e regras', () => {
  it('cada etapa tem a próxima ação', () => {
    expect(acoesDa('fila').map((a) => a.rotulo)).toEqual(['Começar serviço']);
    expect(acoesDa('servico').map((a) => a.destino)).toEqual(['pronta', 'peca']);
    expect(acoesDa('peca').map((a) => a.rotulo)).toEqual(['Peça chegou']);
    expect(acoesDa('pronta')).toEqual([]);
  });
  it('mecânico obrigatório para sair da fila', () => {
    expect(precisaMecanico('servico', null)).toBe(true);
    expect(precisaMecanico('servico', 'm1')).toBe(false);
  });
  it('Express e decisões 2 e 3', () => {
    expect(ehExpress({ problem_description: 'Cadastro Express - troca de óleo' })).toBe(true);
    expect(podeEntregar(0)).toBe(true);
    expect(podeEntregar(50)).toBe(false);
    expect(podeEntregar(50, true)).toBe(true);
    expect(quitarMarcaEntregue({ status: 'em_andamento', status_oficina: 'em_servico' })).toBe(false);
    expect(quitarMarcaEntregue({ status: 'concluida' })).toBe(true);
    expect(quitarMarcaEntregue({ status: 'aberta', problem_description: 'cadastro express' })).toBe(true);
  });
});
