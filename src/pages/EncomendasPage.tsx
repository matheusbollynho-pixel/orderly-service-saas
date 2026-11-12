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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, X, Search, MessageCircle, Check, Truck, PackageCheck, Ban, Trash2, Loader2, Zap, Bot, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useClients, type Client, type Motorcycle } from '@/hooks/useClients';
import { matchesSearch } from '@/lib/textSearch';
import {
  useCotacao, brl, diasAtras, linkWhats, mensagemCotacao, resumoEntrega, ordenarOpcoes, proximaEntregaGratis,
  type CotacaoPreco,
} from '@/hooks/useCotacao';
import {
  useEncomendas, STATUS_ENCOMENDA, ATIVOS, mensagemCliente, saldoEncomenda, totalEncomenda, ultimoPrecoCobrado,
  type Encomenda, type ModeloMensagem, type StatusEncomenda,
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

export default function EncomendasPage() {
  const enc = useEncomendas();
  const cot = useCotacao();
  const [nova, setNova] = useState(false);
  const [filtro, setFiltro] = useState<'ativas' | 'finalizadas'>('ativas');
  const [busca, setBusca] = useState('');

  const lista = enc.encomendas
    .filter((e) => (filtro === 'ativas' ? ATIVOS.includes(e.status) : !ATIVOS.includes(e.status)))
    .filter((e) => matchesSearch(busca, e.cliente_nome, e.peca, e.moto, e.cliente_whatsapp));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Encomendas de clientes</h2>
        <Button size="sm" onClick={() => setNova((v) => !v)}>
          {nova ? <><X className="h-4 w-4 mr-1" /> Fechar</> : <><Plus className="h-4 w-4 mr-1" /> Nova encomenda</>}
        </Button>
      </div>

      {nova && <NovaEncomenda enc={enc} cot={cot} onFim={() => setNova(false)} />}

      <Tabs value={filtro} onValueChange={(v) => setFiltro(v as 'ativas' | 'finalizadas')}>
        <TabsList>
          <TabsTrigger value="ativas">Em andamento ({enc.encomendas.filter((e) => ATIVOS.includes(e.status)).length})</TabsTrigger>
          <TabsTrigger value="finalizadas">Finalizadas</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, peça ou moto (com ou sem acento)" />
      </div>

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
  const [informar, setInformar] = useState<ModeloMensagem | null>(null);
  const [pedir, setPedir] = useState(false);
  const s = STATUS_ENCOMENDA[e.status];
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
          {e.peca}{Number(e.quantidade) !== 1 ? ` × ${Number(e.quantidade)}` : ''}
          {e.moto && <span className="text-muted-foreground"> · {e.moto}</span>}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Custo: {custo ? <b className="text-foreground">{brl(custo.preco)}</b> : 'aguardando cotação'}{custo?.marca ? ` (${custo.marca})` : ''}</span>
          {total != null && <span>Cliente: <b className="text-foreground">{brl(total)}</b></span>}
          {Number(e.pago_adiantado) > 0 && ATIVOS.includes(e.status) && <span>Adiantado: {brl(Number(e.pago_adiantado))} · Falta: <b className="text-foreground">{brl(saldo)}</b></span>}
          {e.prazo_texto && <span>Prazo: {e.prazo_texto}</span>}
        </div>
        {e.observacao && <p className="text-xs text-muted-foreground">Obs: {e.observacao}</p>}

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
                <Button size="sm" variant="outline" onClick={() => mudar('entregue')}><Check className="h-4 w-4 mr-1" /> Entregue</Button>
              </>
            )}
            {e.status !== 'aguardando_cotacao' && e.status !== 'cliente_avisado' && e.status !== 'chegou' && (
              <Button size="sm" variant="ghost" onClick={() => setInformar('livre')}><MessageCircle className="h-4 w-4 mr-1" /> Mensagem</Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive"
              onClick={() => { if (confirm(`${e.cliente_nome} desistiu da encomenda?`)) mudar('desistiu'); }}>
              <Ban className="h-4 w-4 mr-1" /> Desistiu
            </Button>
          </div>
        )}
        {!ATIVOS.includes(e.status) && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => mudar('aguardando_cotacao')}>Reabrir</Button>
            <Button size="sm" variant="ghost" className="text-destructive"
              onClick={() => { if (confirm('Excluir essa encomenda de vez?')) enc.excluir.mutate(e); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
      {informar && <DialogInformar e={e} modeloInicial={informar} enc={enc} cot={cot} onFechar={() => setInformar(null)} />}
      {pedir && <DialogPedirPreco e={e} cot={cot} onFechar={() => setPedir(false)} />}
    </Card>
  );
}

// ------------------------------------------------------------------ Informar cliente

function DialogInformar({ e, modeloInicial, enc, cot, onFechar }: {
  e: Encomenda; modeloInicial: ModeloMensagem; enc: Enc; cot: Cot; onFechar: () => void;
}) {
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
  const [adiant, setAdiant] = useState<'nada' | 'metade' | 'tudo' | 'outro'>(
    Number(e.pago_adiantado) > 0 ? 'outro' : 'nada');
  const [adiantOutro, setAdiantOutro] = useState(Number(e.pago_adiantado) > 0 ? String(e.pago_adiantado).replace('.', ',') : '');
  const [incluirValor, setIncluirValor] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);

  const num = (v: string) => (v.trim() ? Number(v.replace(/\./g, '').replace(',', '.')) : null);
  const precoN = num(preco);
  const totalN = precoN != null ? precoN * Number(e.quantidade) : null;
  const pago = adiant === 'nada' ? 0 : adiant === 'metade' ? (totalN ?? 0) / 2 : adiant === 'tudo' ? (totalN ?? 0) : (num(adiantOutro) ?? 0);
  const margem = precoN != null && custo?.preco ? Math.round(((precoN - custo.preco) / custo.preco) * 100) : null;

  const rascunho = { ...e, preco_venda: precoN, prazo_texto: prazo, pago_adiantado: Math.round(pago * 100) / 100 };
  const mensagem = texto ?? mensagemCliente(modelo, rascunho, incluirValor);

  const enviar = async () => {
    if (modelo === 'orcamento' && (precoN == null || Number.isNaN(precoN))) return toast.error('Digite o preço pro cliente');
    const campos: Partial<Encomenda> & { id: string } = {
      id: e.id,
      preco_venda: precoN != null && !Number.isNaN(precoN) ? precoN : e.preco_venda,
      prazo_texto: prazo.trim() || null,
      pago_adiantado: Math.round(pago * 100) / 100,
      custo: custo?.preco ?? e.custo,
    };
    try {
      await enc.atualizar.mutateAsync(campos);
      const atualizada = { ...e, ...campos } as Encomenda;
      if (modelo === 'orcamento' && e.status === 'aguardando_cotacao') await enc.mudarStatus.mutateAsync({ e: atualizada, status: 'cliente_avisado' });
      if (modelo === 'ja_pedi' && ['aguardando_cotacao', 'cliente_avisado', 'aprovado'].includes(e.status)) await enc.mudarStatus.mutateAsync({ e: atualizada, status: 'pedido_feito' });
      window.open(linkWhats(e.cliente_whatsapp, mensagem), '_blank');
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
            <p>Custo: <b>{custo ? brl(custo.preco) : 'sem cotação ainda'}</b>{custo?.marca ? ` · ${custo.marca}` : ''}{rep ? ` · ${rep.nome}` : ''}</p>
            {rep && <p className="text-muted-foreground">{resumoEntrega(rep).join(' · ')}</p>}
            {ultimo && <p className="text-muted-foreground">Última vez cobrado: {brl(ultimo.preco_venda)} ({new Date(ultimo.created_at).toLocaleDateString('pt-BR')})</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Preço pro cliente (unidade)</Label>
              <Input inputMode="decimal" value={preco} onChange={(ev) => { setPreco(ev.target.value); setTexto(null); }} placeholder="150,00" />
              {margem != null && <p className={`text-xs mt-1 ${margem < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>Margem: {margem}%</p>}
            </div>
            <div>
              <Label>Prazo</Label>
              <Input value={prazo} onChange={(ev) => { setPrazo(ev.target.value); setTexto(null); }} placeholder="sexta (13/11)" />
            </div>
          </div>

          <div>
            <Label>Pago adiantado</Label>
            <div className="flex gap-2">
              <Select value={adiant} onValueChange={(v) => { setAdiant(v as typeof adiant); setTexto(null); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nada">Nada</SelectItem>
                  <SelectItem value="metade">50%</SelectItem>
                  <SelectItem value="tudo">Tudo</SelectItem>
                  <SelectItem value="outro">Outro valor</SelectItem>
                </SelectContent>
              </Select>
              {adiant === 'outro' && <Input inputMode="decimal" value={adiantOutro} onChange={(ev) => { setAdiantOutro(ev.target.value); setTexto(null); }} placeholder="R$" />}
            </div>
            {totalN != null && <p className="text-xs text-muted-foreground mt-1">Total {brl(totalN)} · adiantado {brl(pago)} · falta {brl(Math.max(0, totalN - pago))}</p>}
          </div>

          {modelo === 'chegou' && (
            <label className="flex items-center gap-2">
              <Checkbox checked={incluirValor} onCheckedChange={(v) => { setIncluirValor(!!v); setTexto(null); }} /> Incluir o valor que falta na mensagem
            </label>
          )}

          <div>
            <Label>Mensagem (pode editar)</Label>
            <Textarea rows={4} value={mensagem} onChange={(ev) => setTexto(ev.target.value)} />
          </div>
          {!e.cliente_whatsapp && <p className="text-xs text-yellow-600">Cliente sem WhatsApp: vai abrir o WhatsApp pra você escolher o contato.</p>}
          <Button className="w-full" onClick={enviar} disabled={enc.atualizar.isPending || enc.mudarStatus.isPending}>
            <MessageCircle className="h-4 w-4 mr-1" /> Salvar e abrir WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Pedir preço agora (urgente)

function DialogPedirPreco({ e, cot, onFechar }: { e: Encomenda; cot: Cot; onFechar: () => void }) {
  const reps = [...cot.representantes.filter((r) => r.ativo)].sort((a, b) => (a.prazo_dias ?? 99) - (b.prazo_dias ?? 99));
  const [msg, setMsg] = useState(mensagemCotacao([{ texto: e.peca, quantidade: e.quantidade }]));
  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Pedir preço agora: {e.peca}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <Textarea rows={5} value={msg} onChange={(ev) => setMsg(ev.target.value)} />
          <p className="text-xs text-muted-foreground">Mais rápido primeiro. Pergunte pra quem quiser; se não tiver, pergunte aos próximos.</p>
          {reps.length === 0 && <p className="text-muted-foreground">Cadastre representantes na Cotação.</p>}
          {reps.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-b pb-2">
              <div>
                <b>{r.nome}</b>
                <p className="text-xs text-muted-foreground">{resumoEntrega(r).join(' · ') || 'Entrega não cadastrada'}</p>
              </div>
              <Button size="sm" asChild>
                <a href={linkWhats(r.whatsapp, msg)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" /> WhatsApp</a>
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">A resposta você cola em Cotação → Colar resposta, como sempre.</p>
          <Button variant="outline" className="w-full" onClick={onFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
