import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, Trash2, Pencil, ChevronDown, ChevronUp, MessageCircle, Search, Check, X, Sparkles,
  Loader2, Paperclip, ShoppingCart, BookOpen, Truck, AlertTriangle, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { matchesSearch, normalizeSearch } from '@/lib/textSearch';
import {
  useCotacao, brl, diasAtras, resumoEntrega, linkWhats, mensagemCotacao, linksInternet, ordenarOpcoes,
  type CotacaoItem, type CotacaoPreco, type Representante, type Situacao,
} from '@/hooks/useCotacao';

type Cot = ReturnType<typeof useCotacao>;

const SITUACAO: Record<Situacao, { label: string; cls: string }> = {
  cotado: { label: 'Cotado', cls: 'bg-green-500/15 text-green-600 border-green-500/30' },
  duvida: { label: 'Dúvida', cls: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' },
  nao_tem: { label: 'Não tem', cls: 'bg-muted text-muted-foreground border-border' },
  nao_serve: { label: 'Não serve', cls: 'bg-red-500/15 text-red-600 border-red-500/30' },
};

const PRECO_POR: Record<string, string> = { par: ' o par', kit: ' o kit', unidade: '', nao_informado: '' };

function nomeFonte(p: CotacaoPreco, reps: Representante[]) {
  if (p.fonte === 'internet') return `Internet${p.loja_internet ? ` · ${p.loja_internet}` : ''}`;
  return reps.find((r) => r.id === p.representante_id)?.nome ?? 'Representante';
}

export default function CotacaoPage() {
  const cot = useCotacao();
  const [aba, setAba] = useState('faltas');
  const aEnviar = cot.itens.filter((i) => i.status === 'pendente' && i.pedido_preco_id).length;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Cotação de Peças</h2>
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="faltas">Faltas</TabsTrigger>
          <TabsTrigger value="pedir">Pedir preço</TabsTrigger>
          <TabsTrigger value="resposta">Colar resposta</TabsTrigger>
          <TabsTrigger value="pedidos">Fazer pedido{aEnviar ? ` (${aEnviar})` : ''}</TabsTrigger>
          <TabsTrigger value="reps">Representantes</TabsTrigger>
          <TabsTrigger value="dicionario">Dicionário</TabsTrigger>
        </TabsList>
        <TabsContent value="faltas"><AbaFaltas cot={cot} /></TabsContent>
        <TabsContent value="pedir"><AbaPedir cot={cot} /></TabsContent>
        {/* forceMount: não perde o representante/texto/arquivo ao trocar de aba */}
        <TabsContent value="resposta" forceMount className="data-[state=inactive]:hidden">
          <AbaResposta cot={cot} irParaFaltas={() => setAba('faltas')} />
        </TabsContent>
        <TabsContent value="pedidos"><AbaPedidos cot={cot} /></TabsContent>
        <TabsContent value="reps"><AbaRepresentantes cot={cot} /></TabsContent>
        <TabsContent value="dicionario"><AbaDicionario cot={cot} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------------ Faltas

function AbaFaltas({ cot }: { cot: Cot }) {
  const [novo, setNovo] = useState('');
  const [verPedidos, setVerPedidos] = useState(false);
  const [busca, setBusca] = useState('');
  const todosPendentes = cot.itens.filter((i) => i.status === 'pendente');
  const pendentes = todosPendentes.filter((i) => matchesSearch(busca, i.texto));
  const outros = cot.itens.filter((i) => i.status !== 'pendente' && matchesSearch(busca, i.texto)).reverse();

  const adicionar = () => {
    // Mesma peça com ou sem acento/maiúscula ("camara" = "Câmara") não entra duas vezes
    const jaTem = new Set(todosPendentes.map((i) => normalizeSearch(i.texto).replace(/\s+/g, ' ')));
    const vistos = new Set<string>();
    const novas: string[] = [];
    const repetidas: string[] = [];
    for (const l of novo.split('\n').map((x) => x.trim()).filter(Boolean)) {
      const k = normalizeSearch(l).replace(/\s+/g, ' ');
      if (jaTem.has(k) || vistos.has(k)) repetidas.push(l);
      else { vistos.add(k); novas.push(l); }
    }
    if (repetidas.length) toast.warning(`Já estava na lista: ${repetidas.join(', ')}`);
    if (!novas.length) return setNovo('');
    cot.adicionarItens.mutate(novas.map((texto) => ({ texto, quantidade: 1 })), { onSuccess: () => setNovo('') });
  };

  return (
    <div className="space-y-4 mt-3">
      <Card>
        <CardContent className="p-4 space-y-2">
          <Label>Adicionar peças que faltam (uma por linha, do jeito que vocês anotam)</Label>
          <Textarea rows={3} value={novo} onChange={(e) => setNovo(e.target.value)}
            placeholder={'Relacao pop 110\ncabo acelerador A 150 2015'} />
          <Button size="sm" onClick={adicionar} disabled={!novo.trim() || cot.adicionarItens.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </CardContent>
      </Card>

      {todosPendentes.length > 5 && (
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar peça (com ou sem acento)" />
        </div>
      )}
      {cot.carregando && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!cot.carregando && todosPendentes.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma peça em falta. Adicione acima.</p>
      )}
      {!cot.carregando && todosPendentes.length > 0 && pendentes.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma peça encontrada pra "{busca}".</p>
      )}
      {pendentes.map((item) => <ItemFalta key={item.id} item={item} cot={cot} />)}

      {outros.length > 0 && (
        <div className="pt-2">
          <Button variant="ghost" size="sm" onClick={() => setVerPedidos((v) => !v)}>
            {verPedidos ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            Já pedidos / cancelados ({outros.length})
          </Button>
          {verPedidos && outros.map((item) => {
            const escolhido = cot.precos.find((p) => p.id === item.pedido_preco_id);
            return (
              <div key={item.id} className="flex items-center justify-between gap-2 py-2 border-b text-sm">
                <div>
                  <span className={item.status === 'cancelado' ? 'line-through text-muted-foreground' : ''}>{item.texto}</span>
                  {escolhido && (
                    <span className="text-muted-foreground"> · {nomeFonte(escolhido, cot.representantes)} {escolhido.marca ?? ''} {brl(escolhido.preco)}</span>
                  )}
                </div>
                <Button variant="ghost" size="sm" title="Voltar pra lista de faltas"
                  onClick={() => cot.atualizarItem.mutate({ id: item.id, status: 'pendente', pedido_em: null, pedido_preco_id: null })}>
                  <Undo2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItemFalta({ item, cot }: { item: CotacaoItem; cot: Cot }) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(item.texto);
  const [qtd, setQtd] = useState(String(item.quantidade));
  const [internet, setInternet] = useState(false);

  const opcoes = useMemo(() => ordenarOpcoes(cot.precos.filter((p) => p.item_id === item.id)), [cot.precos, item.id]);
  const melhor = opcoes.find((p) => p.situacao === 'cotado' && p.preco != null);
  const duvidas = opcoes.filter((p) => p.situacao === 'duvida').length;
  const escolhido = opcoes.find((p) => p.id === item.pedido_preco_id);
  const links = linksInternet(item.texto);

  const salvar = () => {
    const q = Number(qtd.replace(',', '.'));
    if (!texto.trim() || !(q > 0)) return toast.error('Preencha o texto e a quantidade');
    cot.atualizarItem.mutate({ id: item.id, texto: texto.trim(), quantidade: q }, { onSuccess: () => setEditando(false) });
  };

  return (
    <Card className={escolhido ? 'border-primary/40' : ''}>
      <CardContent className="p-3 space-y-2">
        {editando ? (
          <div className="flex gap-2 items-center">
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} />
            <Input className="w-20" value={qtd} onChange={(e) => setQtd(e.target.value)} title="Quantidade" />
            <Button size="icon" variant="ghost" onClick={salvar}><Check className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => setEditando(false)}><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <button className="w-full text-left flex items-start justify-between gap-2" onClick={() => setAberto((v) => !v)}>
            <div className="min-w-0">
              <p className="font-medium">
                {item.texto}
                {Number(item.quantidade) !== 1 && <span className="text-muted-foreground"> × {Number(item.quantidade)}</span>}
              </p>
              {item.observacao && <p className="text-xs text-primary">{item.observacao}</p>}
              <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                {escolhido
                  ? <span className="text-primary font-medium">Escolhido: {nomeFonte(escolhido, cot.representantes)} {escolhido.marca ?? ''} {brl(escolhido.preco)} · vá em "Fazer pedido"</span>
                  : melhor
                    ? <span>Melhor: <b className="text-foreground">{brl(melhor.preco)}</b> {nomeFonte(melhor, cot.representantes)}{melhor.marca ? ` · ${melhor.marca}` : ''}</span>
                    : <span>Sem preço ainda</span>}
                {opcoes.length > 0 && <span>· {opcoes.length} opç{opcoes.length > 1 ? 'ões' : 'ão'}</span>}
                {duvidas > 0 && <span className="text-yellow-600">· {duvidas} pra conferir</span>}
              </div>
            </div>
            {aberto ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
        )}

        {aberto && (
          <div className="space-y-3 pt-1">
            {opcoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma resposta ligada a esta peça ainda.</p>}
            {opcoes.map((p) => <OpcaoPreco key={p.id} p={p} item={item} cot={cot} escolhido={p.id === item.pedido_preco_id} />)}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={links.mercadoLivre} target="_blank" rel="noreferrer"><Search className="h-4 w-4 mr-1" /> Mercado Livre</a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={links.shopee} target="_blank" rel="noreferrer"><Search className="h-4 w-4 mr-1" /> Shopee</a>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setInternet((v) => !v)}>
                <Plus className="h-4 w-4 mr-1" /> Preço da internet
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setTexto(item.texto); setQtd(String(item.quantidade)); setEditando(true); }}>
                <Pencil className="h-4 w-4 mr-1" /> Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => cot.atualizarItem.mutate({ id: item.id, status: 'cancelado' })}>
                <X className="h-4 w-4 mr-1" /> Não precisa mais
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive"
                onClick={() => { if (confirm(`Excluir "${item.texto}" e todos os preços dela?`)) cot.excluirItem.mutate(item.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {internet && <FormInternet item={item} cot={cot} onFim={() => setInternet(false)} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OpcaoPreco({ p, item, cot, escolhido }: { p: CotacaoPreco; item: CotacaoItem; cot: Cot; escolhido: boolean }) {
  const s = SITUACAO[p.situacao];
  const velho = Date.now() - new Date(p.created_at).getTime() > 30 * 86_400_000;
  const fonte = nomeFonte(p, cot.representantes);

  const confirmar = () => {
    cot.atualizarPreco.mutate({ id: p.id, situacao: 'cotado', confirmado: true });
    if (p.texto_original && p.fonte === 'representante') {
      // Tira a marca do fim ("... - VAZ") pra regra valer pra qualquer marca
      let desc = p.texto_original.slice(0, 200).trim();
      if (p.marca) {
        const m = p.marca.trim().toLowerCase();
        const sufixo = desc.toLowerCase().lastIndexOf(m);
        if (sufixo > 0 && sufixo + m.length >= desc.length - 1) desc = desc.slice(0, sufixo).replace(/[\s\-–·|,]+$/, '');
      }
      cot.adicionarRegra.mutate(`"${desc}" (de qualquer marca) é a peça que a loja chama de "${item.texto}".`);
    }
  };

  return (
    <div className={`rounded-md border p-2 text-sm space-y-1 ${escolhido ? 'border-primary bg-primary/5' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{fonte}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${s.cls}`}>{p.confirmado && p.situacao === 'cotado' ? 'Confirmado' : s.label}</span>
        {p.marca && <span>{p.marca}</span>}
        {p.preco != null && <b>{brl(p.preco)}{PRECO_POR[p.preco_por]}</b>}
        {p.frete != null && <span className="text-muted-foreground">+ frete {brl(p.frete)}</span>}
        <span className={`text-xs ${velho ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
          {diasAtras(p.created_at)}{velho ? ' (preço antigo)' : ''}
        </span>
      </div>
      {p.texto_original && <p className="text-xs text-muted-foreground">"{p.texto_original}"</p>}
      {p.motivo && p.situacao !== 'cotado' && <p className="text-xs">{p.motivo}</p>}
      {p.link && <a className="text-xs underline" href={p.link} target="_blank" rel="noreferrer">ver anúncio</a>}
      <div className="flex flex-wrap gap-2 pt-1">
        {p.situacao === 'duvida' && (
          <>
            <Button size="sm" variant="outline" onClick={confirmar}><Check className="h-4 w-4 mr-1" /> É essa (ensinar a IA)</Button>
            <Button size="sm" variant="outline" onClick={() => cot.atualizarPreco.mutate({ id: p.id, situacao: 'nao_serve' })}>
              <X className="h-4 w-4 mr-1" /> Não serve
            </Button>
          </>
        )}
        {p.situacao === 'cotado' && !escolhido && (
          <Button size="sm" onClick={() => cot.atualizarItem.mutate({ id: item.id, pedido_preco_id: p.id })}>
            <ShoppingCart className="h-4 w-4 mr-1" /> Escolher essa
          </Button>
        )}
        {escolhido && (
          <Button size="sm" variant="ghost" onClick={() => cot.atualizarItem.mutate({ id: item.id, pedido_preco_id: null })}>
            <Undo2 className="h-4 w-4 mr-1" /> Desfazer escolha
          </Button>
        )}
        {p.fonte === 'internet' && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cot.excluirPreco.mutate(p.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function FormInternet({ item, cot, onFim }: { item: CotacaoItem; cot: Cot; onFim: () => void }) {
  const [loja, setLoja] = useState('Mercado Livre');
  const [preco, setPreco] = useState('');
  const [frete, setFrete] = useState('');
  const [marca, setMarca] = useState('');
  const [link, setLink] = useState('');
  const num = (v: string) => (v.trim() ? Number(v.replace(/\./g, '').replace(',', '.')) : null);

  const salvar = () => {
    const p = num(preco);
    if (p == null || Number.isNaN(p)) return toast.error('Informe o preço');
    const f = num(frete);
    cot.adicionarPrecoInternet.mutate(
      { item_id: item.id, loja_internet: loja, preco: p, frete: f != null && !Number.isNaN(f) ? f : null, marca: marca.trim() || null, link: link.trim() || null },
      { onSuccess: onFim },
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2 rounded-md border p-2">
      <Select value={loja} onValueChange={setLoja}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="Mercado Livre">Mercado Livre</SelectItem>
          <SelectItem value="Shopee">Shopee</SelectItem>
          <SelectItem value="Outro site">Outro site</SelectItem>
        </SelectContent>
      </Select>
      <Input placeholder="Marca (opcional)" value={marca} onChange={(e) => setMarca(e.target.value)} />
      <Input placeholder="Preço (ex: 89,90)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
      <Input placeholder="Frete pro CEP da loja" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} />
      <Input className="col-span-2" placeholder="Link do anúncio (opcional)" value={link} onChange={(e) => setLink(e.target.value)} />
      <Button size="sm" className="col-span-2" onClick={salvar} disabled={cot.adicionarPrecoInternet.isPending}>Salvar preço</Button>
    </div>
  );
}

// ------------------------------------------------------------------ Pedir preço

function AbaPedir({ cot }: { cot: Cot }) {
  const pendentes = cot.itens.filter((i) => i.status === 'pendente' && !i.pedido_preco_id);
  const reps = [...cot.representantes.filter((r) => r.ativo)].sort((a, b) => (a.prazo_dias ?? 99) - (b.prazo_dias ?? 99));
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [repsMarcados, setRepsMarcados] = useState<Set<string>>(new Set());
  const [mensagemEditada, setMensagemEditada] = useState<string | null>(null);

  const selecionados = pendentes.filter((i) => !desmarcados.has(i.id));
  const mensagem = mensagemEditada ?? mensagemCotacao(selecionados);

  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    fn(n);
  };

  if (pendentes.length === 0) return <p className="text-sm text-muted-foreground mt-3">Nenhuma peça pendente pra cotar.</p>;

  return (
    <div className="space-y-4 mt-3">
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label>Peças ({selecionados.length} de {pendentes.length})</Label>
            <Button size="sm" variant="ghost" onClick={() => { setDesmarcados(new Set()); setMensagemEditada(null); }}>Marcar todas</Button>
          </div>
          {pendentes.map((i) => (
            <label key={i.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={!desmarcados.has(i.id)}
                onCheckedChange={() => { toggle(desmarcados, i.id, setDesmarcados); setMensagemEditada(null); }} />
              {i.texto}{Number(i.quantidade) !== 1 ? ` (${Number(i.quantidade)})` : ''}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <Label>Mensagem (pode editar antes de enviar)</Label>
          <Textarea rows={8} value={mensagem} onChange={(e) => setMensagemEditada(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label>Pra quem perguntar? (mais rápido primeiro)</Label>
            <Button size="sm" variant="ghost" onClick={() => setRepsMarcados(new Set(reps.map((r) => r.id)))}>Marcar todos</Button>
          </div>
          {reps.length === 0 && <p className="text-sm text-muted-foreground">Cadastre os representantes na aba "Representantes".</p>}
          {reps.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-2 border-b pb-2">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={repsMarcados.has(r.id)} onCheckedChange={() => toggle(repsMarcados, r.id, setRepsMarcados)} />
                <span>
                  <b>{r.nome}</b>
                  {r.tem_tabela && <span className="text-xs text-muted-foreground"> · tem tabela{r.tabela_atualizada_em ? ` (${diasAtras(r.tabela_atualizada_em)})` : ''}</span>}
                  <span className="block text-xs text-muted-foreground">{resumoEntrega(r).join(' · ') || 'Entrega não cadastrada'}</span>
                </span>
              </label>
              {repsMarcados.has(r.id) && (
                <Button size="sm" asChild disabled={!selecionados.length}>
                  <a href={linkWhats(r.whatsapp, mensagem)} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                  </a>
                </Button>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Quando a resposta chegar, cole na aba "Colar resposta". Representante que tem tabela: cole a tabela lá, sem precisar mandar mensagem.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Colar resposta

async function arquivoParaBase64(file: File): Promise<{ nome: string; tipo: string; base64: string }> {
  // Foto: reduz pra no máx. 2000px em JPEG (fica leve e a IA lê igual)
  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { nome: file.name, tipo: 'image/jpeg', base64: dataUrl.split(',')[1] };
  }
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('Não consegui ler o arquivo'));
    r.readAsDataURL(file);
  });
  return { nome: file.name, tipo: file.type, base64: dataUrl.split(',')[1] };
}

function AbaResposta({ cot, irParaFaltas }: { cot: Cot; irParaFaltas: () => void }) {
  const [repId, setRepId] = useState<string>('');
  const [texto, setTexto] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);
  const pendentes = cot.itens.filter((i) => i.status === 'pendente');

  const ler = async () => {
    if (!texto.trim() && !arquivo) return toast.error('Cole o texto ou anexe a foto/PDF');
    if (arquivo && arquivo.size > 15 * 1024 * 1024) return toast.error('Arquivo muito grande');
    let arq = null;
    try {
      arq = arquivo ? await arquivoParaBase64(arquivo) : null;
    } catch (e) {
      return toast.error((e as Error).message);
    }
    if (arq && arq.base64.length > 9_500_000) return toast.error('Arquivo muito grande (máx. 7 MB)');
    cot.lerResposta.mutate(
      { representante_id: repId || null, texto: texto.trim(), arquivo: arq },
      {
        onSuccess: (r) => {
          setUltima(r.resposta_id);
          setTexto('');
          setArquivo(null);
          toast.success(`IA leu ${r.total} linha(s)${r.duvidas ? `, ${r.duvidas} pra conferir` : ''}${r.sem_item ? `, ${r.sem_item} sem item` : ''}`);
        },
      },
    );
  };

  const [verOutras, setVerOutras] = useState(false);
  const todasSoltas = cot.precos.filter((p) => !p.item_id && p.resposta_id && (ultima ? p.resposta_id === ultima : true));
  // Dúvida/cotado sem peça pede atenção; "não serve"/"não tem" sem peça (óleo, vela...) fica escondido
  const importantes = todasSoltas.filter((p) => p.situacao === 'duvida' || p.situacao === 'cotado');
  const outras = todasSoltas.filter((p) => p.situacao === 'nao_serve' || p.situacao === 'nao_tem');
  const soltas = [...importantes, ...(verOutras ? outras : [])].slice(0, 40);

  return (
    <div className="space-y-4 mt-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <Label>Representante</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger><SelectValue placeholder="Quem respondeu?" /></SelectTrigger>
              <SelectContent>
                {cot.representantes.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Resposta (cole o texto do WhatsApp)</Label>
            <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="kit transmissao pop110 riffel 89,90..." />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <label className="cursor-pointer">
                <Paperclip className="h-4 w-4 mr-1" /> {arquivo ? 'Trocar arquivo' : 'Anexar foto ou PDF'}
                <input type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
              </label>
            </Button>
            {arquivo && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {arquivo.name}
                <button onClick={() => setArquivo(null)}><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>
          <Button onClick={ler} disabled={cot.lerResposta.isPending || pendentes.length === 0 || !repId} className="w-full">
            {cot.lerResposta.isPending
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> A IA está lendo...</>
              : <><Sparkles className="h-4 w-4 mr-1" /> Ler com IA</>}
          </Button>
          {!repId && <p className="text-xs text-muted-foreground">Escolha o representante antes.</p>}
          {pendentes.length === 0 && <p className="text-xs text-muted-foreground">A lista de faltas está vazia.</p>}
        </CardContent>
      </Card>

      {ultima && (
        <Button variant="outline" className="w-full" onClick={irParaFaltas}>Ver a comparação na aba Faltas</Button>
      )}

      {outras.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setVerOutras((v) => !v)}>
          {verOutras ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
          {verOutras ? 'Esconder' : 'Ver'} {outras.length} peça(s) da resposta que não estão na lista
        </Button>
      )}

      {soltas.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <Label className="flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-yellow-600" /> Linhas que a IA não ligou a nenhuma peça</Label>
            {soltas.map((p) => (
              <div key={p.id} className="text-sm border-b pb-2 space-y-1">
                <p>"{p.texto_original}" {p.preco != null && <b>{brl(p.preco)}</b>} <span className="text-muted-foreground">· {nomeFonte(p, cot.representantes)}</span></p>
                {p.motivo && <p className="text-xs text-muted-foreground">{p.motivo}</p>}
                <div className="flex gap-2">
                  <Select onValueChange={(itemId) => cot.atualizarPreco.mutate({ id: p.id, item_id: itemId })}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="É qual peça da lista?" /></SelectTrigger>
                    <SelectContent>
                      {pendentes.map((i) => <SelectItem key={i.id} value={i.id}>{i.texto}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="text-destructive" title="Descartar" onClick={() => cot.excluirPreco.mutate(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {cot.respostas.length > 0 && (
        <div className="space-y-1">
          <Label>Últimas respostas</Label>
          {cot.respostas.slice(0, 10).map((r) => (
            <div key={r.id} className="text-xs text-muted-foreground border-b py-1">
              <b className="text-foreground">{cot.representantes.find((x) => x.id === r.representante_id)?.nome ?? 'Sem representante'}</b>
              {' · '}{diasAtras(r.created_at)}
              {r.prazo_entrega && ` · prazo: ${r.prazo_entrega}`}
              {r.condicao_frete && ` · frete: ${r.condicao_frete}`}
              {r.arquivo_nome && ` · ${r.arquivo_nome}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Fazer pedido

function AbaPedidos({ cot }: { cot: Cot }) {
  const escolhidos = cot.itens.filter((i) => i.status === 'pendente' && i.pedido_preco_id);
  const grupos = new Map<string, { nome: string; rep: Representante | null; itens: { item: CotacaoItem; preco: CotacaoPreco }[] }>();

  for (const item of escolhidos) {
    const preco = cot.precos.find((p) => p.id === item.pedido_preco_id);
    if (!preco) continue;
    const chave = preco.fonte === 'internet' ? `internet:${preco.loja_internet ?? ''}` : preco.representante_id ?? 'sem';
    const rep = cot.representantes.find((r) => r.id === preco.representante_id) ?? null;
    if (!grupos.has(chave)) grupos.set(chave, { nome: nomeFonte(preco, cot.representantes), rep, itens: [] });
    grupos.get(chave)!.itens.push({ item, preco });
  }

  if (grupos.size === 0) {
    return <p className="text-sm text-muted-foreground mt-3">Nenhuma peça escolhida. Na aba Faltas, abra a peça e clique em "Escolher essa".</p>;
  }

  return (
    <div className="space-y-4 mt-3">
      {[...grupos.entries()].map(([chave, g]) => {
        const total = g.itens.reduce((s, { item, preco }) => s + (preco.preco ?? 0) * Number(item.quantidade), 0);
        const falta = g.rep?.pedido_minimo != null ? g.rep.pedido_minimo - total : null;
        const msg = `Bom dia! Pode me mandar:\n\n${g.itens.map(({ item, preco }) =>
          `- ${item.texto}${Number(item.quantidade) !== 1 ? ` (${Number(item.quantidade)})` : ''}${preco.marca ? ` - ${preco.marca}` : ''}`).join('\n')}\n\nObrigado!`;
        const marcarPedido = () => g.itens.forEach(({ item }) =>
          cot.atualizarItem.mutate({ id: item.id, status: 'pedido', pedido_em: new Date().toISOString() }));

        return (
          <Card key={chave}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <b>{g.nome}</b>
                <span className="font-semibold">{brl(total)}</span>
              </div>
              {g.rep && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3 w-3" /> {resumoEntrega(g.rep).join(' · ') || 'Entrega não cadastrada'}
                </p>
              )}
              {falta != null && falta > 0 && (
                <p className="text-xs text-yellow-600">Faltam {brl(falta)} pro frete grátis (mínimo {brl(g.rep!.pedido_minimo)}). Veja se tem mais alguma peça da lista com ele.</p>
              )}
              {g.itens.map(({ item, preco }) => (
                <div key={item.id} className="text-sm flex justify-between gap-2">
                  <span>{item.texto}{Number(item.quantidade) !== 1 ? ` × ${Number(item.quantidade)}` : ''}{preco.marca ? ` · ${preco.marca}` : ''}</span>
                  <span>{brl(preco.preco)}</span>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                {g.rep && (
                  <Button size="sm" asChild>
                    <a href={linkWhats(g.rep.whatsapp, msg)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" /> Enviar pedido</a>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={marcarPedido}><Check className="h-4 w-4 mr-1" /> Marcar como pedido</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Representantes

const VAZIO: Partial<Representante> = {
  nome: '', whatsapp: '', perfil: null, entrega_dia_semana: null, entrega_quinzenal: false, entrega_quinzenal_ref: null,
  pedido_minimo: null, prazo_dias: null, horario_corte: null, entrega_extra: null, frete_extra_valor: null,
  tem_tabela: false, tabela_atualizada_em: null, observacoes: '', ativo: true,
};

function AbaRepresentantes({ cot }: { cot: Cot }) {
  const [form, setForm] = useState<Partial<Representante> | null>(null);

  return (
    <div className="space-y-3 mt-3">
      <Button size="sm" onClick={() => setForm({ ...VAZIO })}><Plus className="h-4 w-4 mr-1" /> Novo representante</Button>
      {cot.representantes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum representante cadastrado.</p>}
      {cot.representantes.map((r) => (
        <Card key={r.id} className={r.ativo ? '' : 'opacity-60'}>
          <CardContent className="p-3 flex items-start justify-between gap-2">
            <div className="text-sm">
              <b>{r.nome}</b>
              {r.perfil && <Badge variant="outline" className="ml-2">{{ original: 'Original/premium', popular: 'Popular', marca_propria: 'Marca própria' }[r.perfil]}</Badge>}
              {!r.ativo && <Badge variant="outline" className="ml-2">Inativo</Badge>}
              <p className="text-xs text-muted-foreground">{r.whatsapp || 'Sem WhatsApp'}</p>
              <p className="text-xs text-muted-foreground">{resumoEntrega(r).join(' · ') || 'Entrega não cadastrada'}</p>
              {r.tem_tabela && <p className="text-xs text-muted-foreground">Tabela: {r.tabela_atualizada_em ? diasAtras(r.tabela_atualizada_em) : 'sem data'}</p>}
            </div>
            <div className="flex">
              <Button size="icon" variant="ghost" onClick={() => setForm({ ...r })}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive"
                onClick={() => { if (confirm(`Excluir ${r.nome}? Os preços dele continuam, mas sem nome.`)) cot.excluirRepresentante.mutate(r.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {form && <FormRepresentante inicial={form} cot={cot} onFechar={() => setForm(null)} />}
    </div>
  );
}

function FormRepresentante({ inicial, cot, onFechar }: { inicial: Partial<Representante>; cot: Cot; onFechar: () => void }) {
  const [f, setF] = useState<Partial<Representante>>(inicial);
  const set = <K extends keyof Representante>(k: K, v: Representante[K] | null) => setF((o) => ({ ...o, [k]: v }));
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  const salvar = () => {
    if (!f.nome?.trim()) return toast.error('Informe o nome');
    if (f.entrega_quinzenal && f.entrega_dia_semana != null && !f.entrega_quinzenal_ref) {
      return toast.error('Quinzenal: informe a data de uma entrega que já aconteceu');
    }
    cot.salvarRepresentante.mutate(
      { ...f, nome: f.nome.trim(), horario_corte: f.horario_corte || null, tabela_atualizada_em: f.tabela_atualizada_em || null, entrega_quinzenal_ref: f.entrega_quinzenal_ref || null },
      { onSuccess: onFechar },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{f.id ? 'Editar representante' : 'Novo representante'}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div><Label>Nome / empresa</Label><Input value={f.nome ?? ''} onChange={(e) => set('nome', e.target.value)} /></div>
          <div><Label>WhatsApp</Label><Input value={f.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="75 9 9999-9999" /></div>
          <div>
            <Label>Perfil</Label>
            <Select value={f.perfil ?? 'nenhum'} onValueChange={(v) => set('perfil', v === 'nenhum' ? null : (v as Representante['perfil']))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Não definido</SelectItem>
                <SelectItem value="original">Original / premium</SelectItem>
                <SelectItem value="popular">Popular</SelectItem>
                <SelectItem value="marca_propria">Marca própria</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="font-medium pt-2">Entrega grátis</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Dia fixo</Label>
              <Select value={f.entrega_dia_semana == null ? 'nenhum' : String(f.entrega_dia_semana)}
                onValueChange={(v) => set('entrega_dia_semana', v === 'nenhum' ? null : Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Ou pedido mínimo (R$)</Label><Input inputMode="decimal" value={f.pedido_minimo ?? ''} onChange={(e) => set('pedido_minimo', num(e.target.value))} /></div>
          </div>
          {f.entrega_dia_semana != null && (
            <div className="space-y-2">
              <label className="flex items-center gap-2"><Switch checked={!!f.entrega_quinzenal} onCheckedChange={(v) => set('entrega_quinzenal', v)} /> Semana sim, semana não</label>
              {f.entrega_quinzenal && (
                <div><Label>Data de uma entrega que já aconteceu</Label><Input type="date" value={f.entrega_quinzenal_ref ?? ''} onChange={(e) => set('entrega_quinzenal_ref', e.target.value)} /></div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Prazo (dias)</Label><Input inputMode="numeric" value={f.prazo_dias ?? ''} onChange={(e) => set('prazo_dias', num(e.target.value))} placeholder="0 = mesmo dia" /></div>
            <div><Label>Pedir até (horário)</Label><Input type="time" value={f.horario_corte?.slice(0, 5) ?? ''} onChange={(e) => set('horario_corte', e.target.value)} /></div>
          </div>

          <p className="font-medium pt-2">Entrega fora do dia grátis</p>
          <div className="grid grid-cols-2 gap-2">
            <Select value={f.entrega_extra ?? 'nenhum'} onValueChange={(v) => set('entrega_extra', v === 'nenhum' ? null : (v as Representante['entrega_extra']))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Não tem</SelectItem>
                <SelectItem value="van">Van</SelectItem>
                <SelectItem value="onibus">Ônibus</SelectItem>
                <SelectItem value="transportadora">Transportadora</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
            <Input inputMode="decimal" placeholder="Frete fixo R$ (vazio = varia)" value={f.frete_extra_valor ?? ''} onChange={(e) => set('frete_extra_valor', num(e.target.value))} />
          </div>

          <p className="font-medium pt-2">Tabela de preços</p>
          <label className="flex items-center gap-2"><Switch checked={!!f.tem_tabela} onCheckedChange={(v) => set('tem_tabela', v)} /> Manda tabela</label>
          {f.tem_tabela && (
            <div><Label>Última tabela recebida em</Label><Input type="date" value={f.tabela_atualizada_em ?? ''} onChange={(e) => set('tabela_atualizada_em', e.target.value)} /></div>
          )}
          <div><Label>Observações</Label><Textarea rows={2} value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></div>
          <label className="flex items-center gap-2"><Switch checked={f.ativo !== false} onCheckedChange={(v) => set('ativo', v)} /> Ativo</label>
          <Button className="w-full" onClick={salvar} disabled={cot.salvarRepresentante.isPending}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Dicionário

function AbaDicionario({ cot }: { cot: Cot }) {
  const [nova, setNova] = useState('');
  const [busca, setBusca] = useState('');
  const regras = cot.dicionario.filter((r) => matchesSearch(busca, r.regra));
  return (
    <div className="space-y-3 mt-3">
      <p className="text-sm text-muted-foreground flex items-start gap-1">
        <BookOpen className="h-4 w-4 mt-0.5 shrink-0" />
        O jeito que a loja fala. A IA lê essas regras antes de cada cotação. Quando você confirma uma "dúvida", ela aprende sozinha aqui.
      </p>
      <div className="flex gap-2">
        <Input value={nova} onChange={(e) => setNova(e.target.value)} placeholder='Ex: "câmara 18 grossa" = 3.50/4.00-18' />
        <Button size="sm" disabled={!nova.trim()} onClick={() => cot.adicionarRegra.mutate(nova.trim(), { onSuccess: () => setNova('') })}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {cot.dicionario.length > 5 && (
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar regra (com ou sem acento)" />
      )}
      {regras.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-2 border-b pb-2 text-sm">
          <span>{r.regra}</span>
          <Button size="icon" variant="ghost" className="text-destructive shrink-0"
            onClick={() => { if (confirm('Apagar essa regra?')) cot.excluirRegra.mutate(r.id); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
