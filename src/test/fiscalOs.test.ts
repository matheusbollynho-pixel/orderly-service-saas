import { describe, expect, it } from 'vitest';
import { montarNfce } from '../../supabase/functions/_shared/fiscal/spedy';
import { pecasDaOs, qtdDoTexto } from '../../supabase/functions/_shared/fiscal/os';

describe('Nota da OS (só peças)', () => {
  it('quantidade em texto', () => {
    expect(qtdDoTexto('2')).toBe(2);
    expect(qtdDoTexto('1,5 lt')).toBe(1.5);
    expect(qtdDoTexto('0.5')).toBe(0.5);
    expect(qtdDoTexto('')).toBe(0);
    expect(qtdDoTexto(3)).toBe(3);
  });
  it('só peças vão para a nota; desconto dividido pelo peso; forma de quem pagou mais', () => {
    const r = pecasDaOs([
      { descricao: 'Pastilha', quantidade: '2', valor: 50, is_service: false, product_id: 'p1' },
      { descricao: 'Mão de obra', quantidade: '1', valor: 100, is_service: true, product_id: null },
      { descricao: 'Brinde', quantidade: '1', valor: 0, is_service: false, product_id: null },
    ], [
      { method: 'pix', amount: 60, discount_amount: 0 },
      { method: 'cartao', amount: 120, discount_amount: 20 },
    ]);
    expect(r.linhas).toEqual([{ description: 'Pastilha', quantity: 2, unit_price: 50, product_id: 'p1' }]);
    expect(r.brutoPecas).toBe(100);
    expect(r.descontoPecas).toBe(10); // 20 de desconto × (100 peças / 200 total)
    expect(r.formas[0].forma).toBe('cartao');
    expect(r.temServico).toBe(true);
    // A nota fecha com o valor das peças menos a parte delas no desconto, na forma principal
    const c = montarNfce({
      idIntegracao: 'x', desconto: r.descontoPecas, pagamentos: r.formas,
      itens: r.linhas.map((l) => ({ codigo: '', descricao: l.description, quantidade: l.quantity, valorUnitario: l.unit_price, unidade: 'UN', ncm: '87083090', cfop: null, csosn: null, origem: null })),
    }, { ncm: null, cfop: '5102', csosn: '102', origem: 0, pisCofinsCst: 49 });
    expect(c.total.invoiceAmount).toBe(90);
    expect(c.payments).toEqual([{ method: 'creditCard', amount: 90 }]);
  });
  it('OS só de serviço não tem peças', () => {
    const r = pecasDaOs([{ descricao: 'Revisão', quantidade: '1', valor: 150, is_service: true, product_id: null }], []);
    expect(r.linhas).toEqual([]);
  });
});
