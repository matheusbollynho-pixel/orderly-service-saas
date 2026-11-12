import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Check, Loader2, PackageX, Ban, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Página pública: o representante abre o link (sem login) e responde peça por peça.
// Uma peça pode ter VÁRIAS marcas (cada uma com valor próprio).

type Opcao = 'tenho' | 'nao_tenho' | 'nao_trabalho';
interface Item { id: string; texto: string; quantidade: number }
interface Marca { preco: string; marca: string; obs: string }
interface Resp { opcao: Opcao | null; marcas: Marca[]; obs: string }

const URL_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cotacao-link`;
const HEADERS = {
  'Content-Type': 'application/json',
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

const marcaVazia = (): Marca => ({ preco: '', marca: '', obs: '' });
const respVazia = (): Resp => ({ opcao: null, marcas: [marcaVazia()], obs: '' });
const valor = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'));

export default function CotarLinkPage() {
  const { token = '' } = useParams();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [loja, setLoja] = useState('');
  const [rep, setRep] = useState('');
  const [itens, setItens] = useState<Item[]>([]);
  const [resp, setResp] = useState<Record<string, Resp>>({});
  const [prazo, setPrazo] = useState('');
  const [obs, setObs] = useState('');
  const [vencido, setVencido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${URL_FN}?token=${encodeURIComponent(token)}`, { headers: HEADERS });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Link inválido.');
        setLoja(d.loja); setRep(d.representante); setItens(d.itens); setVencido(d.vencido);
        setPrazo(d.prazo ?? '');
        const ini: Record<string, Resp> = {};
        for (const it of d.itens as Item[]) ini[it.id] = respVazia();
        // Resposta anterior (o rep pode voltar e corrigir): várias linhas "cotado" = várias marcas
        for (const p of d.respostas as { item_id: string; situacao: string; preco: number | null; marca: string | null; motivo: string | null }[]) {
          if (!ini[p.item_id]) continue;
          if (p.situacao === 'cotado') {
            const m = { preco: p.preco != null ? String(p.preco).replace('.', ',') : '', marca: p.marca ?? '', obs: p.motivo ?? '' };
            const atual = ini[p.item_id];
            ini[p.item_id] = atual.opcao === 'tenho'
              ? { ...atual, marcas: [...atual.marcas, m] }
              : { opcao: 'tenho', marcas: [m], obs: '' };
          } else {
            const trab = (p.motivo ?? '').startsWith('Não trabalha');
            const extra = (p.motivo ?? '').split(': ').slice(1).join(': ');
            ini[p.item_id] = { opcao: trab ? 'nao_trabalho' : 'nao_tenho', marcas: [marcaVazia()], obs: extra };
          }
        }
        setResp(ini);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    })();
  }, [token]);

  const set = (id: string, campo: Partial<Resp>) => setResp((r) => ({ ...r, [id]: { ...r[id], ...campo } }));
  const setMarca = (id: string, i: number, campo: Partial<Marca>) =>
    setResp((r) => ({ ...r, [id]: { ...r[id], marcas: r[id].marcas.map((m, j) => (j === i ? { ...m, ...campo } : m)) } }));
  const addMarca = (id: string) => setResp((r) => ({ ...r, [id]: { ...r[id], marcas: [...r[id].marcas, marcaVazia()] } }));
  const delMarca = (id: string, i: number) => setResp((r) => ({ ...r, [id]: { ...r[id], marcas: r[id].marcas.filter((_, j) => j !== i) } }));
  const respondidas = Object.values(resp).filter((r) => r.opcao).length;

  const enviar = async () => {
    setAviso(null);
    for (const it of itens) {
      const r = resp[it.id];
      if (r?.opcao !== 'tenho') continue;
      const preenchidas = r.marcas.filter((m) => m.preco.trim() || m.marca.trim());
      if (preenchidas.length === 0 || preenchidas.some((m) => !(valor(m.preco) > 0))) {
        return setAviso(`Coloque o valor de "${it.texto}".`);
      }
    }
    if (respondidas === 0) return setAviso('Responda pelo menos uma peça.');
    setEnviando(true);
    try {
      const linhas = itens.flatMap((it): Record<string, unknown>[] => {
        const r = resp[it.id];
        if (!r?.opcao) return [];
        if (r.opcao !== 'tenho') return [{ item_id: it.id, opcao: r.opcao, obs: r.obs }];
        return r.marcas
          .filter((m) => m.preco.trim())
          .map((m) => ({ item_id: it.id, opcao: 'tenho', preco: valor(m.preco), marca: m.marca, obs: m.obs }));
      });
      const res = await fetch(URL_FN, { method: 'POST', headers: HEADERS, body: JSON.stringify({ token, prazo, obs, itens: linhas }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erro ao enviar.');
      setEnviado(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (erro) return <div className="min-h-screen flex items-center justify-center p-6 text-center">{erro}</div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto p-4 space-y-4 pb-24">
        <div>
          <h1 className="text-xl font-bold">{loja}</h1>
          <p className="text-sm text-muted-foreground">Cotação{rep ? ` para ${rep}` : ''}: marque o que tem e o valor de cada peça. Se tiver mais de uma marca, toque em "+ outra marca".</p>
        </div>

        {vencido && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">Esse link venceu. Peça um novo pra loja.</p>}
        {enviado && (
          <p className="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm flex items-center gap-2">
            <Check className="h-4 w-4" /> Enviado, obrigado! Se precisar corrigir, é só mudar e enviar de novo.
          </p>
        )}

        {itens.map((it) => {
          const r = resp[it.id] ?? respVazia();
          const botao = (op: Opcao, label: string, Icon: typeof Check) => (
            <button type="button" disabled={vencido}
              onClick={() => set(it.id, { opcao: r.opcao === op ? null : op })}
              className={cn('flex-1 rounded-md border py-3 text-sm font-medium flex items-center justify-center gap-1',
                r.opcao === op
                  ? op === 'tenho' ? 'bg-green-600 text-white border-green-600' : 'bg-neutral-700 text-white border-neutral-700'
                  : 'bg-background')}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          );
          return (
            <div key={it.id} className="rounded-lg border p-3 space-y-2">
              <p className="font-semibold">{it.texto}{Number(it.quantidade) !== 1 ? <span className="text-muted-foreground font-normal"> · Qtd: {Number(it.quantidade)}</span> : null}</p>
              <div className="flex gap-2">
                {botao('tenho', 'Tenho', Check)}
                {botao('nao_tenho', 'Não tenho', PackageX)}
                {botao('nao_trabalho', 'Não trabalho', Ban)}
              </div>

              {r.opcao === 'tenho' && (
                <div className="space-y-2">
                  {r.marcas.map((m, i) => (
                    <div key={i} className={cn('space-y-2', r.marcas.length > 1 && 'rounded-md border p-2')}>
                      <div className="flex gap-2">
                        <Input className="flex-1" placeholder="Marca" value={m.marca} onChange={(e) => setMarca(it.id, i, { marca: e.target.value })} />
                        <Input className="w-32" inputMode="decimal" placeholder="Valor (R$)" value={m.preco} onChange={(e) => setMarca(it.id, i, { preco: e.target.value })} />
                        {r.marcas.length > 1 && (
                          <button type="button" className="px-2 text-muted-foreground" onClick={() => delMarca(it.id, i)} aria-label="Tirar essa marca">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <Input placeholder="Observação (opcional)" value={m.obs} onChange={(e) => setMarca(it.id, i, { obs: e.target.value })} />
                    </div>
                  ))}
                  <button type="button" className="text-sm text-primary flex items-center gap-1" onClick={() => addMarca(it.id)}>
                    <Plus className="h-4 w-4" /> outra marca
                  </button>
                </div>
              )}

              {r.opcao && r.opcao !== 'tenho' && (
                <Input placeholder="Observação (opcional)" value={r.obs} onChange={(e) => set(it.id, { obs: e.target.value })} />
              )}
            </div>
          );
        })}

        <div className="space-y-2">
          <Input placeholder="Prazo de entrega (ex: sexta, amanhã)" value={prazo} onChange={(e) => setPrazo(e.target.value)} disabled={vencido} />
          <Textarea rows={2} placeholder="Observação geral (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} disabled={vencido} />
        </div>
      </div>

      {!vencido && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-3">
          <div className="max-w-lg mx-auto space-y-2">
            {aviso && <p className="text-sm text-red-600">{aviso}</p>}
            <Button className="w-full h-12 text-base" onClick={enviar} disabled={enviando}>
              {enviando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Enviar ({respondidas} de {itens.length})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
