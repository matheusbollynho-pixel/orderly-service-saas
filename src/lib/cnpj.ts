// "Buscar CNPJ": dados públicos da empresa pela BrasilAPI (grátis, sem chave; o navegador chama direto).
// A BrasilAPI NÃO traz a Inscrição Estadual: ela é digitada à mão.

export interface DadosCnpj {
  cnpj: string;
  razaoSocial: string;
  fantasia: string;
  situacao: string;
  ativa: boolean;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  cidade: string;
  uf: string;
  cidadeIbge: string;
  telefone: string;
  email: string;
}

const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Confere os dígitos verificadores do CNPJ. */
export function cnpjValido(v: string): boolean {
  const c = dig(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    let soma = 0;
    let peso = base.length - 7;
    for (const n of base) { soma += Number(n) * peso--; if (peso < 2) peso = 9; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

/** Converte a resposta da BrasilAPI para o formato do sistema. */
export function lerBrasilApi(j: Record<string, unknown>): DadosCnpj {
  const tipo = String(j.descricao_tipo_de_logradouro ?? '').trim();
  const rua = String(j.logradouro ?? '').trim();
  const situacao = String(j.descricao_situacao_cadastral ?? '').trim();
  return {
    cnpj: dig(j.cnpj),
    razaoSocial: String(j.razao_social ?? '').trim(),
    fantasia: String(j.nome_fantasia ?? '').trim(),
    situacao,
    ativa: situacao.toUpperCase() === 'ATIVA',
    logradouro: [tipo, rua].filter(Boolean).join(' '),
    numero: String(j.numero ?? '').trim() || 'S/N',
    complemento: String(j.complemento ?? '').trim(),
    bairro: String(j.bairro ?? '').trim(),
    cep: dig(j.cep),
    cidade: String(j.municipio ?? '').trim(),
    uf: String(j.uf ?? '').trim().toUpperCase(),
    cidadeIbge: dig(j.codigo_municipio_ibge),
    telefone: dig(j.ddd_telefone_1),
    email: String(j.email ?? '').trim().toLowerCase(),
  };
}

/** Busca o CNPJ na BrasilAPI. Lança erro em português (inválido, não achado, fora do ar). */
export async function buscarCnpj(cnpj: string): Promise<DadosCnpj> {
  const c = dig(cnpj);
  if (!cnpjValido(c)) throw new Error('CNPJ inválido. Confira os números.');
  // BrasilAPI às vezes responde 503; a Minha Receita (fonte dela, mesmo formato) é a reserva
  const fontes = [`https://brasilapi.com.br/api/cnpj/v1/${c}`, `https://minhareceita.org/${c}`];
  let naoAchou = false;
  for (const url of fontes) {
    let r: Response;
    try { r = await fetch(url); } catch { continue; }
    if (r.status === 404 || r.status === 400) { naoAchou = true; continue; }
    if (!r.ok) continue;
    const d = lerBrasilApi(await r.json());
    return { ...d, cnpj: d.cnpj || c };
  }
  if (naoAchou) throw new Error('CNPJ não encontrado na Receita.');
  throw new Error('A consulta de CNPJ está fora do ar agora (ou sem internet). Tente de novo ou preencha à mão.');
}

/** Endereço numa linha só (campo "Endereço" que já existia no cadastro). */
export const enderecoEmLinha = (d: Pick<DadosCnpj, 'logradouro' | 'numero' | 'complemento' | 'bairro'>) =>
  [[d.logradouro, d.numero].filter(Boolean).join(', '), d.complemento, d.bairro].filter(Boolean).join(' - ');
