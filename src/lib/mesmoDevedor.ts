// Fiados da mesma pessoa: mesmo CPF ou telefone; sem nenhum dos dois, o mesmo nome.
// O clicado vem primeiro; os outros só se ainda estiverem em aberto.
interface FiadoMin { id: string; client_name?: string | null; client_phone?: string | null; client_cpf?: string | null; status?: string | null }

const digitos = (v?: string | null) => (v ?? '').replace(/\D/g, '');
const tel = (v?: string | null) => { const d = digitos(v); return d.length >= 8 ? d.slice(-8) : ''; };
const cpf = (v?: string | null) => { const d = digitos(v); return d.length >= 11 ? d : ''; };
const nome = (v?: string | null) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function mesmoDevedor<T extends FiadoMin>(fiados: T[], id: string): T[] {
  const alvo = fiados.find((f) => f.id === id);
  if (!alvo) return [];
  const t = tel(alvo.client_phone), c = cpf(alvo.client_cpf), n = nome(alvo.client_name);
  const outros = fiados.filter((f) => {
    if (f.id === id || f.status === 'pago') return false;
    if (c && cpf(f.client_cpf) === c) return true;
    if (t && tel(f.client_phone) === t) return true;
    // Só compara nome quando nenhum dos dois tem CPF/telefone pra conferir
    if (!c && !t && !cpf(f.client_cpf) && !tel(f.client_phone)) return !!n && nome(f.client_name) === n;
    return false;
  });
  return [alvo, ...outros];
}
