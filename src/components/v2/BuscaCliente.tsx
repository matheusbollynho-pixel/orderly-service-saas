// v2: busca de cliente única (Agenda, Encomendas, Balcão… e depois Abrir OS).
// Um campo só: reconhece nome, telefone, CPF ou placa (com ou sem hífen) e mostra
// o cliente com as motos dele. Escolher um resultado chama onEscolher.
import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { inicioDePalavra, normalizeSearch } from '@/lib/textSearch';
import { cn } from '@/lib/utils';
import type { Client, Motorcycle } from '@/hooks/useClients';

const db = supabase as unknown as SupabaseClient;

export type ClienteEncontrado = Client & { motorcycles: Motorcycle[] };
export type TipoBusca = 'placa' | 'telefone' | 'nome';

/** Descobre o que a pessoa digitou. */
export function tipoDaBusca(termo: string): TipoBusca {
  const t = termo.trim();
  const compacto = t.replace(/[^a-z0-9]/gi, '');
  // Placa: 3 letras + número (ABC1234, ABC1D23, ou o começo: ABC1)
  if (/^[a-z]{3}\d/i.test(compacto) && compacto.length <= 7) return 'placa';
  if (/^[\d\s()+\-.]+$/.test(t) && compacto.length >= 4) return 'telefone';
  return 'nome';
}

const CAMPOS_CLIENTE = 'id, name, cpf, phone, whatsapp, apelido, instagram, autoriza_instagram, autoriza_lembretes, birth_date, endereco';
const CAMPOS_MOTO = 'id, client_id, placa, marca, modelo, ano, cor';

export async function buscarClientes(termo: string): Promise<{ clientes: ClienteEncontrado[]; motoDaPlaca?: Record<string, string> }> {
  const t = termo.trim();
  const tipo = tipoDaBusca(t);
  const compacto = t.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (tipo === 'placa') {
    const { data, error } = await db.from('motorcycles')
      .select(`${CAMPOS_MOTO}, clients(${CAMPOS_CLIENTE}, motorcycles(${CAMPOS_MOTO}))`)
      .ilike('placa', `%${compacto}%`)
      .limit(8);
    if (error) throw error;
    const motoDaPlaca: Record<string, string> = {};
    const vistos = new Map<string, ClienteEncontrado>();
    for (const m of (data ?? []) as unknown as (Motorcycle & { clients: ClienteEncontrado | null })[]) {
      if (!m.clients) continue;
      motoDaPlaca[m.clients.id] = m.id;
      vistos.set(m.clients.id, m.clients);
    }
    return { clientes: [...vistos.values()], motoDaPlaca };
  }
  let q = db.from('clients').select(`${CAMPOS_CLIENTE}, motorcycles(${CAMPOS_MOTO})`).limit(tipo === 'nome' ? 40 : 8);
  if (tipo === 'telefone') {
    q = q.or(`phone.ilike.%${compacto}%,whatsapp.ilike.%${compacto}%,cpf.ilike.%${compacto}%`);
  } else {
    q = q.or(`name.imatch."${inicioDePalavra(t)}",apelido.imatch."${inicioDePalavra(t)}"`);
  }
  const { data, error } = await q.order('name');
  if (error) throw error;
  let clientes = (data ?? []) as unknown as ClienteEncontrado[];
  if (tipo === 'nome') {
    // Quem SE CHAMA assim vem antes de quem tem a palavra no meio do nome
    const alvo = normalizeSearch(t);
    const peso = (c: ClienteEncontrado) => (normalizeSearch(c.name).startsWith(alvo) ? 0 : normalizeSearch(c.apelido).startsWith(alvo) ? 1 : 2);
    clientes = clientes.map((c, i) => ({ c, i })).sort((a, b) => peso(a.c) - peso(b.c) || a.i - b.i).map((x) => x.c).slice(0, 8);
  }
  return { clientes };
}

/** Pra identificar o cliente (ex.: na nota): CPF se tiver; senão o telefone. */
export function documentoDoCliente(c: { cpf?: string | null; whatsapp?: string | null; phone?: string | null }): string {
  const cpf = (c.cpf || '').replace(/\D/g, '');
  if (cpf.length === 11) return `CPF ${cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`;
  if (cpf.length === 14) return `CNPJ ${cpf.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}`;
  const tel = (c.whatsapp || c.phone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (tel.length === 11) return `Tel (${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}`;
  if (tel.length === 10) return `Tel (${tel.slice(0, 2)}) ${tel.slice(2, 6)}-${tel.slice(6)}`;
  return tel ? `Tel ${tel}` : '';
}

export function BuscaCliente({ valor, onChange, onEscolher, onBlur, placeholder, avisoNovo, autoFocus, className }: {
  valor: string;
  onChange: (texto: string) => void;
  onEscolher: (cliente: ClienteEncontrado, motoId?: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Texto quando não acha ninguém (ex.: "Cliente novo: preencha o telefone abaixo"). */
  avisoNovo?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [resultados, setResultados] = useState<ClienteEncontrado[]>([]);
  const [motoDaPlaca, setMotoDaPlaca] = useState<Record<string, string>>({});
  const [buscando, setBuscando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [aberto, setAberto] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const ultima = useRef(0);

  useEffect(() => {
    clearTimeout(timer.current);
    const t = valor.trim();
    if (t.length < 3 || !aberto) { setResultados([]); setBuscou(false); return; }
    timer.current = setTimeout(async () => {
      const id = ++ultima.current;
      setBuscando(true);
      try {
        const r = await buscarClientes(t);
        if (id !== ultima.current) return;   // chegou uma busca mais nova
        setResultados(r.clientes);
        setMotoDaPlaca(r.motoDaPlaca ?? {});
        setBuscou(true);
      } catch {
        if (id === ultima.current) { setResultados([]); setBuscou(true); }
      } finally {
        if (id === ultima.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [valor, aberto]);

  return (
    <div className={cn('space-y-1', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={valor}
          autoFocus={autoFocus}
          onChange={(e) => { setAberto(true); onChange(e.target.value); }}
          onBlur={onBlur}
          placeholder={placeholder ?? 'Nome, telefone, CPF ou placa'}
          className="h-12 pl-9 pr-9 text-base"
        />
        {buscando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {aberto && resultados.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-md">
          {resultados.map((c) => (
            <button key={c.id} type="button"
              onClick={() => { setAberto(false); setResultados([]); onEscolher(c, motoDaPlaca[c.id]); }}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-muted">
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[documentoDoCliente(c), c.apelido].filter(Boolean).join(' · ') || 'sem CPF e sem telefone'}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {(c.motorcycles || []).slice(0, 2).map((m) => (
                  <span key={m.id} className={cn('rounded border px-1.5 py-0.5 font-display text-xs font-semibold tracking-wide',
                    motoDaPlaca[c.id] === m.id ? 'border-primary text-primary' : 'border-border text-muted-foreground')}>{m.placa}</span>
                ))}
              </span>
            </button>
          ))}
        </div>
      )}

      {aberto && buscou && !buscando && resultados.length === 0 && avisoNovo && (
        <p className="text-xs text-muted-foreground">{avisoNovo}</p>
      )}
    </div>
  );
}
