import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Check, Loader2, PackageX, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

// Página pública: o representante abre o link (sem login) e responde peça por peça.

type Opcao = 'tenho' | 'nao_tenho' | 'nao_trabalho';
interface Item { id: string; texto: string; quantidade: number }
interface Resp { opcao: Opcao | null; preco: string; marca: string; obs: string }

const URL_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cotacao-link`;
const HEADERS = {
  'Content-Type': 'application/json',
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};

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
        for (const it of d.itens as Item[]) ini[it.id] = { opcao: null, preco: '', marca: '', obs: '' };
        for (const p of d.respostas as { item_id: string; situacao: string; preco: number | null; marca: string | null; motivo: string | null }[]) {
          if (!ini[p.item_id]) continue;
          if (p.situacao === 'cotado') {
            ini[p.item_id] = { opcao: 'tenho', preco: p.preco != null ? String(p.preco).replace('.', ',') : '', marca: p.marca ?? '', obs: p.motivo ?? '' };
          } else {
            const trab = (p.motivo ?? '').startsWith('Não trabalha');
            const extra = (p.motivo ?? '').split(': ').slice(1).join(': ');
            ini[p.item_id] = { opcao: trab ? 'nao_trabalho' : 'nao_tenho', preco: '', marca: '', obs: extra };
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
  const respondidas = Object.values(resp).filter((r) => r.opcao).length;

  const enviar = async () => {
    setAviso(null);
    const faltaValor = itens.find((it) => resp[it.id]?.opcao === 'tenho' && !(Number(resp[it.id].preco.replace(/\./g, '').replace(',', '.')) > 0));
    if (faltaValor) return setAviso(`Coloque o valor de "${faltaValor.texto}".`);
    if (respondidas === 0) return setAviso('Responda pelo menos uma peça.');
    setEnviando(true);
    try {
      const r = await fetch(URL_FN, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          token,
          prazo,
          obs,
          itens: itens.filter((it) => resp[it.id]?.opcao).map((it) => ({
            item_id: it.id,
            opcao: resp[it.id].opcao,
            preco: resp[it.id].opcao === 'tenho' ? Number(resp[it.id].preco.replace(/\./g, '').replace(',', '.')) : null,
            marca: resp[it.id].marca,
            obs: resp[it.id].obs,
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro ao enviar.');
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
          <p className="text-sm text-muted-foreground">Cotação{rep ? ` para ${rep}` : ''}: marque o que tem e o valor de cada peça.</p>
        </div>

        {vencido && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">Esse link venceu. Peça um novo pra loja.</p>}
        {enviado && (
          <p className="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-sm flex items-center gap-2">
            <Check className="h-4 w-4" /> Enviado, obrigado! Se precisar corrigir, é só mudar e enviar de novo.
          </p>
        )}

        {itens.map((it) => {
          const r = resp[it.id] ?? { opcao: null, preco: '', marca: '', obs: '' };
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
                <div className="grid grid-cols-2 gap-2">
                  <Input inputMode="decimal" placeholder="Valor (R$)" value={r.preco} onChange={(e) => set(it.id, { preco: e.target.value })} />
                  <Input placeholder="Marca" value={r.marca} onChange={(e) => set(it.id, { marca: e.target.value })} />
                </div>
              )}
              {r.opcao && (
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
