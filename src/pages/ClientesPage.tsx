// Clientes: lista com busca, cadastro e edição sem precisar abrir OS, veículos e histórico
// (OS, compras no balcão, fiado em aberto, encomendas). A busca vai no banco (a loja pode ter
// milhares de clientes); sem busca mostra os 30 mexidos por último.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Car, ChevronRight, Plus, Search, Tags, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { useVehicleLabel } from '@/hooks/useVehicleLabel';
import type { Client, Motorcycle } from '@/hooks/useClients';
import { inicioDePalavra } from '@/lib/textSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { confirmar } from '@/components/v2/Confirmacao';
import { useTiposCliente } from '@/hooks/useTiposCliente';
import { fmtCpf, hojeISO, ondeVale, regraDoTipo, somarDias, tipoEmDia, type TipoCliente } from '@/lib/precoCliente';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const soDigitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');
const fmtTel = (v: string | null | undefined) => {
  const d = soDigitos(v).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '';
};
/** Mesmo telefone com/sem 55 e com/sem o 9 (como o resto do sistema procura) */
const variantesTel = (tel: string | null | undefined) => {
  const limpo = soDigitos(tel);
  if (limpo.length < 8) return [];
  const local = limpo.startsWith('55') && limpo.length > 11 ? limpo.slice(2) : limpo;
  const v = new Set([limpo, local, `55${local}`]);
  if (local.length === 11) v.add(local.slice(0, 2) + local.slice(3));
  if (local.length === 10) v.add(local.slice(0, 2) + '9' + local.slice(2));
  return [...v];
};
const STATUS_OS: Record<string, string> = {
  aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Pronta', concluida_entregue: 'Entregue', cancelada: 'Cancelada',
};

type ClienteComTipo = Client & { tipo_cliente_id?: string | null; tipo_valido_ate?: string | null };
type ClienteForm = Partial<ClienteComTipo> & { name: string };
const VAZIO: ClienteForm = { name: '', phone: '', cpf: '', apelido: '', email: '', instagram: '', endereco: '', cidade: '', state: '', notes: '', birth_date: null, autoriza_lembretes: true, autoriza_instagram: true, tipo_cliente_id: null, tipo_valido_ate: null };

interface Props {
  onOpenOrder?: (id: string) => void;
  onOpenBalcaoOrder?: (id: string) => void;
  onOpenFiado?: (id: string) => void;
}

export default function ClientesPage({ onOpenOrder, onOpenBalcaoOrder, onOpenFiado }: Props) {
  const [aberto, setAberto] = useState<string | 'novo' | 'tipos' | null>(null);
  if (aberto === 'tipos') return <TiposDeCliente onVoltar={() => setAberto(null)} />;
  if (aberto) {
    return <FichaCliente id={aberto === 'novo' ? null : aberto} onVoltar={() => setAberto(null)} onCriado={(id) => setAberto(id)}
      onOpenOrder={onOpenOrder} onOpenBalcaoOrder={onOpenBalcaoOrder} onOpenFiado={onOpenFiado} />;
  }
  return <ListaClientes onAbrir={setAberto} />;
}

// ---------------------------------------------------------------- lista

function ListaClientes({ onAbrir }: { onAbrir: (id: string | 'novo' | 'tipos') => void }) {
  const { storeId, permissions } = useStore();
  const { data: tipos = [] } = useTiposCliente();
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const nomeTipo = useMemo(() => Object.fromEntries(tipos.map((t) => [t.id, t])), [tipos]);
  const hoje = hojeISO();
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [inativos, setInativos] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTermo(busca.trim()), 300); return () => clearTimeout(t); }, [busca]);

  const { data: total } = useQuery({
    queryKey: ['clientes-total', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { count } = await db.from('clients').select('id', { count: 'exact', head: true }).eq('active', true);
      return count ?? 0;
    },
  });

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['clientes-lista', storeId, termo, inativos, filtroTipo],
    enabled: !!storeId,
    queryFn: async (): Promise<Client[]> => {
      const base = () => {
        let q = db.from('clients').select('*');
        if (!inativos) q = q.eq('active', true);
        if (filtroTipo) q = q.eq('tipo_cliente_id', filtroTipo);
        return q;
      };
      if (!termo && filtroTipo) {
        const { data, error } = await base().order('name').limit(500);
        if (error) throw error;
        return data ?? [];
      }
      if (!termo) {
        const { data, error } = await base().order('updated_at', { ascending: false }).limit(30);
        if (error) throw error;
        return data ?? [];
      }
      const dig = soDigitos(termo);
      const placa = termo.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const consultas = [
        base().filter('name', 'imatch', inicioDePalavra(termo)).limit(30),
        base().filter('apelido', 'imatch', inicioDePalavra(termo)).limit(30),
      ];
      if (dig.length >= 4) {
        consultas.push(base().ilike('phone', `%${dig}%`).limit(30));
        consultas.push(base().ilike('cpf', `%${dig}%`).limit(30));
      }
      const [res, veic] = await Promise.all([
        Promise.all(consultas),
        placa.length >= 3 ? db.from('motorcycles').select('client_id').ilike('placa', `%${placa}%`).limit(30) : Promise.resolve({ data: [] }),
      ]);
      const porId = new Map<string, Client>();
      for (const r of res) for (const c of (r.data ?? []) as Client[]) porId.set(c.id, c);
      const idsVeic = [...new Set(((veic.data ?? []) as { client_id: string | null }[]).map((v) => v.client_id).filter((x): x is string => !!x && !porId.has(x)))];
      if (idsVeic.length) {
        const { data } = await base().in('id', idsVeic);
        for (const c of (data ?? []) as Client[]) porId.set(c.id, c);
      }
      return [...porId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    },
  });

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Clientes</h2>
          <p className="text-xs text-muted-foreground">{total != null ? `${total.toLocaleString('pt-BR')} clientes ativos` : ' '}</p>
        </div>
        <div className="flex gap-1.5">
          {(permissions.dar_desconto !== false || tipos.length > 0) && (
            <Button size="sm" variant="outline" onClick={() => onAbrir('tipos')}><Tags className="h-4 w-4 mr-1" /> Preço especial</Button>
          )}
          <Button size="sm" onClick={() => onAbrir('novo')}><Plus className="h-4 w-4 mr-1" /> Novo cliente</Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome, apelido, telefone, CPF ou placa" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={inativos} onCheckedChange={setInativos} /> Mostrar desativados
      </label>
      {tipos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Ver só:</span>
          <Button size="sm" variant={filtroTipo ? 'outline' : 'default'} className="h-7 text-xs" onClick={() => setFiltroTipo(null)}>Todos</Button>
          {tipos.filter((t) => t.ativo).map((t) => (
            <Button key={t.id} size="sm" variant={filtroTipo === t.id ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setFiltroTipo(t.id)}>{t.nome}</Button>
          ))}
        </div>
      )}

      {!termo && !filtroTipo && <p className="text-xs text-muted-foreground">Mexidos por último. Use a busca para achar os outros.</p>}
      {filtroTipo && !isLoading && <p className="text-xs text-muted-foreground">{lista.length} cliente(s) {nomeTipo[filtroTipo]?.nome ?? ''}.</p>}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{termo || filtroTipo ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ainda.'}</p>
      ) : (
        <div className="space-y-1.5">
          {lista.map((c) => (
            <button key={c.id} type="button" onClick={() => onAbrir(c.id)}
              className={`w-full text-left rounded-lg border bg-card px-3 py-2 flex items-center gap-3 hover:bg-muted/40 ${c.active === false ? 'opacity-60' : ''}`}>
              <UserRound className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}{c.apelido ? <span className="text-muted-foreground font-normal"> · {c.apelido}</span> : null}
                  <SeloTipo tipo={nomeTipo[(c as ClienteComTipo).tipo_cliente_id ?? '']} validoAte={(c as ClienteComTipo).tipo_valido_ate} hoje={hoje} />
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {[fmtTel(c.phone), c.cpf ? `CPF ${fmtCpf(c.cpf)}` : null, c.active === false ? 'desativado' : null].filter(Boolean).join(' · ') || 'sem telefone'}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ficha

function FichaCliente({ id, onVoltar, onCriado, onOpenOrder, onOpenBalcaoOrder, onOpenFiado }: {
  id: string | null;
  onVoltar: () => void;
  onCriado: (id: string) => void;
} & Props) {
  const { storeId, permissions } = useStore();
  const qc = useQueryClient();
  const { data: tipos = [] } = useTiposCliente();
  const podeTipo = permissions.dar_desconto !== false;
  const [form, setForm] = useState<ClienteForm>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  const { data: cliente, isLoading } = useQuery({
    queryKey: ['cliente', id],
    staleTime: 0, // ficha sempre atualizada ao abrir
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from('clients').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as ClienteComTipo | null;
    },
  });
  useEffect(() => { if (cliente) setForm({ ...VAZIO, ...cliente, cpf: fmtCpf(cliente.cpf) }); }, [cliente]);

  const set = (campo: keyof ClienteForm, valor: unknown) => setForm((f) => ({ ...f, [campo]: valor }));

  const salvar = async () => {
    const nome = form.name.trim();
    if (!nome) { toast.error('Informe o nome do cliente.'); return; }
    const dados = {
      name: nome,
      phone: soDigitos(form.phone) || null,
      cpf: soDigitos(form.cpf) || null,
      apelido: form.apelido?.trim() || null,
      email: form.email?.trim() || null,
      instagram: form.instagram?.trim().replace(/^@/, '') || null,
      endereco: form.endereco?.trim() || null,
      cidade: form.cidade?.trim() || null,
      state: form.state?.trim().toUpperCase().slice(0, 2) || null,
      notes: form.notes?.trim() || null,
      birth_date: form.birth_date || null,
      autoriza_lembretes: form.autoriza_lembretes !== false,
      autoriza_instagram: form.autoriza_instagram !== false,
      // Tipo só vai junto se mudou (quem não pode dar desconto ainda consegue salvar o resto)
      ...((form.tipo_cliente_id ?? null) !== (cliente?.tipo_cliente_id ?? null) || (form.tipo_valido_ate ?? null) !== (cliente?.tipo_valido_ate ?? null)
        ? { tipo_cliente_id: form.tipo_cliente_id || null, tipo_valido_ate: form.tipo_cliente_id ? form.tipo_valido_ate || null : null }
        : {}),
    };
    // Mesmo telefone em outro cliente: avisa antes de duplicar
    const vars = variantesTel(dados.phone);
    if (vars.length) {
      let q = db.from('clients').select('id, name').in('phone', vars).eq('active', true).limit(1);
      if (id) q = q.neq('id', id);
      const { data: outro } = await q;
      if (outro?.length && !(await confirmar({ titulo: `${outro[0].name} já usa esse telefone`, descricao: 'Salvar mesmo assim (dois cadastros com o mesmo telefone)?', verbo: 'Salvar mesmo assim' }))) return;
    }
    setSalvando(true);
    const res = id
      ? await db.from('clients').update(dados).eq('id', id).select().single()
      : await db.from('clients').insert({ ...dados, store_id: storeId, active: true }).select().single();
    setSalvando(false);
    if (res.error) {
      toast.error(res.error.code === '23505' ? 'Já existe um cliente com esse CPF.' : res.error.code === '42501' ? res.error.message : `Não consegui salvar: ${res.error.message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ['clientes-lista'] });
    qc.invalidateQueries({ queryKey: ['clientes-total'] });
    qc.invalidateQueries({ queryKey: ['cliente', res.data.id] });
    qc.invalidateQueries({ queryKey: ['cliente-tipo', res.data.id] });
    toast.success(id ? 'Cliente atualizado' : 'Cliente cadastrado');
    if (!id) onCriado(res.data.id);
  };

  const alternarAtivo = async () => {
    if (!cliente) return;
    const desativar = cliente.active !== false;
    if (desativar && !(await confirmar({ titulo: `Desativar ${cliente.name}?`, descricao: 'Ele some da busca e das listas. O histórico continua e dá para reativar depois.', verbo: 'Desativar', perigo: true }))) return;
    const { error } = await db.from('clients').update({ active: !desativar }).eq('id', cliente.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['cliente', cliente.id] });
    qc.invalidateQueries({ queryKey: ['clientes-lista'] });
    qc.invalidateQueries({ queryKey: ['clientes-total'] });
    toast.success(desativar ? 'Cliente desativado' : 'Cliente reativado');
  };

  if (id && isLoading) return <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="px-2" onClick={onVoltar}><ArrowLeft className="h-4 w-4" /></Button>
        <h2 className="text-lg font-semibold truncate">{id ? (cliente?.name || 'Cliente') : 'Novo cliente'}</h2>
        {cliente?.active === false && <span className="text-[11px] border rounded px-1.5 text-muted-foreground">desativado</span>}
      </div>

      <div className="rounded-xl border bg-card p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Nome *"><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Campo>
          <Campo label="Apelido"><Input value={form.apelido ?? ''} onChange={(e) => set('apelido', e.target.value)} /></Campo>
          <Campo label="Telefone / WhatsApp"><Input inputMode="tel" value={fmtTel(form.phone) || form.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="(75) 99999-9999" /></Campo>
          <Campo label="CPF"><Input inputMode="numeric" value={form.cpf ?? ''} onChange={(e) => set('cpf', e.target.value)} onBlur={() => set('cpf', fmtCpf(form.cpf))} placeholder="000.000.000-00" /></Campo>
          <Campo label="E-mail"><Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Campo>
          <Campo label="Aniversário"><Input type="date" value={form.birth_date ?? ''} onChange={(e) => set('birth_date', e.target.value || null)} /></Campo>
          <Campo label="Instagram"><Input value={form.instagram ?? ''} onChange={(e) => set('instagram', e.target.value)} placeholder="@cliente" /></Campo>
          <Campo label="Endereço"><Input value={form.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} /></Campo>
          <Campo label="Cidade"><Input value={form.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} /></Campo>
          <Campo label="Estado (UF)"><Input maxLength={2} value={form.state ?? ''} onChange={(e) => set('state', e.target.value.toUpperCase())} /></Campo>
        </div>
        {tipos.length > 0 && <CampoTipo form={form} tipos={tipos} pode={podeTipo}
          mudou={(form.tipo_cliente_id ?? null) !== (cliente?.tipo_cliente_id ?? null) || (form.tipo_valido_ate ?? null) !== (cliente?.tipo_valido_ate ?? null)}
          onMudar={(campos) => setForm((f) => ({ ...f, ...campos }))} />}
        <Campo label="Observações"><Textarea rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Campo>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><Switch checked={form.autoriza_lembretes !== false} onCheckedChange={(v) => set('autoriza_lembretes', v)} /> Aceita lembretes no WhatsApp</label>
          <label className="flex items-center gap-2"><Switch checked={form.autoriza_instagram !== false} onCheckedChange={(v) => set('autoriza_instagram', v)} /> Autoriza foto no Instagram</label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : id ? 'Salvar alterações' : 'Cadastrar cliente'}</Button>
          {cliente && (
            <Button variant="outline" onClick={alternarAtivo}>{cliente.active === false ? 'Reativar cliente' : 'Desativar cliente'}</Button>
          )}
        </div>
      </div>

      {id && cliente && (
        <>
          <Veiculos clienteId={id} />
          <Historico cliente={cliente} onOpenOrder={onOpenOrder} onOpenBalcaoOrder={onOpenBalcaoOrder} onOpenFiado={onOpenFiado} />
        </>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

// ---------------------------------------------------------------- veículos

function Veiculos({ clienteId }: { clienteId: string }) {
  const { storeId, vehicleType } = useStore();
  const { VEHICLES_CAP, VEHICLE_CAP } = useVehicleLabel();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Partial<Motorcycle> | null>(null);

  const { data: veiculos = [] } = useQuery({
    queryKey: ['cliente-veiculos', clienteId],
    staleTime: 0, // ficha sempre atualizada ao abrir
    queryFn: async () => {
      const { data, error } = await db.from('motorcycles').select('*').eq('client_id', clienteId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Motorcycle[];
    },
  });

  const salvar = async () => {
    if (!editando) return;
    const placa = (editando.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) || null;
    if (!placa && !editando.modelo?.trim()) { toast.error('Informe ao menos a placa ou o modelo.'); return; }
    const dados = {
      placa, marca: editando.marca?.trim() || null, modelo: editando.modelo?.trim() || null,
      ano: editando.ano ? Number(editando.ano) : null, cor: editando.cor?.trim() || null,
      ...(vehicleType === 'ambos' ? { tipo: editando.tipo ?? null } : {}),
    };
    // Sem "upsert" pela placa: placa de outro cliente não pode ser puxada para este sem aviso
    const res = editando.id
      ? await db.from('motorcycles').update(dados).eq('id', editando.id)
      : await db.from('motorcycles').insert({ ...dados, client_id: clienteId, store_id: storeId, active: true });
    if (res.error) {
      toast.error(res.error.code === '23505' ? 'Essa placa já está cadastrada em outro cliente.' : `Não consegui salvar: ${res.error.message}`);
      return;
    }
    setEditando(null);
    qc.invalidateQueries({ queryKey: ['cliente-veiculos', clienteId] });
    toast.success(`${VEHICLE_CAP} salvo`);
  };

  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5"><Car className="h-4 w-4" /> {VEHICLES_CAP}</p>
        {!editando && <Button size="sm" variant="outline" onClick={() => setEditando({})}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>}
      </div>
      {veiculos.length === 0 && !editando && <p className="text-xs text-muted-foreground">Nenhum cadastrado.</p>}
      {veiculos.map((v) => (
        <button key={v.id} type="button" onClick={() => setEditando(v)} className="w-full text-left rounded-lg border px-3 py-2 text-sm hover:bg-muted/40">
          <span className="font-medium">{v.placa || 'sem placa'}</span>
          <span className="text-muted-foreground"> · {[v.marca, v.modelo, v.ano, v.cor].filter(Boolean).join(' ') || 'sem modelo'}{v.tipo ? ` · ${v.tipo}` : ''}</span>
        </button>
      ))}
      {editando && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Campo label="Placa"><Input value={editando.placa ?? ''} onChange={(e) => setEditando({ ...editando, placa: e.target.value.toUpperCase() })} /></Campo>
            <Campo label="Marca"><Input value={editando.marca ?? ''} onChange={(e) => setEditando({ ...editando, marca: e.target.value })} /></Campo>
            <Campo label="Modelo"><Input value={editando.modelo ?? ''} onChange={(e) => setEditando({ ...editando, modelo: e.target.value })} /></Campo>
            <Campo label="Ano"><Input inputMode="numeric" value={editando.ano ?? ''} onChange={(e) => setEditando({ ...editando, ano: e.target.value.replace(/\D/g, '').slice(0, 4) as unknown as number })} /></Campo>
            <Campo label="Cor"><Input value={editando.cor ?? ''} onChange={(e) => setEditando({ ...editando, cor: e.target.value })} /></Campo>
            {vehicleType === 'ambos' && (
              <Campo label="Tipo">
                <div className="flex gap-1">
                  {(['moto', 'carro'] as const).map((t) => (
                    <Button key={t} type="button" size="sm" variant={editando.tipo === t ? 'default' : 'outline'} onClick={() => setEditando({ ...editando, tipo: t })}>{t === 'moto' ? 'Moto' : 'Carro'}</Button>
                  ))}
                </div>
              </Campo>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={salvar}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- histórico

function Historico({ cliente, onOpenOrder, onOpenBalcaoOrder, onOpenFiado }: { cliente: Client } & Props) {
  const tels = useMemo(() => variantesTel(cliente.phone), [cliente.phone]);
  const cpf = soDigitos(cliente.cpf);

  const { data, isLoading } = useQuery({
    queryKey: ['cliente-historico', cliente.id, tels.join(','), cpf],
    staleTime: 0, // ficha sempre atualizada ao abrir
    queryFn: async () => {
      // Balcão e fiado antigos não guardam o id do cliente: ligam pelo telefone ou CPF
      const filtroContato = [tels.length ? `client_phone.in.(${tels.join(',')})` : null, cpf ? `client_cpf.eq.${cpf}` : null].filter(Boolean).join(',');
      const [os, balcao, fiados, encomendas] = await Promise.all([
        db.from('service_orders').select('id, created_at, status, equipment, materials(valor, quantidade)').eq('client_id', cliente.id).order('created_at', { ascending: false }).limit(50),
        db.from('balcao_orders').select('id, numero, created_at, status, total')
          .or([`client_id.eq.${cliente.id}`, filtroContato].filter(Boolean).join(',')).in('status', ['finalizada', 'fiado'])
          .order('created_at', { ascending: false }).limit(50),
        db.from('fiados').select('id, created_at, status, original_amount, amount_paid, interest_accrued, origin_type')
          .or([`client_id.eq.${cliente.id}`, filtroContato].filter(Boolean).join(',')).neq('status', 'pago').order('created_at', { ascending: false }).limit(50),
        db.from('encomendas').select('id, created_at, status, peca, quantidade, preco_venda').eq('client_id', cliente.id).order('created_at', { ascending: false }).limit(20),
      ]);
      const valorOS = (o: { materials?: { valor: number; quantidade: string }[] }) =>
        (o.materials ?? []).reduce((s, m) => s + Number(m.valor || 0) * (parseFloat(String(m.quantidade).replace(',', '.')) || 0), 0);
      return {
        os: ((os.data ?? []) as { id: string; created_at: string; status: string; equipment: string; materials?: { valor: number; quantidade: string }[] }[]).map((o) => ({ ...o, valor: valorOS(o) })),
        balcao: (balcao.data ?? []) as { id: string; numero: number; created_at: string; status: string; total: number }[],
        fiados: ((fiados.data ?? []) as { id: string; created_at: string; status: string; original_amount: number; amount_paid: number; interest_accrued: number }[])
          .map((f) => ({ ...f, saldo: Number(f.original_amount || 0) + Number(f.interest_accrued || 0) - Number(f.amount_paid || 0) })),
        encomendas: (encomendas.data ?? []) as { id: string; created_at: string; status: string; peca: string; quantidade: number; preco_venda: number }[],
      };
    },
  });

  if (isLoading || !data) return <p className="text-xs text-muted-foreground">Carregando histórico...</p>;
  const gastoOS = data.os.filter((o) => o.status === 'concluida_entregue').reduce((s, o) => s + o.valor, 0);
  const gastoBalcao = data.balcao.reduce((s, b) => s + Number(b.total || 0), 0);
  const deve = data.fiados.reduce((s, f) => s + Math.max(0, f.saldo), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Cartao titulo="OS" valor={String(data.os.length)} />
        <Cartao titulo="Gastou (OS + balcão)" valor={brl(gastoOS + gastoBalcao)} />
        <Cartao titulo="Fiado em aberto" valor={brl(deve)} destaque={deve > 0} />
      </div>

      <Bloco titulo="Ordens de serviço" vazio="Nenhuma OS.">
        {data.os.map((o) => (
          <Linha key={o.id} onClick={onOpenOrder ? () => onOpenOrder(o.id) : undefined}
            esquerda={<>{dataBR(o.created_at)} · {o.equipment || 'OS'}</>} sub={STATUS_OS[o.status] ?? o.status} direita={brl(o.valor)} />
        ))}
      </Bloco>
      <Bloco titulo="Compras no balcão" vazio="Nenhuma compra (busca pelo telefone ou CPF).">
        {data.balcao.map((b) => (
          <Linha key={b.id} onClick={onOpenBalcaoOrder ? () => onOpenBalcaoOrder(b.id) : undefined}
            esquerda={<>{dataBR(b.created_at)} · Nota #{b.numero}</>} sub={b.status === 'fiado' ? 'no fiado' : 'paga'} direita={brl(Number(b.total || 0))} />
        ))}
      </Bloco>
      <Bloco titulo="Fiado em aberto" vazio="Nada em aberto.">
        {data.fiados.map((f) => (
          <Linha key={f.id} onClick={onOpenFiado ? () => onOpenFiado(f.id) : undefined}
            esquerda={<>{dataBR(f.created_at)}</>} sub={f.status} direita={brl(f.saldo)} />
        ))}
      </Bloco>
      {data.encomendas.length > 0 && (
        <Bloco titulo="Encomendas" vazio="">
          {data.encomendas.map((e) => (
            <Linha key={e.id} esquerda={<>{dataBR(e.created_at)} · {e.peca}</>} sub={e.status} direita={brl(Number(e.preco_venda || 0) * Number(e.quantidade || 1))} />
          ))}
        </Bloco>
      )}
    </div>
  );
}

function Cartao({ titulo, valor, destaque }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-2.5">
      <p className="text-[11px] text-muted-foreground">{titulo}</p>
      <p className={`text-sm font-bold ${destaque ? 'text-red-500' : ''}`}>{valor}</p>
    </div>
  );
}

function Bloco({ titulo, vazio, children }: { titulo: string; vazio: string; children: React.ReactNode }) {
  const temItens = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="rounded-xl border bg-card p-3 space-y-1.5">
      <p className="text-sm font-semibold">{titulo}</p>
      {temItens ? children : <p className="text-xs text-muted-foreground">{vazio}</p>}
    </div>
  );
}

function Linha({ esquerda, sub, direita, onClick }: { esquerda: React.ReactNode; sub?: string; direita: string; onClick?: () => void }) {
  return (
    <button type="button" disabled={!onClick} onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40 disabled:hover:bg-transparent disabled:cursor-default">
      <div className="min-w-0">
        <p className="text-sm truncate">{esquerda}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      <span className="text-sm font-medium flex-shrink-0">{direita}</span>
    </button>
  );
}

// ---------------------------------------------------------------- tipos de cliente

function SeloTipo({ tipo, validoAte, hoje }: { tipo?: TipoCliente; validoAte?: string | null; hoje: string }) {
  if (!tipo) return null;
  const ok = tipoEmDia(tipo, validoAte, hoje);
  return (
    <span className={`ml-1.5 text-[10px] font-semibold rounded px-1.5 py-0.5 align-middle ${ok ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
      {tipo.nome}{ok ? '' : ' (vencido)'}
    </span>
  );
}

function CampoTipo({ form, tipos, pode, mudou, onMudar }: {
  form: ClienteForm; tipos: TipoCliente[]; pode: boolean; mudou: boolean;
  onMudar: (c: Partial<ClienteForm>) => void;
}) {
  const hoje = hojeISO();
  const tipo = tipos.find((t) => t.id === form.tipo_cliente_id);
  const emDia = tipoEmDia(tipo, form.tipo_valido_ate, hoje);
  const escolher = (id: string) => {
    const t = tipos.find((x) => x.id === id);
    onMudar({ tipo_cliente_id: t?.id ?? null, tipo_valido_ate: t?.validade_dias ? somarDias(hoje, t.validade_dias) : null });
  };
  return (
    <div className="rounded-lg border p-2.5 space-y-2">
      <p className="text-xs font-semibold">Preço especial</p>
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" disabled={!pode} variant={!form.tipo_cliente_id ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => escolher('')}>Normal</Button>
        {tipos.filter((t) => t.ativo || t.id === form.tipo_cliente_id).map((t) => (
          <Button key={t.id} type="button" size="sm" disabled={!pode} variant={form.tipo_cliente_id === t.id ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => escolher(t.id)}>{t.nome}</Button>
        ))}
      </div>
      {tipo && (
        <>
          <p className="text-[11px] text-muted-foreground">{regraDoTipo(tipo)}</p>
          {tipo.validade_dias ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Vale até</Label>
                <Input type="date" className="h-8 w-40" disabled={!pode} value={form.tipo_valido_ate ?? ''} onChange={(e) => onMudar({ tipo_valido_ate: e.target.value || null })} />
              </div>
              {pode && (
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => onMudar({ tipo_valido_ate: somarDias(hoje, tipo.validade_dias!) })}>
                  Renovar {tipo.validade_dias} dias
                </Button>
              )}
              <span className={`text-xs font-medium ${emDia ? 'text-emerald-500' : 'text-red-500'}`}>{emDia ? 'Em dia' : 'Vencido: paga preço normal'}</span>
            </div>
          ) : null}
        </>
      )}
      {!pode && <p className="text-[11px] text-muted-foreground">Só quem pode dar desconto muda o preço especial do cliente.</p>}
      {pode && mudou && <p className="text-[11px] font-medium text-amber-500">Clique em "Salvar alterações" para gravar.</p>}
    </div>
  );
}

const TIPO_NOVO = { nome: '', desconto_pct: '10', usa_preco_atacado: false, validade_dias: '30', compra_minima: '', vale_pecas_os: true, vale_servico_os: false };

function TiposDeCliente({ onVoltar }: { onVoltar: () => void }) {
  const { permissions } = useStore();
  const pode = permissions.dar_desconto !== false;
  const qc = useQueryClient();
  const { data: tipos = [], isLoading } = useTiposCliente();
  const [editando, setEditando] = useState<(typeof TIPO_NOVO & { id?: string; ativo?: boolean }) | null>(null);
  const [salvando, setSalvando] = useState(false);
  const num = (v: string) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

  const salvar = async () => {
    if (!editando) return;
    const nome = editando.nome.trim();
    if (!nome) { toast.error('Dê um nome ao tipo (ex.: Lojista).'); return; }
    const pct = num(editando.desconto_pct);
    if (pct < 0 || pct > 100) { toast.error('Desconto entre 0 e 100%.'); return; }
    const dias = editando.validade_dias.trim() ? Math.round(num(editando.validade_dias)) : null;
    if (dias !== null && dias <= 0) { toast.error('Validade em dias maior que zero, ou deixe vazio para não vencer.'); return; }
    const dados = { nome, desconto_pct: pct, usa_preco_atacado: editando.usa_preco_atacado, validade_dias: dias, compra_minima: num(editando.compra_minima), ativo: editando.ativo !== false, vale_pecas_os: editando.vale_pecas_os, vale_servico_os: editando.vale_servico_os };
    setSalvando(true);
    const res = editando.id ? await db.from('tipos_cliente').update(dados).eq('id', editando.id) : await db.from('tipos_cliente').insert(dados);
    setSalvando(false);
    if (res.error) { toast.error(`Não consegui salvar: ${res.error.message}`); return; }
    qc.invalidateQueries({ queryKey: ['tipos-cliente'] });
    setEditando(null);
    toast.success('Grupo salvo');
  };

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="px-2" onClick={onVoltar}><ArrowLeft className="h-4 w-4" /></Button>
        <h2 className="text-lg font-semibold">Preço especial</h2>
      </div>
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
        Aqui você cria o <b>grupo</b> (ex.: <b>Lojista</b>, Lava-jato, Frota), uma vez só. Não é o cadastro do cliente.
        Para colocar um cliente no grupo, abra a <b>ficha do cliente</b> e escolha o grupo em "Preço especial".
      </div>
      <p className="text-xs text-muted-foreground">
        O cliente do grupo paga o preço dele na nota de balcão e na OS (o preço entra sozinho ao escolher o cliente).
        Item digitado à mão (fora do estoque) sai com o desconto em %. Preço mudado depois, item por item, fica como foi digitado.
        Com validade, o preço especial vence se ele parar de comprar (o cadastro continua ativo); uma compra a partir do valor mínimo renova sozinha.
      </p>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : tipos.length === 0 && !editando ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhum grupo ainda.</p>
      ) : null}
      {tipos.map((t) => (
        <button key={t.id} type="button" disabled={!pode} onClick={() => setEditando({ id: t.id, ativo: t.ativo, nome: t.nome, desconto_pct: String(t.desconto_pct), usa_preco_atacado: t.usa_preco_atacado, validade_dias: t.validade_dias ? String(t.validade_dias) : '', compra_minima: t.compra_minima ? String(t.compra_minima) : '', vale_pecas_os: t.vale_pecas_os !== false, vale_servico_os: !!t.vale_servico_os })}
          className={`w-full text-left rounded-lg border bg-card px-3 py-2 hover:bg-muted/40 ${t.ativo ? '' : 'opacity-60'}`}>
          <p className="text-sm font-medium">{t.nome}{t.ativo ? '' : ' · desativado'}</p>
          <p className="text-xs text-muted-foreground">{regraDoTipo(t)}</p>
          <p className="text-[11px] text-muted-foreground">{ondeVale(t)}</p>
        </button>
      ))}
      {pode && !editando && <Button size="sm" onClick={() => setEditando({ ...TIPO_NOVO, nome: tipos.length === 0 ? 'Lojista' : '' })}><Plus className="h-4 w-4 mr-1" /> Novo grupo</Button>}
      {!pode && <p className="text-xs text-muted-foreground">Só quem pode dar desconto cria ou muda os grupos.</p>}

      {editando && (
        <div className="rounded-xl border bg-card p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Nome do grupo"><Input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} placeholder="Lojista, Lava-jato, Frota..." /></Campo>
            <Campo label="Desconto (%)"><Input inputMode="decimal" value={editando.desconto_pct} onChange={(e) => setEditando({ ...editando, desconto_pct: e.target.value })} /></Campo>
            <Campo label="Validade (dias, vazio = não vence)"><Input inputMode="numeric" value={editando.validade_dias} onChange={(e) => setEditando({ ...editando, validade_dias: e.target.value.replace(/\D/g, '') })} placeholder="30" /></Campo>
            <Campo label="Compra mínima para renovar (R$)"><Input inputMode="decimal" value={editando.compra_minima} onChange={(e) => setEditando({ ...editando, compra_minima: e.target.value })} placeholder="0 = qualquer compra" /></Campo>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Switch checked={editando.usa_preco_atacado} onCheckedChange={(v) => setEditando({ ...editando, usa_preco_atacado: v })} />
            <span>Usar o <b>preço de atacado</b> do produto<span className="block text-xs text-muted-foreground">Preenchido no cadastro do produto. Produto sem preço de atacado usa o desconto acima.</span></span>
          </label>
          <div className="rounded-lg border p-2.5 space-y-2">
            <p className="text-xs font-semibold">Onde vale (o balcão sempre vale)</p>
            <label className="flex items-start gap-2 text-sm">
              <Switch checked={editando.vale_pecas_os} onCheckedChange={(v) => setEditando({ ...editando, vale_pecas_os: v })} />
              <span>Peças na OS<span className="block text-xs text-muted-foreground">Peça do estoque sai com o preço do grupo; peça digitada à mão sai com o desconto em %.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Switch checked={editando.vale_servico_os} onCheckedChange={(v) => setEditando({ ...editando, vale_servico_os: v })} />
              <span>Serviço (mão de obra) na OS<span className="block text-xs text-muted-foreground">O valor digitado do serviço sai com o desconto em % acima.</span></span>
            </label>
          </div>
          {editando.id && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={editando.ativo !== false} onCheckedChange={(v) => setEditando({ ...editando, ativo: v })} /> Grupo ativo
            </label>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
