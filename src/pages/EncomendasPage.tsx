import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, X, Search, MessageCircle, Check, Truck, PackageCheck, Ban, Loader2, Zap, Bot, Wrench,
  ClipboardList, ShoppingCart, CheckCircle2, Wallet, Eye, EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useClients, type Client, type Motorcycle } from '@/hooks/useClients';
import { matchesSearch } from '@/lib/textSearch';
import {
  useCotacao, brl, diasAtras, enviarWhats, mensagemCotacao, mensagemLink, urlLink, resumoEntrega, ordenarOpcoes, proximaEntregaGratis,
  type CotacaoPreco,
} from '@/hooks/useCotacao';
import {
  useEncomendas, STATUS_ENCOMENDA, ATIVOS, mensagemCliente, saldoEncomenda, totalEncomenda, ultimoPrecoCobrado,
  FORMAS_PAGAMENTO, type Encomenda, type ModeloMensagem, type StatusEncomenda, type FormaPagamento,
} from '@/hooks/useEncomendas';

type Enc = ReturnType<typeof useEncomendas>;
type Cot = ReturnType<typeof useCotacao>;

const descMoto = (m: Pick<Motorcycle, 'marca' | 'modelo' | 'ano'>) => [m.marca, m.modelo, m.ano].filter(Boolean).join(' ');

/** Preço de custo da peça: o escolhido na cotação, senão o melhor cotado. */
function custoDaCotacao(e: Encomenda, cot: Cot): CotacaoPreco | null {
  if (!e.cotacao_item_id) return null;
  const item = cot.itens.find((i) => i.id === e.cotacao_item_id);
  if (item?.pedido_preco_id) {
    const p = cot.precos.find((x) => x.id === item.pedido_preco_id);
    if (p) return p;
  }
  return ordenarOpcoes(cot.precos.filter((p) => p.item_id === e.cotacao_item_id))
    .find((p) => p.situacao === 'cotado' && p.preco != null) ?? null;
}

type Filtro = 'ativas' | StatusEncomenda;

const CHAVE_VER_CUSTO = 'encomendas_ver_custo';

function useVerCusto(): [boolean, (v: boolean) => void] {
  const ler = () => { try { return localStorage.getItem(CHAVE_VER_CUSTO) === '1'; } catch { return false; } };
  const [ver, setVer] = useState(ler);
  useEffect(() => {
    const h = () => setVer(ler());
    window.addEventListener('ver-custo', h);
    return () => window.removeEventListener('ver-custo', h);
  }, []);
  const mudar = (v: boolean) => {
    try { localStorage.setItem(CHAVE_VER_CUSTO, v ? '1' : '0'); } catch { /* sem storage */ }
    window.dispatchEvent(new Event('ver-custo'));
  };
  return [ver, mudar];
}

// Cartões do topo (mesmo estilo do Dashboard do início). Clicar filtra a lista.
const CARTOES: { id: Filtro; label: string; icon: typeof Check; status: StatusEncomenda[]; cor?: string }[] = [
  { id: 'ativas', label: 'Em andamento', icon: ClipboardList, status: ATIVOS },
  { id: 'aguardando_cotacao', label: 'Falta cotar', icon: Search, status: ['aguardando_cotacao'], cor: 'text-yellow-500' },
  { id: 'cliente_avisado', label: 'Esperando cliente', icon: MessageCircle, status: ['cliente_avisado'], cor: 'text-blue-500' },
  { id: 'aprovado', label: 'Falta pedir', icon: ShoppingCart, status: ['aprovado'], cor: 'text-purple-500' },
  { id: 'pedido_feito', label: 'Já pedido', icon: Truck, status: ['pedido_feito'], cor: 'text-orange-500' },
  { id: 'chegou', label: 'Chegou', icon: PackageCheck, status: ['chegou'], cor: 'text-green-500' },
  { id: 'entregue', label: 'Entregues', icon: CheckCircle2, status: ['entregue'] },
  { id: 'desistiu', label: 'Desistiu', icon: Ban, status: ['desistiu'], cor: 'text-red-500' },
];

function Cartao({ label, valor, icon: Icon, ativo, cor, onClick }: {
  label: string; valor: number; icon: typeof Check; ativo: boolean; cor?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="text-left transition-transform hover:scale-[1.01]">
      <div className={cn(
        'rounded-xl border p-3 md:p-4 transition-all bg-card h-full',
        ativo ? 'border-primary/70 shadow-[0_0_0_1px_rgba(193,39,45,0.25)]' : 'border-neutral-800 hover:border-border',
      )}>
        <div className="mb-2 flex items-start justify-between gap-1 min-h-[28px]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
          <Icon className={cn('h-4 w-4 text-muted-foreground shrink-0', valor > 0 && cor)} />
        </div>
        <span className="text-3xl font-black tracking-tight leading-none">{valor}</span>
      </div>
    </button>
  );
}

export default function EncomendasPage() {
  const enc = useEncomendas();
  const cot = useCotacao();
  const [nova, setNova] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('ativas');
  const [busca, setBusca] = useState('');
  const [verCusto, setVerCusto] = useVerCusto();

  const atual = CARTOES.find((c) => c.id === filtro) ?? CARTOES[0];
  const lista = enc.encomendas
    .filter((e) => atual.status.includes(e.status))
    .filter((e) => matchesSearch(busca, e.cliente_nome, e.peca, e.moto, e.cliente_whatsapp));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Encomendas de clientes</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setVerCusto(!verCusto)} title={verCusto ? 'Esconder custo' : 'Mostrar custo'}>
            {verCusto ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={() => setNova((v) => !v)}>
          {nova ? <><X className="h-4 w-4 mr-1" /> Fechar</> : <><Plus className="h-4 w-4 mr-1" /> Nova encomenda</>}
          </Button>
        </div>
      </div>

      {nova && <NovaEncomenda enc={enc} cot={cot} onFim={() => setNova(false)} />}

      <div className="bg-neutral-900 rounded-[8px] p-3 md:p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 md:gap-3">
          {CARTOES.map((c) => (
            <Cartao key={c.id} label={c.label} icon={c.icon} cor={c.cor} ativo={filtro === c.id}
              valor={enc.encomendas.filter((e) => c.status.includes(e.status)).length}
              // Clicar de novo no mesmo cartão volta pra "Em andamento"
              onClick={() => setFiltro(filtro === c.id ? 'ativas' : c.id)} />
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, peça ou moto (com ou sem acento)" />
      </div>

      <p className="text-xs text-muted-foreground">Mostrando: <b>{atual.label}</b> ({lista.length})</p>
      {enc.carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!enc.carregando && lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma encomenda aqui.</p>}
      {lista.map((e) => <CardEncomenda key={e.id} e={e} enc={enc} cot={cot} />)}
    </div>
  );
}

// ------------------------------------------------------------------ Nova encomenda

function NovaEncomenda({ enc, cot, onFim }: { enc: Enc; cot: Cot; onFim: () => void }) {
  const { searchClientByName, searchClientByPhone, getClientMotorcycles, upsertClient } = useClients();
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Client[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cliente, setCliente] = useState<Client | null>(null);
  const [nome, setNome] = useState('');
  const [whats, setWhats] = useState('');
  const [motos, setMotos] = useState<Motorcycle[]>([]);
  const [motoId, setMotoId] = useState<string | null>(null);
  const [moto, setMoto] = useState('');
  const [osAbertas, setOsAbertas] = useState<{ id: string; equipment: string | null; entry_date: string | null }[]>([]);
  const [osId, setOsId] = useState<string>('nenhuma');
  const [peca, setPeca] = useState('');
  const [qtd, setQtd] = useState('1');
  const [urgente, setUrgente] = useState(false);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [pedirAgora, setPedirAgora] = useState<Encomenda | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (cliente) return;
    clearTimeout(timer.current);
    const q = busca.trim();
    const digitos = q.replace(/\D/g, '');
    if (q.length < 2) { setResultados([]); return; }
    timer.current = setTimeout(async () => {
      setBuscando(true);
      try {
        if (digitos.length >= 8 && digitos.length === q.replace(/[\s()+-]/g, '').length) {
          const c = await searchClientByPhone(digitos);
          setResultados(c ? [c] : []);
        } else {
          setResultados(await searchClientByName(q));
        }
      } finally {
        setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, cliente]);

  const escolherCliente = async (c: Client) => {
    setCliente(c);
    setNome(c.name);
    setWhats(c.whatsapp || c.phone || '');
    setResultados([]);
    const ms = await getClientMotorcycles(c.id);
    setMotos(ms);
    if (ms.length === 1) { setMotoId(ms[0].id); setMoto(descMoto(ms[0])); }
    const { data } = await supabase
      .from('service_orders')
      .select('id, equipment, entry_date')
      .eq('client_id', c.id)
      .in('status', ['aberta', 'em_andamento'])
      .order('created_at', { ascending: false })
      .limit(5);
    setOsAbertas((data ?? []) as typeof osAbertas);
  };

  const limparCliente = () => {
    setCliente(null); setNome(''); setWhats(''); setMotos([]); setMotoId(null); setMoto(''); setOsAbertas([]); setOsId('nenhuma'); setBusca('');
  };

  const salvar = async () => {
    const q = Number(qtd.replace(',', '.'));
    if (!nome.trim()) return toast.error('Informe o cliente');
    if (!peca.trim()) return toast.error('Informe a peça');
    if (!(q > 0)) return toast.error('Quantidade inválida');
    setSalvando(true);
    try {
      let clientId = cliente?.id ?? null;
      const tel = whats.replace(/\D/g, '');
      // Cliente novo com telefone: entra na base de clientes (sem CPF)
      if (!clientId && tel.length >= 10) {
        const existente = await searchClientByPhone(tel);
        const c = existente ?? await upsertClient({ name: nome.trim(), phone: tel });
        clientId = c?.id ?? null;
      }
      const criada = await enc.criar.mutateAsync({
        client_id: clientId,
        motorcycle_id: motoId,
        service_order_id: osId !== 'nenhuma' ? osId : null,
        cliente_nome: nome.trim(),
        cliente_whatsapp: tel || null,
        moto: moto.trim() || null,
        peca: peca.trim(),
        quantidade: q,
        urgente,
        observacao: obs.trim() || null,
      });
      if (urgente) setPedirAgora(criada);
      else onFim();
    } catch {
      // erro já mostrado pelo toast da mutação
    } finally {
      setSalvando(false);
    }
  };

  if (pedirAgora) {
    return <DialogPedirPreco e={pedirAgora} cot={cot} onFechar={() => { setPedirAgora(null); onFim(); }} />;
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3 text-sm">
        <div>
          <Label>Cliente</Label>
          {cliente ? (
            <div className="flex items-center justify-between rounded-md border p-2">
              <span><b>{cliente.name}</b> · {whats || 'sem WhatsApp'}</span>
              <Button size="sm" variant="ghost" onClick={limparCliente}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <>
              <Input value={busca} onChange={(e) => { setBusca(e.target.value); setNome(e.target.value); }}
                placeholder="Nome ou telefone (busca na base de clientes)" />
              {buscando && <p className="text-xs text-muted-foreground mt-1">Buscando...</p>}
              {resultados.length > 0 && (
                <div className="rounded-md border mt-1 divide-y">
                  {resultados.map((c) => (
                    <button key={c.id} className="w-full text-left p-2 hover:bg-muted" onClick={() => escolherCliente(c)}>
                      <b>{c.name}</b> <span className="text-muted-foreground">{c.whatsapp || c.phone || ''}</span>
                    </button>
                  ))}
                </div>
              )}
              {busca.trim().length >= 2 && !buscando && resultados.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Cliente novo: preencha o WhatsApp abaixo que ele entra na base.</p>
              )}
            </>
          )}
        </div>
        {!cliente && (
          <div><Label>WhatsApp do cliente</Label><Input value={whats} onChange={(e) => setWhats(e.target.value)} placeholder="75 9 9999-9999" /></div>
        )}

        <div>
          <Label>Moto</Label>
          {motos.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {motos.map((m) => (
                <Button key={m.id} size="sm" type="button" variant={motoId === m.id ? 'default' : 'outline'}
                  onClick={() => { setMotoId(m.id); setMoto(descMoto(m)); }}>
                  {descMoto(m)}{m.placa ? ` · ${m.placa}` : ''}
                </Button>
              ))}
            </div>
          )}
          <Input value={moto} onChange={(e) => { setMoto(e.target.value); setMotoId(null); }} placeholder="Ex: Titan 160 2020" />
        </div>

        {osAbertas.length > 0 && (
          <div>
            <Label>Moto parada na oficina? Ligar a uma OS aberta</Label>
            <Select value={osId} onValueChange={setOsId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Não ligar</SelectItem>
                {osAbertas.map((o) => (
                  <SelectItem key={o.id} value={o.id}>OS {o.equipment ?? ''} {o.entry_date ? `· ${new Date(o.entry_date).toLocaleDateString('pt-BR')}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1"><Label>Peça (do jeito que a loja anota)</Label><Input value={peca} onChange={(e) => setPeca(e.target.value)} placeholder="Pisca rd 135" /></div>
          <div className="w-20"><Label>Qtd</Label><Input value={qtd} onChange={(e) => setQtd(e.target.value)} inputMode="decimal" /></div>
        </div>
        <div><Label>Observação (opcional)</Label><Input value={obs} onChange={(e) => setObs(e.target.value)} /></div>

        <label className="flex items-center gap-2">
          <Switch checked={urgente} onCheckedChange={setUrgente} />
          <span><b>Urgente</b>: pedir preço agora, só dessa peça (senão entra na próxima cotação geral)</span>
        </label>

        <Button className="w-full" onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Registrar encomenda
        </Button>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ Card

function CardEncomenda({ e, enc, cot }: { e: Encomenda; enc: Enc; cot: Cot }) {
  const [verCusto] = useVerCusto();
  const [informar, setInformar] = useState<ModeloMensagem | null>(null);
  const [pedir, setPedir] = useState(false);
  const [caixa, setCaixa] = useState<'receber' | 'entregar' | 'devolver' | null>(null);
  const [desistir, setDesistir] = useState(false);
  const s = STATUS_ENCOMENDA[e.status];
  const pago = Number(e.pago_adiantado || 0);
  const custo = custoDaCotacao(e, cot);
  const total = totalEncomenda(e);
  const saldo = saldoEncomenda(e);
  const mudar = (status: StatusEncomenda) => enc.mudarStatus.mutate({ e, status });

  return (
    <Card className={e.status === 'chegou' ? 'border-green-500/40' : ''}>
      <CardContent className="p-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <b>{e.cliente_nome}</b>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
          {e.urgente && <span className="text-xs text-orange-600 flex items-center gap-0.5"><Zap className="h-3 w-3" /> urgente</span>}
          {e.origem === 'whatsapp' && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Bot className="h-3 w-3" /> pelo WhatsApp</span>}
          {e.service_order_id && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Wrench className="h-3 w-3" /> moto na oficina</span>}
          <span className="text-xs text-muted-foreground ml-auto">{diasAtras(e.created_at)}</span>
        </div>
        <p>
          {e.peca}{Number(e.quantidade) !== 1 ? ` · Qtd: ${Number(e.quantidade)}` : ''}
          {e.moto && <span className="text-muted-foreground"> · {e.moto}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {total == null && <span>Valor: <b className="text-foreground">a definir</b></span>}
          {total != null && <span>Valor total: <b className="text-foreground">{brl(total)}</b></span>}
          {total != null && pago > 0 && <span>Entrada: <b className="text-foreground">{brl(pago)}</b></span>}
          {total != null && (saldo
            ? <span>Resta pagar: <b className="text-foreground">{brl(saldo)}</b></span>
            : <span className="text-green-600 font-medium">Pago ✓</span>)}
          {e.prazo_texto && <span>Prazo: {e.prazo_texto}</span>}
        </div>
        {verCusto && (
          <p className="text-xs text-muted-foreground border-l-2 border-yellow-500/50 pl-2">
            Custo: {custo ? <b className="text-foreground">{brl(custo.preco)}</b> : 'aguardando cotação'}{custo?.marca ? ` (${custo.marca})` : ''}
            {custo?.preco && e.preco_venda ? ` · Margem ${Math.round(((e.preco_venda - custo.preco) / custo.preco) * 100)}%` : ''}
          </p>
        )}
        {e.observacao && <p className="text-xs text-muted-foreground">Obs: {e.observacao}</p>}
        {e.status === 'desistiu' && (
          <p className="text-xs text-red-600">Motivo da desistência: {e.motivo_desistencia || 'não informado'}</p>
        )}

        {ATIVOS.includes(e.status) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {e.status === 'aguardando_cotacao' && (
              <>
                <Button size="sm" variant="outline" onClick={() => setPedir(true)}><Zap className="h-4 w-4 mr-1" /> Pedir preço agora</Button>
                <Button size="sm" onClick={() => setInformar('orcamento')}><MessageCircle className="h-4 w-4 mr-1" /> Informar cliente</Button>
              </>
            )}
            {e.status === 'cliente_avisado' && (
              <>
                <Button size="sm" onClick={() => mudar('aprovado')}><Check className="h-4 w-4 mr-1" /> Cliente aprovou</Button>
                <Button size="sm" variant="outline" onClick={() => setInformar('orcamento')}><MessageCircle className="h-4 w-4 mr-1" /> Mandar de novo</Button>
              </>
            )}
            {e.status === 'aprovado' && (
              <Button size="sm" onClick={() => mudar('pedido_feito')}><Truck className="h-4 w-4 mr-1" /> Pedido feito</Button>
            )}
            {e.status === 'pedido_feito' && (
              <>
                <Button size="sm" onClick={() => mudar('chegou')}><PackageCheck className="h-4 w-4 mr-1" /> Chegou</Button>
                <Button size="sm" variant="outline" onClick={() => setInformar('ja_pedi')}><MessageCircle className="h-4 w-4 mr-1" /> Avisar que pediu</Button>
              </>
            )}
            {e.status === 'chegou' && (
              <>
                <Button size="sm" onClick={() => setInformar('chegou')}><MessageCircle className="h-4 w-4 mr-1" /> Avisar que chegou</Button>
                <Button size="sm" variant="outline" onClick={() => (saldo ? setCaixa('entregar') : mudar('entregue'))}><Check className="h-4 w-4 mr-1" /> Entregue</Button>
              </>
            )}
            {total != null && !!saldo && e.status !== 'chegou' && (
              <Button size="sm" variant="outline" onClick={() => setCaixa('receber')}><Wallet className="h-4 w-4 mr-1" /> Receber</Button>
            )}
            {e.status !== 'aguardando_cotacao' && e.status !== 'cliente_avisado' && e.status !== 'chegou' && (
              <Button size="sm" variant="ghost" onClick={() => setInformar('livre')}><MessageCircle className="h-4 w-4 mr-1" /> Mensagem</Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive"
              onClick={() => setDesistir(true)}>
              <Ban className="h-4 w-4 mr-1" /> Desistiu
            </Button>
          </div>
        )}
        {!ATIVOS.includes(e.status) && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => mudar('aguardando_cotacao')}>Reabrir</Button>
            {/* Encomenda não se apaga: fica o histórico (o banco também não deixa) */}
          </div>
        )}
      </CardContent>
      {informar && <DialogInformar e={e} modeloInicial={informar} enc={enc} cot={cot} onFechar={() => setInformar(null)} />}
      {pedir && <DialogPedirPreco e={e} cot={cot} onFechar={() => setPedir(false)} />}
      {caixa && <DialogCaixa e={e} modo={caixa} enc={enc} onFechar={() => setCaixa(null)} />}
      {desistir && (
        <DialogDesistir e={e} enc={enc} onFechar={(desistiu) => {
          setDesistir(false);
          if (desistiu && pago > 0) setCaixa('devolver');
        }} />
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Informar cliente

function DialogInformar({ e, modeloInicial, enc, cot, onFechar }: {
  e: Encomenda; modeloInicial: ModeloMensagem; enc: Enc; cot: Cot; onFechar: () => void;
}) {
  const [verCusto] = useVerCusto();
  const custo = custoDaCotacao(e, cot);
  const rep = custo?.representante_id ? cot.representantes.find((r) => r.id === custo.representante_id) : null;
  const prazoSugerido = useMemo(() => {
    if (e.prazo_texto) return e.prazo_texto;
    if (!rep) return '';
    const d = proximaEntregaGratis(rep);
    if (d) return `${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.getDay()]} (${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')})`;
    return rep.prazo_dias != null ? `em ${rep.prazo_dias} dia(s)` : '';
  }, [e.prazo_texto, rep]);
  const ultimo = ultimoPrecoCobrado(enc.encomendas, e);

  const [modelo, setModelo] = useState<ModeloMensagem>(modeloInicial);
  const [preco, setPreco] = useState(e.preco_venda != null ? String(e.preco_venda).replace('.', ',') : '');
  const [prazo, setPrazo] = useState(prazoSugerido);
  const [incluirValor, setIncluirValor] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);

  const num = (v: string) => (v.trim() ? Number(v.replace(/\./g, '').replace(',', '.')) : null);
  const precoN = num(preco);
  const totalN = precoN != null ? precoN * Number(e.quantidade) : null;
  const pago = Number(e.pago_adiantado || 0);
  const margem = precoN != null && custo?.preco ? Math.round(((precoN - custo.preco) / custo.preco) * 100) : null;

  const rascunho = { ...e, preco_venda: precoN, prazo_texto: prazo, pago_adiantado: Math.round(pago * 100) / 100 };
  const mensagem = texto ?? mensagemCliente(modelo, rascunho, incluirValor);

  const enviar = async () => {
    if (modelo === 'orcamento' && (precoN == null || Number.isNaN(precoN))) return toast.error('Digite o preço pro cliente');
    const campos: Partial<Encomenda> & { id: string } = {
      id: e.id,
      preco_venda: precoN != null && !Number.isNaN(precoN) ? precoN : e.preco_venda,
      prazo_texto: prazo.trim() || null,
      custo: custo?.preco ?? e.custo,
    };
    try {
      await enc.atualizar.mutateAsync(campos);
      const atualizada = { ...e, ...campos } as Encomenda;
      if (modelo === 'orcamento' && e.status === 'aguardando_cotacao') await enc.mudarStatus.mutateAsync({ e: atualizada, status: 'cliente_avisado' });
      if (modelo === 'ja_pedi' && ['aguardando_cotacao', 'cliente_avisado', 'aprovado'].includes(e.status)) await enc.mudarStatus.mutateAsync({ e: atualizada, status: 'pedido_feito' });
      await enviarWhats(e.cliente_whatsapp, mensagem);
      onFechar();
    } catch {
      // toast já mostrado
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Mensagem pra {e.cliente_nome}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label>Modelo</Label>
            <Select value={modelo} onValueChange={(v) => { setModelo(v as ModeloMensagem); setTexto(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="orcamento">Orçamento (posso pedir?)</SelectItem>
                <SelectItem value="ja_pedi">Já pedi</SelectItem>
                <SelectItem value="chegou">Chegou</SelectItem>
                <SelectItem value="livre">Livre</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border p-2 space-y-1 text-xs">
            {verCusto && <p>Custo: <b>{custo ? brl(custo.preco) : 'sem cotação ainda'}</b>{custo?.marca ? ` · ${custo.marca}` : ''}{rep ? ` · ${rep.nome}` : ''}</p>}
            {rep && <p className="text-muted-foreground">{resumoEntrega(rep).join(' · ')}</p>}
            {ultimo && <p className="text-muted-foreground">Última vez cobrado: {brl(ultimo.preco_venda)} ({new Date(ultimo.created_at).toLocaleDateString('pt-BR')})</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Preço pro cliente (unidade)</Label>
              <Input inputMode="decimal" value={preco} onChange={(ev) => { setPreco(ev.target.value); setTexto(null); }} placeholder="150,00" />
              {verCusto && margem != null && <p className={`text-xs mt-1 ${margem < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>Margem: {margem}%</p>}
            </div>
            <div>
              <Label>Prazo</Label>
              <Input value={prazo} onChange={(ev) => { setPrazo(ev.target.value); setTexto(null); }} placeholder="sexta (13/11)" />
            </div>
          </div>

          {totalN != null && (
            <p className="text-xs text-muted-foreground">
              Valor total {brl(totalN)} · Entrada {brl(pago)} · Resta pagar {brl(Math.max(0, totalN - pago))}. Pra receber entrada, use o botão "Receber" (entra no caixa).
            </p>
          )}

          {modelo === 'chegou' && (
            <label className="flex items-center gap-2">
              <Checkbox checked={incluirValor} onCheckedChange={(v) => { setIncluirValor(!!v); setTexto(null); }} /> Incluir o valor que falta na mensagem
            </label>
          )}

          <div>
            <Label>Mensagem (pode editar)</Label>
            <Textarea rows={4} value={mensagem} onChange={(ev) => setTexto(ev.target.value)} />
          </div>
          {!e.cliente_whatsapp && <p className="text-xs text-yellow-600">Cliente sem WhatsApp cadastrado: vai abrir o WhatsApp pra você escolher o contato.</p>}
          <Button className="w-full" onClick={enviar} disabled={enc.atualizar.isPending || enc.mudarStatus.isPending}>
            <MessageCircle className="h-4 w-4 mr-1" /> Salvar e enviar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Pedir preço agora (urgente)

function DialogPedirPreco({ e, cot, onFechar }: { e: Encomenda; cot: Cot; onFechar: () => void }) {
  const reps = [...cot.representantes.filter((r) => r.ativo)].sort((a, b) => (a.prazo_dias ?? 99) - (b.prazo_dias ?? 99));
  const [enviando, setEnviando] = useState<string | null>(null);

  const enviarLink = async (repId: string, tel: string | null) => {
    if (!e.cotacao_item_id) return toast.error('Essa encomenda não está ligada à cotação');
    setEnviando(repId);
    try {
      const link = await cot.criarLink.mutateAsync({ representante_id: repId, itens: [e.cotacao_item_id] });
      await enviarWhats(tel, mensagemLink(urlLink(link.token)));
    } catch {
      // toast já mostrado
    } finally {
      setEnviando(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Pedir preço agora: {e.peca}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">Mais rápido primeiro. O representante recebe um link só com essa peça e a resposta aparece sozinha.</p>
          {reps.length === 0 && <p className="text-muted-foreground">Cadastre representantes na Cotação.</p>}
          {reps.map((r) => {
            const ultimo = cot.links.find((l) => l.representante_id === r.id && !!e.cotacao_item_id && l.itens.includes(e.cotacao_item_id));
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 border-b pb-2">
                <div>
                  <b>{r.nome}</b>
                  <p className="text-xs text-muted-foreground">{resumoEntrega(r).join(' · ') || 'Entrega não cadastrada'}</p>
                  {ultimo && (
                    <p className={`text-xs ${ultimo.respondido_em ? 'text-green-600' : 'text-yellow-600'}`}>
                      {ultimo.respondido_em ? `✓ Respondeu ${diasAtras(ultimo.respondido_em)}` : 'Link enviado, aguardando'}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Button size="sm" disabled={enviando !== null} onClick={() => enviarLink(r.id, r.whatsapp)}>
                    {enviando === r.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-1" />} Enviar link
                  </Button>
                  <button className="text-xs underline text-muted-foreground"
                    onClick={() => enviarWhats(r.whatsapp, mensagemCotacao([{ texto: e.peca, quantidade: e.quantidade }]))}>
                    ou só mensagem
                  </button>
                </div>
              </div>
            );
          })}
          <Button variant="outline" className="w-full" onClick={onFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Caixa (receber / entregar / devolver)

function DialogCaixa({ e, modo, enc, onFechar }: {
  e: Encomenda; modo: 'receber' | 'entregar' | 'devolver'; enc: Enc; onFechar: () => void;
}) {
  const total = totalEncomenda(e);
  const pago = Number(e.pago_adiantado || 0);
  const saldo = saldoEncomenda(e) ?? 0;
  const sugerido = modo === 'devolver' ? pago : modo === 'entregar' ? saldo : (pago === 0 && total ? total / 2 : saldo);
  const [valor, setValor] = useState(sugerido ? sugerido.toFixed(2).replace('.', ',') : '');
  const [metodo, setMetodo] = useState<FormaPagamento>('pix');
  const valorN = Number(valor.replace(/\./g, '').replace(',', '.'));
  const ocupado = enc.receber.isPending || enc.devolver.isPending || enc.mudarStatus.isPending;

  const confirmar = async () => {
    if (!(valorN > 0)) return toast.error('Informe o valor');
    try {
      if (modo === 'devolver') await enc.devolver.mutateAsync({ e, valor: valorN, metodo });
      else await enc.receber.mutateAsync({ e, valor: valorN, metodo, entregar: modo === 'entregar' });
      onFechar();
    } catch {
      // toast já mostrado
    }
  };

  const titulo = modo === 'devolver' ? `Devolver pra ${e.cliente_nome}?` : modo === 'entregar' ? `Entregar pra ${e.cliente_nome}` : `Receber de ${e.cliente_nome}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {total != null ? `Valor total ${brl(total)} · Entrada ${brl(pago)} · Resta pagar ${brl(saldo)}` : `Já pago ${brl(pago)}`}
          </p>
          {modo === 'devolver' && <p className="text-xs">O cliente já tinha pago {brl(pago)}. Se devolveu o dinheiro, lance a saída no caixa.</p>}
          {modo !== 'devolver' && pago === 0 && total != null && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setValor((total / 2).toFixed(2).replace('.', ','))}>50% (entrada)</Button>
              <Button size="sm" variant="outline" onClick={() => setValor(total.toFixed(2).replace('.', ','))}>Tudo</Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={valor} onChange={(ev) => setValor(ev.target.value)} /></div>
            <div>
              <Label>Forma</Label>
              <Select value={metodo} onValueChange={(v) => setMetodo(v as FormaPagamento)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMAS_PAGAMENTO.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" onClick={confirmar} disabled={ocupado}>
            <Wallet className="h-4 w-4 mr-1" />
            {modo === 'devolver' ? 'Lançar devolução no caixa' : modo === 'entregar' ? 'Receber, lançar no caixa e entregar' : 'Receber e lançar no caixa'}
          </Button>
          {modo === 'entregar' && (
            <Button variant="outline" className="w-full" disabled={ocupado}
              onClick={async () => { await enc.mudarStatus.mutateAsync({ e, status: 'entregue' }); onFechar(); }}>
              Entregar sem receber agora
            </Button>
          )}
          {modo === 'devolver' && <Button variant="ghost" className="w-full" onClick={onFechar}>Não devolveu</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Desistência

const MOTIVOS = ['Achou mais barato', 'Demorou demais', 'Comprou em outro lugar', 'Não precisa mais', 'Não respondeu mais', 'Outro'];

function DialogDesistir({ e, enc, onFechar }: { e: Encomenda; enc: Enc; onFechar: (desistiu: boolean) => void }) {
  const [motivo, setMotivo] = useState('');
  const [detalhe, setDetalhe] = useState('');
  const ocupado = enc.mudarStatus.isPending || enc.atualizar.isPending;

  const confirmar = async () => {
    if (!motivo) return toast.error('Escolha o motivo');
    const texto = [motivo, detalhe.trim()].filter(Boolean).join(': ');
    try {
      await enc.atualizar.mutateAsync({ id: e.id, motivo_desistencia: texto });
      await enc.mudarStatus.mutateAsync({ e, status: 'desistiu' });
      onFechar(true);
    } catch {
      // toast já mostrado
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar(false)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{e.cliente_nome} desistiu?</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <Label>Motivo</Label>
          <div className="grid grid-cols-2 gap-2">
            {MOTIVOS.map((m) => (
              <Button key={m} size="sm" type="button" variant={motivo === m ? 'default' : 'outline'} onClick={() => setMotivo(m)}>{m}</Button>
            ))}
          </div>
          <Input value={detalhe} onChange={(ev) => setDetalhe(ev.target.value)} placeholder="Detalhe (opcional)" />
          <Button className="w-full" variant="destructive" onClick={confirmar} disabled={ocupado}>
            <Ban className="h-4 w-4 mr-1" /> Confirmar desistência
          </Button>
          <Button className="w-full" variant="ghost" onClick={() => onFechar(false)}>Voltar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
