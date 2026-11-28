// Almoxarifado: de onde sai o item da OS e quanto de uma embalagem foi usado.

export type UsoProduto = 'venda' | 'interno' | 'ambos';
export type Origem = 'loja' | 'almox';

/** Padrão de onde sai na OS (loja com almoxarifado): "só venda" sai da loja; o resto, do almoxarifado (como era). */
export const origemPadrao = (uso: UsoProduto | string | null | undefined): Origem => (uso === 'venda' ? 'loja' : 'almox');

// Unidades que se convertem entre si (base = a menor)
const BASE: Record<string, { grupo: string; fator: number }> = {
  ml: { grupo: 'volume', fator: 1 }, l: { grupo: 'volume', fator: 1000 },
  g: { grupo: 'peso', fator: 1 }, kg: { grupo: 'peso', fator: 1000 },
  cm: { grupo: 'comprimento', fator: 1 }, m: { grupo: 'comprimento', fator: 100 },
  un: { grupo: 'unidade', fator: 1 },
};

/** Unidades que dá para digitar o uso de uma embalagem com conteúdo nessa unidade (ex.: lata em ml → ml ou l). */
export function unidadesDoConteudo(conteudoUnidade: string | null | undefined): string[] {
  const g = BASE[(conteudoUnidade || '').toLowerCase()]?.grupo;
  return g ? Object.keys(BASE).filter((u) => BASE[u].grupo === g) : [];
}

/**
 * Quanto de 1 embalagem foi usado. Ex.: usou 50 ml de uma lata de 300 ml → 0,167.
 * Devolve null se as unidades não combinam ou os números não fazem sentido.
 */
export function fracaoDaEmbalagem(usado: number, unidadeUsada: string, conteudoQtd: number, conteudoUnidade: string): number | null {
  const a = BASE[unidadeUsada.toLowerCase()], b = BASE[conteudoUnidade.toLowerCase()];
  if (!a || !b || a.grupo !== b.grupo || !(usado > 0) || !(conteudoQtd > 0)) return null;
  return (usado * a.fator) / (conteudoQtd * b.fator);
}

/** Quantidade gravada no estoque (3 casas, como o banco guarda). */
export const qtdEstoque = (v: number) => Number(v.toFixed(3));

/** Texto curto para a descrição do item: ¼, ½, ¾ ou "0,3". */
export function textoParte(f: number): string {
  const nomes: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };
  return nomes[String(f)] ?? String(qtdEstoque(f)).replace('.', ',');
}

/**
 * Custo (preço de custo do cadastro) do que saiu do estoque numa OS.
 * peças = itens cobrados do cliente; uso = material de uso lançado com valor 0 (não cobrado).
 * Serviço e item digitado à mão (sem produto) não têm custo aqui.
 */
export function custoDoEstoqueNaOs(
  materiais: { product_id?: string | null; is_service?: boolean | null; quantidade: string | number; valor: number | string | null }[],
  produtos: { id: string; cost_price?: number | string | null }[],
): { pecas: number; uso: number; total: number } {
  const custo = new Map(produtos.map((p) => [p.id, Number(p.cost_price) || 0]));
  let pecas = 0, uso = 0;
  for (const m of materiais) {
    if (!m.product_id || m.is_service) continue;
    const q = parseFloat(String(m.quantidade).replace(',', '.')) || 0;
    const c = q * (custo.get(m.product_id) ?? 0);
    if ((Number(m.valor) || 0) > 0) pecas += c; else uso += c;
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  return { pecas: r(pecas), uso: r(uso), total: r(pecas + uso) };
}

export interface MovPessoa {
  type: string; local: string | null; quantity: number | string; product_id: string;
  order_id: string | null; retirado_por?: string | null;
}
export interface ConsumoPessoa { nome: string; emOs: number; semOs: number; total: number; qtdEmOs: number; qtdSemOs: number }

/**
 * Quanto cada pessoa tirou do almoxarifado (custo). Movimentos em ordem de data.
 * Em OS: baixa menos devolução da mesma OS e produto (a devolução desconta de quem retirou por último).
 * Sem OS: baixa sem OS (consumo interno). Sem nome = "Não informado" (lançamentos antigos ou loja sem equipe).
 */
export function consumoPorPessoa(movs: MovPessoa[], custo: (productId: string) => number): ConsumoPessoa[] {
  const pilhas = new Map<string, { nome: string; q: number; pid: string }[]>();
  const pessoas = new Map<string, ConsumoPessoa>();
  const pessoa = (nome: string) => {
    if (!pessoas.has(nome)) pessoas.set(nome, { nome, emOs: 0, semOs: 0, total: 0, qtdEmOs: 0, qtdSemOs: 0 });
    return pessoas.get(nome)!;
  };
  for (const mv of movs) {
    if (mv.local !== 'almox') continue;
    const q = Number(mv.quantity) || 0;
    const nome = (mv.retirado_por || '').trim() || 'Não informado';
    if (mv.type === 'consumo_interno') {
      const p = pessoa(nome);
      p.qtdSemOs += q;
      p.semOs += q * custo(mv.product_id);
    } else if (mv.type === 'saida_os' && mv.order_id) {
      const k = `${mv.order_id}|${mv.product_id}`;
      if (!pilhas.has(k)) pilhas.set(k, []);
      pilhas.get(k)!.push({ nome, q, pid: mv.product_id });
    } else if (mv.type === 'devolucao' && mv.order_id) {
      let falta = q;
      const pilha = pilhas.get(`${mv.order_id}|${mv.product_id}`) ?? [];
      for (let i = pilha.length - 1; i >= 0 && falta > 0; i--) {
        const tira = Math.min(pilha[i].q, falta);
        pilha[i].q -= tira;
        falta -= tira;
      }
    }
  }
  for (const pilha of pilhas.values()) {
    for (const e of pilha) {
      if (e.q <= 0.0005) continue;
      const p = pessoa(e.nome);
      p.qtdEmOs += e.q;
      p.emOs += e.q * custo(e.pid);
    }
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  return [...pessoas.values()]
    .map((p) => ({ ...p, emOs: r(p.emOs), semOs: r(p.semOs), total: r(p.emOs + p.semOs), qtdEmOs: qtdEstoque(p.qtdEmOs), qtdSemOs: qtdEstoque(p.qtdSemOs) }))
    .filter((p) => p.qtdEmOs > 0 || p.qtdSemOs > 0)
    .sort((a, b) => b.total - a.total);
}
