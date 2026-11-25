// Equipe v2 (25/11): um cadastro por PESSOA (tabela colaboradores) com dados pessoais, cargo, Pix
// e o que ela faz. Por baixo continuam os "papéis" que o sistema todo usa:
//   faz serviço na OS  -> mechanics (comissão de serviço/peças)
//   atende no balcão   -> staff_members (comissão de venda)
// Gravação só pela função salvar_pessoa_equipe (acerta pessoa + papéis juntos).
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Camera, ChevronRight, Plus, Search, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DEFAULT_PERMISSIONS, MAX_MEMBERS } from './CollaboratorsPage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Pessoa {
  id: string;
  nome: string;
  apelido: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cargo: string | null;
  data_admissao: string | null;
  pix_tipo: string | null;
  pix_chave: string | null;
  observacoes: string | null;
  foto_url: string | null;
  ativo: boolean;
  faz_os: boolean;
  atende_balcao: boolean;
  forma_pagamento: 'fixo' | 'fixo_comissao' | 'comissao';
  valor_fixo: number;
  periodicidade: 'semanal' | 'quinzenal' | 'mensal';
  dia_pagamento: number | null;
  mechanic_id: string | null;
  staff_member_id: string | null;
}
interface Mecanico { id: string; commission_rate: number | null; commission_parts_rate: number | null }
interface Atendente { id: string; commission_rate: number | null; commission_on_parts: boolean | null }
interface Membro { id: string; email: string | null; role: string; active: boolean; permissions: Record<string, boolean> | null; colaborador_tipo: string | null; colaborador_id: string | null }

const CARGOS_PADRAO = ['Mecânico', 'Capoteiro', 'Atendente', 'Gerente', 'Auxiliar', 'Lavador', 'Dono'];
const TIPOS_PIX = [
  { v: 'cpf', n: 'CPF' }, { v: 'telefone', n: 'Telefone' }, { v: 'email', n: 'E-mail' }, { v: 'aleatoria', n: 'Chave aleatória' },
];
const FORMAS_PAGTO: { v: Form['forma_pagamento']; n: string }[] = [
  { v: 'comissao', n: 'Só comissão' }, { v: 'fixo_comissao', n: 'Fixo + comissão' }, { v: 'fixo', n: 'Só fixo' },
];
const PERIODOS: { v: Form['periodicidade']; n: string }[] = [
  { v: 'semanal', n: 'Semana' }, { v: 'quinzenal', n: 'Quinzena' }, { v: 'mensal', n: 'Mês' },
];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const soDigitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');
const fmtTel = (v: string | null | undefined) => {
  const d = soDigitos(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '';
};

function useEquipe() {
  const { storeId, isOwner } = useStore();
  const pessoas = useQuery({
    queryKey: ['colaboradores', storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db.from('colaboradores').select('*').order('nome');
      if (error) throw error;
      return (data ?? []) as Pessoa[];
    },
  });
  const membros = useQuery({
    queryKey: ['collaborators', storeId],
    enabled: !!storeId && isOwner,
    queryFn: async () => ((await db.from('store_members').select('id, email, role, active, permissions, colaborador_tipo, colaborador_id').eq('store_id', storeId).eq('active', true)).data ?? []) as Membro[],
  });
  return { pessoas, membros: membros.data ?? [] };
}

/** Login ligado a esta pessoa (pelo papel de mecânico ou de atendente). */
const loginDa = (p: Pessoa, membros: Membro[]) =>
  membros.find((m) => (m.colaborador_tipo === 'mecanico' && m.colaborador_id && m.colaborador_id === p.mechanic_id)
    || (m.colaborador_tipo === 'atendente' && m.colaborador_id && m.colaborador_id === p.staff_member_id));

export function MechanicsPage() {
  const [aberto, setAberto] = useState<string | 'nova' | null>(null);
  if (aberto) return <FichaPessoa id={aberto === 'nova' ? null : aberto} onVoltar={() => setAberto(null)} onCriada={setAberto} />;
  return <ListaEquipe onAbrir={setAberto} />;
}

// ---------------------------------------------------------------- lista

function ListaEquipe({ onAbrir }: { onAbrir: (id: string | 'nova') => void }) {
  const { pessoas, membros } = useEquipe();
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (pessoas.data ?? [])
      .filter((p) => inativos || p.ativo)
      .filter((p) => !q || [p.nome, p.apelido, p.cargo, p.telefone].some((x) => (x || '').toLowerCase().includes(q)));
  }, [pessoas.data, busca, inativos]);
  const ativos = (pessoas.data ?? []).filter((p) => p.ativo).length;

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Equipe</h2>
          <p className="text-xs text-muted-foreground">{ativos} {ativos === 1 ? 'pessoa ativa' : 'pessoas ativas'}</p>
        </div>
        <Button size="sm" onClick={() => onAbrir('nova')}><Plus className="h-4 w-4 mr-1" /> Novo colaborador</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome, cargo ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={inativos} onCheckedChange={setInativos} /> Mostrar inativos
      </label>

      {pessoas.isLoading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{busca ? 'Ninguém encontrado.' : 'Nenhum colaborador ainda.'}</p>
      ) : (
        <div className="space-y-1.5">
          {lista.map((p) => {
            const login = loginDa(p, membros);
            return (
              <button key={p.id} type="button" onClick={() => onAbrir(p.id)}
                className={`w-full text-left rounded-lg border bg-card px-3 py-2 flex items-center gap-3 hover:bg-muted/40 ${p.ativo ? '' : 'opacity-60'}`}>
                <Avatar className="h-10 w-10">
                  <AvatarImage src={p.foto_url || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground">{p.nome.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.nome}{!p.ativo && <span className="text-xs text-muted-foreground"> · inativo</span>}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {p.cargo && <span className="text-[11px] text-muted-foreground">{p.cargo}</span>}
                    {p.faz_os && <span className="text-[10px] border rounded px-1">Oficina</span>}
                    {p.atende_balcao && <span className="text-[10px] border rounded px-1">Balcão</span>}
                    {login && <span className="text-[10px] border rounded px-1 border-green-600 text-green-600">usa o app</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ficha

type Form = Omit<Pessoa, 'id' | 'mechanic_id' | 'staff_member_id' | 'valor_fixo'> & {
  valor_fixo: string;
  comissao_servicos: string; comissao_pecas: string; comissao_balcao: string; comissao_balcao_pecas: boolean;
};
const VAZIO: Form = {
  nome: '', apelido: '', cpf: '', telefone: '', email: '', data_nascimento: null, endereco: '', cidade: '', estado: '',
  cargo: '', data_admissao: null, pix_tipo: 'cpf', pix_chave: '', observacoes: '', foto_url: null, ativo: true,
  faz_os: false, atende_balcao: false, forma_pagamento: 'comissao', valor_fixo: '0', periodicidade: 'semanal', dia_pagamento: null,
  comissao_servicos: '0', comissao_pecas: '0', comissao_balcao: '0', comissao_balcao_pecas: false,
};

function FichaPessoa({ id, onVoltar, onCriada }: { id: string | null; onVoltar: () => void; onCriada: (id: string) => void }) {
  const { pessoas, membros } = useEquipe();
  const { isOwner, storeId } = useStore();
  const qc = useQueryClient();
  const pessoa = id ? (pessoas.data ?? []).find((p) => p.id === id) : undefined;
  const [form, setForm] = useState<Form>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState(false);

  // Comissões ficam nos papéis: busca direto (lista em memória podia estar velha e salvar 0%)
  const papeis = useQuery({
    queryKey: ['equipe-papeis', pessoa?.mechanic_id ?? null, pessoa?.staff_member_id ?? null],
    enabled: !!pessoa,
    staleTime: 0,
    queryFn: async () => {
      const [m, a] = await Promise.all([
        pessoa?.mechanic_id ? db.from('mechanics').select('id, commission_rate, commission_parts_rate').eq('id', pessoa.mechanic_id).maybeSingle() : Promise.resolve({ data: null }),
        pessoa?.staff_member_id ? db.from('staff_members').select('id, commission_rate, commission_on_parts').eq('id', pessoa.staff_member_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return { mec: m.data as Mecanico | null, ate: a.data as Atendente | null };
    },
  });

  useEffect(() => {
    if (!pessoa || carregado || !papeis.data || papeis.isFetching) return;
    const { mec, ate } = papeis.data;
    setForm({
      ...VAZIO, ...pessoa,
      valor_fixo: String(pessoa.valor_fixo ?? 0),
      comissao_servicos: String(mec?.commission_rate ?? 0),
      comissao_pecas: String(mec?.commission_parts_rate ?? 0),
      comissao_balcao: String(ate?.commission_rate ?? 0),
      comissao_balcao_pecas: !!ate?.commission_on_parts,
    });
    setCarregado(true);
  }, [pessoa, papeis.data, papeis.isFetching, carregado]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const cargos = useMemo(() => [...new Set([...CARGOS_PADRAO, ...(pessoas.data ?? []).map((p) => p.cargo).filter((c): c is string => !!c)])], [pessoas.data]);

  const trocarFoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { toast.error('Foto muito grande! Máximo 2MB'); return; }
      const reader = new FileReader();
      reader.onloadend = () => set('foto_url', reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const salvar = async () => {
    if (!form.nome.trim()) { toast.error('Informe o nome.'); return; }
    const num = (v: string) => Math.max(0, Math.min(100, parseFloat(String(v).replace(',', '.')) || 0));
    setSalvando(true);
    const { data, error } = await db.rpc('salvar_pessoa_equipe', {
      p: {
        id: id ?? '', nome: form.nome, apelido: form.apelido, cpf: form.cpf, telefone: form.telefone, email: form.email,
        data_nascimento: form.data_nascimento ?? '', endereco: form.endereco, cidade: form.cidade, estado: form.estado,
        cargo: form.cargo, data_admissao: form.data_admissao ?? '', pix_tipo: form.pix_tipo, pix_chave: form.pix_chave,
        observacoes: form.observacoes, foto_url: form.foto_url ?? '', ativo: form.ativo,
        faz_os: form.faz_os, comissao_servicos: num(form.comissao_servicos), comissao_pecas: num(form.comissao_pecas),
        atende_balcao: form.atende_balcao, comissao_balcao: num(form.comissao_balcao), comissao_balcao_pecas: form.comissao_balcao_pecas,
        forma_pagamento: form.forma_pagamento, valor_fixo: Math.max(0, parseFloat(String(form.valor_fixo).replace(',', '.')) || 0),
        periodicidade: form.periodicidade, dia_pagamento: form.dia_pagamento ?? '',
      },
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    for (const k of ['colaboradores', 'mechanics', 'staff-members', 'equipe-papeis']) qc.invalidateQueries({ queryKey: [k] });
    toast.success(id ? 'Colaborador atualizado' : 'Colaborador cadastrado');
    if (!id) { setCarregado(false); onCriada(data as string); }
  };

  if (id && (pessoas.isLoading || (pessoa && !carregado))) return <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>;
  if (id && !pessoa) return <p className="text-sm text-muted-foreground py-6 text-center">Colaborador não encontrado.</p>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="px-2" onClick={onVoltar}><ArrowLeft className="h-4 w-4" /></Button>
        <h2 className="text-lg font-semibold truncate">{id ? pessoa?.nome : 'Novo colaborador'}</h2>
      </div>

      <Secao titulo="Dados pessoais">
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14">
            <AvatarImage src={form.foto_url || undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground">{(form.nome || '?').charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <Button type="button" variant="outline" size="sm" onClick={trocarFoto}><Camera className="h-4 w-4 mr-1" /> {form.foto_url ? 'Trocar foto' : 'Adicionar foto'}</Button>
          {form.foto_url && <Button type="button" variant="ghost" size="sm" onClick={() => set('foto_url', null)}>Tirar foto</Button>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Nome *"><Input value={form.nome} onChange={(e) => set('nome', e.target.value)} /></Campo>
          <Campo label="Apelido"><Input value={form.apelido ?? ''} onChange={(e) => set('apelido', e.target.value)} /></Campo>
          <Campo label="CPF"><Input inputMode="numeric" value={form.cpf ?? ''} onChange={(e) => set('cpf', e.target.value)} /></Campo>
          <Campo label="Telefone / WhatsApp"><Input inputMode="tel" value={fmtTel(form.telefone) || form.telefone || ''} onChange={(e) => set('telefone', e.target.value)} /></Campo>
          <Campo label="E-mail"><Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Campo>
          <Campo label="Nascimento"><Input type="date" value={form.data_nascimento ?? ''} onChange={(e) => set('data_nascimento', e.target.value || null)} /></Campo>
          <Campo label="Endereço"><Input value={form.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} /></Campo>
          <Campo label="Cidade"><Input value={form.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} /></Campo>
          <Campo label="Estado (UF)"><Input maxLength={2} value={form.estado ?? ''} onChange={(e) => set('estado', e.target.value.toUpperCase())} /></Campo>
        </div>
      </Secao>

      <Secao titulo="Trabalho">
        <Campo label="Cargo">
          <Input value={form.cargo ?? ''} onChange={(e) => set('cargo', e.target.value)} placeholder="Escolha abaixo ou digite" />
          <div className="flex flex-wrap gap-1 pt-1">
            {cargos.map((c) => (
              <Button key={c} type="button" size="sm" variant={form.cargo === c ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => set('cargo', c)}>{c}</Button>
            ))}
          </div>
        </Campo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Data de admissão"><Input type="date" value={form.data_admissao ?? ''} onChange={(e) => set('data_admissao', e.target.value || null)} /></Campo>
          <label className="flex items-center gap-2 text-sm pt-5"><Switch checked={form.ativo} onCheckedChange={(v) => set('ativo', v)} /> Ativo (trabalha na loja)</label>
        </div>
      </Secao>

      <Secao titulo="O que faz">
        <div className="rounded-lg border p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={form.faz_os} onCheckedChange={(v) => set('faz_os', v)} /> Faz serviço na OS (oficina / capotaria)</label>
          {form.faz_os && (
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Comissão serviços (%)"><Input inputMode="decimal" value={form.comissao_servicos} onChange={(e) => set('comissao_servicos', e.target.value)} /></Campo>
              <Campo label="Comissão peças (%)"><Input inputMode="decimal" value={form.comissao_pecas} onChange={(e) => set('comissao_pecas', e.target.value)} /></Campo>
            </div>
          )}
        </div>
        <div className="rounded-lg border p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={form.atende_balcao} onCheckedChange={(v) => set('atende_balcao', v)} /> Atende no balcão (vendas)</label>
          {form.atende_balcao && (
            <div className="space-y-2">
              <Campo label="Comissão nas vendas (%)"><Input inputMode="decimal" value={form.comissao_balcao} onChange={(e) => set('comissao_balcao', e.target.value)} /></Campo>
              <label className="flex items-center gap-2 text-xs"><Switch checked={form.comissao_balcao_pecas} onCheckedChange={(v) => set('comissao_balcao_pecas', v)} /> Comissão também nas peças das OS que ele abrir</label>
            </div>
          )}
        </div>
        {!form.faz_os && !form.atende_balcao && (
          <p className="text-[11px] text-muted-foreground">Sem nenhum marcado, a pessoa fica só no cadastro (não aparece para escolher na OS nem no balcão).</p>
        )}
      </Secao>

      <Secao titulo="Como recebe">
        <div className="flex flex-wrap gap-1">
          {FORMAS_PAGTO.map((f) => (
            <Button key={f.v} type="button" size="sm" variant={form.forma_pagamento === f.v ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => set('forma_pagamento', f.v)}>{f.n}</Button>
          ))}
        </div>
        {form.forma_pagamento !== 'comissao' && (
          <Campo label={`Valor fixo por ${form.periodicidade === 'semanal' ? 'semana' : form.periodicidade === 'quinzenal' ? 'quinzena' : 'mês'} (R$)`}>
            <Input inputMode="decimal" value={form.valor_fixo} onChange={(e) => set('valor_fixo', e.target.value)} />
          </Campo>
        )}
        {form.forma_pagamento === 'fixo' && (form.faz_os || form.atende_balcao) && (
          <p className="text-[11px] text-muted-foreground">Só fixo: a comissão das OS e vendas não entra no pagamento.</p>
        )}
        <Campo label="Recebe a cada">
          <div className="flex flex-wrap gap-1">
            {PERIODOS.map((pp) => (
              <Button key={pp.v} type="button" size="sm" variant={form.periodicidade === pp.v ? 'default' : 'outline'} className="h-8 text-xs"
                onClick={() => setForm((f) => ({ ...f, periodicidade: pp.v, dia_pagamento: null }))}>{pp.n}</Button>
            ))}
          </div>
        </Campo>
        {form.periodicidade === 'semanal' && (
          <Campo label="Dia da semana do pagamento">
            <div className="flex flex-wrap gap-1">
              {DIAS_SEMANA.map((d, i) => (
                <Button key={d} type="button" size="sm" variant={(form.dia_pagamento ?? -1) === i ? 'default' : 'outline'} className="h-8 w-11 text-xs" onClick={() => set('dia_pagamento', i)}>{d}</Button>
              ))}
            </div>
            {form.dia_pagamento == null && <p className="text-[11px] text-muted-foreground">Sem escolher: usa o dia de acerto da loja (sábado, se não mudou).</p>}
          </Campo>
        )}
        {form.periodicidade === 'quinzenal' && <p className="text-xs text-muted-foreground">Paga no dia 15 e no último dia do mês.</p>}
        {form.periodicidade === 'mensal' && (
          <Campo label="Dia do mês do pagamento">
            <Input inputMode="numeric" className="w-24" value={form.dia_pagamento ?? ''} placeholder="5"
              onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); set('dia_pagamento', Number.isNaN(n) ? null : Math.min(31, Math.max(1, n))); }} />
          </Campo>
        )}
      </Secao>

      <Secao titulo="Dados para pagar">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo label="Tipo da chave Pix">
            <div className="flex flex-wrap gap-1">
              {TIPOS_PIX.map((t) => (
                <Button key={t.v} type="button" size="sm" variant={form.pix_tipo === t.v ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => set('pix_tipo', t.v)}>{t.n}</Button>
              ))}
            </div>
          </Campo>
          <div className="sm:col-span-2"><Campo label="Chave Pix"><Input value={form.pix_chave ?? ''} onChange={(e) => set('pix_chave', e.target.value)} /></Campo></div>
        </div>
      </Secao>

      <Secao titulo="Observações">
        <Textarea rows={2} value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
      </Secao>

      <Button className="w-full" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : id ? 'Salvar alterações' : 'Cadastrar colaborador'}</Button>

      {id && pessoa && isOwner && <ContaNoApp pessoa={pessoa} membros={membros} storeId={storeId} />}
    </div>
  );
}

// ---------------------------------------------------------------- conta no app (só dono)

function ContaNoApp({ pessoa, membros, storeId }: { pessoa: Pessoa; membros: Membro[]; storeId: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentPlan } = usePlanFeatures();
  const [email, setEmail] = useState(pessoa.email ?? '');
  const [enviando, setEnviando] = useState(false);
  const login = loginDa(pessoa, membros);
  const papel = pessoa.mechanic_id && pessoa.faz_os ? { tipo: 'mecanico', id: pessoa.mechanic_id }
    : pessoa.staff_member_id && pessoa.atende_balcao ? { tipo: 'atendente', id: pessoa.staff_member_id } : null;
  const max = MAX_MEMBERS[currentPlan] ?? Infinity;
  const noLimite = max !== Infinity && membros.length >= max;
  const semPessoa = membros.filter((m) => m.role !== 'owner' && !m.colaborador_id);

  const darAcesso = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@')) { toast.error('Informe o e-mail da pessoa.'); return; }
    if (!papel) return;
    setEnviando(true);
    try {
      // Já existe login com esse e-mail na loja: só liga à pessoa
      let membro = membros.find((m) => (m.email || '').toLowerCase() === e);
      const jaTinha = !!membro;
      if (!membro && noLimite) throw new Error(`Seu plano já está no limite de ${max} logins. Faça upgrade para convidar mais gente.`);
      if (!membro) {
        const { error } = await supabase.functions.invoke('invite-collaborator', { body: { email: e, store_id: storeId, permissions: DEFAULT_PERMISSIONS } });
        if (error) throw error;
        const { data } = await db.from('store_members').select('id, email, role, active, permissions, colaborador_tipo, colaborador_id').eq('store_id', storeId).ilike('email', e).eq('active', true).maybeSingle();
        membro = data as Membro | undefined;
      }
      if (!membro) throw new Error('Convite enviado, mas não achei o login. Ligue em Colaboradores.');
      if (membro.role === 'owner') throw new Error('Esse e-mail é do proprietário.');
      const { error: e2 } = await db.rpc('salvar_colaborador', {
        p_member_id: membro.id, p_permissions: { ...DEFAULT_PERMISSIONS, ...(membro.permissions || {}) }, p_colaborador_tipo: papel.tipo, p_colaborador_id: papel.id,
      });
      if (e2) throw e2;
      qc.invalidateQueries({ queryKey: ['collaborators', storeId] });
      toast.success(jaTinha ? `Login ${e} ligado a ${pessoa.nome}.` : `Convite enviado para ${e}. Avise para olhar o e-mail (e o spam).`);
    } catch (err) {
      toast.error((err as Error).message || 'Não consegui dar o acesso.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Secao titulo="Conta no app">
      {login ? (
        <div className="space-y-2">
          <p className="text-sm flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-green-600" /> Usa o app com <strong>{login.email}</strong></p>
          <Button variant="outline" size="sm" onClick={() => navigate('/colaboradores')}>O que pode ver e fazer (permissões)</Button>
        </div>
      ) : !papel ? (
        <p className="text-xs text-muted-foreground">Para dar acesso ao app, marque em "O que faz" se a pessoa trabalha na oficina ou no balcão (e salve).</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Não usa o app. Só dê acesso a quem precisa (ex.: capoteiro lançar peças pelo celular). Tudo que ele lançar sai com o nome dele.</p>
          {semPessoa.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Logins sem pessoa ligada:</span>
              {semPessoa.map((m) => (
                <Button key={m.id} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEmail(m.email ?? '')}>{m.email}</Button>
              ))}
            </div>
          )}
          {noLimite && <p className="text-[11px] text-amber-500">Plano no limite de {max} logins: dá para ligar um login que já existe, mas não convidar novo.</p>}
          <div className="flex gap-2">
            <Input type="email" placeholder="email@da.pessoa" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button onClick={darAcesso} disabled={enviando}>{enviando ? 'Enviando...' : 'Dar acesso'}</Button>
          </div>
        </div>
      )}
    </Secao>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <p className="text-sm font-semibold">{titulo}</p>
      {children}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
