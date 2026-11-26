// "Nova NF-e" (nota grande, cliente com CNPJ): a partir de uma venda do balcão ou avulsa (itens digitados).
// Dados do cliente vêm do cadastro (se a venda tem cliente) e do "Buscar CNPJ". A IE é digitada à mão.
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Loader2, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buscarCnpj, enderecoEmLinha } from '@/lib/cnpj';
import { chamarFiscal } from '@/lib/fiscal';
import { fmtCpf } from '@/lib/precoCliente';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');

type Indicador = '' | 'contribuinte' | 'isento' | 'nao_contribuinte';
interface Dest {
  documento: string; nome: string; ie: string; ieIndicador: Indicador; email: string; telefone: string;
  logradouro: string; numero: string; complemento: string; bairro: string; cep: string; cidade: string; uf: string; cidadeIbge: string;
}
const DEST_VAZIO: Dest = { documento: '', nome: '', ie: '', ieIndicador: '', email: '', telefone: '', logradouro: '', numero: '', complemento: '', bairro: '', cep: '', cidade: '', uf: '', cidadeIbge: '' };
interface ItemAvulso { descricao: string; quantidade: string; valor: string }
// Campo com rótulo (fora do componente: senão o campo perde o foco a cada letra digitada)
function C({ l, children, className = '' }: { l: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1 ${className}`}><Label className="text-xs text-muted-foreground">{l}</Label>{children}</div>;
}

export function NovaNfe({ aberto, onFechar, balcaoOrderId, orderId, clientId, clientNome, clientDoc }: {
  aberto: boolean;
  onFechar: () => void;
  /** Venda do balcão (itens e pagamento vêm dela). Sem venda nem OS = NF-e avulsa. */
  balcaoOrderId?: string;
  /** OS: a NF-e leva só as peças */
  orderId?: string;
  clientId?: string | null;
  clientNome?: string | null;
  clientDoc?: string | null;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState<Dest>(DEST_VAZIO);
  const [revende, setRevende] = useState(false);
  const [obs, setObs] = useState('');
  const [itens, setItens] = useState<ItemAvulso[]>([{ descricao: '', quantidade: '1', valor: '' }]);
  const [forma, setForma] = useState('transferencia');
  const [desconto, setDesconto] = useState('');
  const [salvarNoCadastro, setSalvarNoCadastro] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const set = (c: keyof Dest, v: string) => setD((x) => ({ ...x, [c]: v }));

  // Abre já com o que o cadastro do cliente tiver
  useEffect(() => {
    if (!aberto) return;
    setD({ ...DEST_VAZIO, documento: fmtCpf(clientDoc ?? ''), nome: clientNome ?? '' });
    setObs(''); setItens([{ descricao: '', quantidade: '1', valor: '' }]); setDesconto('');
    if (!clientId) return;
    db.from('clients').select('*').eq('id', clientId).maybeSingle().then(({ data: c }: { data: Record<string, string | null> | null }) => {
      if (!c) return;
      setD((x) => ({
        ...x,
        documento: fmtCpf(c.cpf ?? x.documento), nome: c.razao_social || c.name || x.nome, ie: c.ie ?? '', ieIndicador: (c.ie_indicador as Indicador) ?? '',
        email: c.email ?? '', telefone: c.phone ?? '', logradouro: c.logradouro ?? '', numero: c.numero ?? '', complemento: c.complemento ?? '',
        bairro: c.bairro ?? '', cep: c.cep ?? '', cidade: c.cidade ?? '', uf: c.state ?? '', cidadeIbge: c.cidade_ibge ?? '',
      }));
      if (c.ie_indicador === 'contribuinte') setRevende(true);
    });
  }, [aberto, clientId, clientNome, clientDoc]);

  const buscar = async () => {
    setBuscando(true);
    try {
      const r = await buscarCnpj(d.documento);
      setD((x) => ({
        ...x, documento: fmtCpf(r.cnpj), nome: r.razaoSocial, logradouro: r.logradouro, numero: r.numero, complemento: r.complemento,
        bairro: r.bairro, cep: r.cep, cidade: r.cidade, uf: r.uf, cidadeIbge: r.cidadeIbge,
        email: x.email || r.email, telefone: x.telefone || r.telefone,
      }));
      if (!r.ativa) toast.warning(`Atenção: CNPJ com situação "${r.situacao || 'desconhecida'}" na Receita.`);
      else toast.success('Dados preenchidos. Confira e digite a Inscrição Estadual.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  const emitir = async () => {
    const lista = itens.filter((i) => i.descricao.trim());
    if (!balcaoOrderId && !orderId && !lista.length) { toast.error('Adicione pelo menos um item.'); return; }
    setEnviando(true);
    try {
      const r = await chamarFiscal<{ status: string; motivo?: string | null; numero?: number | null }>({
        acao: 'emitir_nfe',
        destinatario: {
          documento: dig(d.documento), nome: d.nome.trim(), ie: d.ie.trim() || null, ieIndicador: d.ieIndicador || null,
          email: d.email.trim() || null, telefone: dig(d.telefone) || null, logradouro: d.logradouro.trim(), numero: d.numero.trim() || 'S/N',
          complemento: d.complemento.trim() || null, bairro: d.bairro.trim(), cep: dig(d.cep), cidade: d.cidade.trim(), uf: d.uf.trim().toUpperCase(), cidadeIbge: dig(d.cidadeIbge),
        },
        consumidor_final: !revende,
        observacao: obs.trim() || null,
        ...(balcaoOrderId ? { balcao_order_id: balcaoOrderId } : orderId ? { order_id: orderId } : {
          itens: lista.map((i) => ({ descricao: i.descricao.trim(), quantidade: Number(i.quantidade.replace(',', '.')) || 0, valor_unitario: Number(i.valor.replace(',', '.')) || 0 })),
          forma, desconto: Number(desconto.replace(',', '.')) || 0,
        }),
      });
      if (r.status === 'autorizada') toast.success(`NF-e nº ${r.numero ?? ''} autorizada!`);
      else if (r.status === 'rejeitada') toast.error(`NF-e recusada: ${r.motivo ?? 'veja no painel de notas'}`);
      else toast.success('NF-e enviada. Aguardando a SEFAZ...');
      // Guarda os dados no cadastro do cliente para a próxima vez
      if (clientId && salvarNoCadastro) {
        const { error } = await db.from('clients').update({
          razao_social: d.nome.trim() || null, ie: dig(d.ie) || (/isento/i.test(d.ie) ? 'ISENTO' : null), ie_indicador: d.ieIndicador || null,
          cep: dig(d.cep) || null, logradouro: d.logradouro.trim() || null, numero: d.numero.trim() || null, complemento: d.complemento.trim() || null,
          bairro: d.bairro.trim() || null, cidade_ibge: dig(d.cidadeIbge) || null, cidade: d.cidade.trim() || null, state: d.uf.trim().toUpperCase() || null,
          endereco: enderecoEmLinha({ logradouro: d.logradouro, numero: d.numero, complemento: d.complemento, bairro: d.bairro }) || null,
        }).eq('id', clientId);
        if (error) toast.warning('A nota foi enviada, mas não consegui salvar os dados no cadastro do cliente.');
      }
      qc.invalidateQueries({ queryKey: ['notas-fiscais'] });
      if (balcaoOrderId || orderId) qc.invalidateQueries({ queryKey: ['nota-venda', balcaoOrderId ?? orderId] });
      onFechar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const ehCnpj = dig(d.documento).length === 14;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{balcaoOrderId ? 'NF-e desta venda (cliente com CNPJ)' : orderId ? 'NF-e das peças desta OS (cliente com CNPJ)' : 'Nova NF-e avulsa'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <C l="CNPJ (ou CPF)">
              <div className="flex gap-2">
                <Input inputMode="numeric" value={d.documento} onChange={(e) => set('documento', e.target.value)} onBlur={() => set('documento', fmtCpf(d.documento))} />
                {ehCnpj && (
                  <Button type="button" variant="outline" className="shrink-0 gap-1.5" disabled={buscando} onClick={buscar}>
                    {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />} Buscar CNPJ
                  </Button>
                )}
              </div>
            </C>
            <C l="Razão social"><Input value={d.nome} onChange={(e) => set('nome', e.target.value)} /></C>
            <C l="Inscrição Estadual (IE)"><Input value={d.ie} onChange={(e) => set('ie', e.target.value)} placeholder="Números ou ISENTO" /></C>
            <C l="Contribuinte de ICMS?">
              <select value={d.ieIndicador} onChange={(e) => set('ieIndicador', e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Decidir pela IE</option>
                <option value="contribuinte">Sim, tem IE</option>
                <option value="isento">Isento de IE</option>
                <option value="nao_contribuinte">Não contribuinte</option>
              </select>
            </C>
            <C l="CEP"><Input inputMode="numeric" value={d.cep} onChange={(e) => set('cep', e.target.value)} /></C>
            <C l="Rua"><Input value={d.logradouro} onChange={(e) => set('logradouro', e.target.value)} /></C>
            <C l="Número"><Input value={d.numero} onChange={(e) => set('numero', e.target.value)} /></C>
            <C l="Complemento"><Input value={d.complemento} onChange={(e) => set('complemento', e.target.value)} /></C>
            <C l="Bairro"><Input value={d.bairro} onChange={(e) => set('bairro', e.target.value)} /></C>
            <div className="grid grid-cols-[1fr_70px] gap-2">
              <C l="Cidade"><Input value={d.cidade} onChange={(e) => set('cidade', e.target.value)} /></C>
              <C l="UF"><Input maxLength={2} value={d.uf} onChange={(e) => set('uf', e.target.value.toUpperCase())} /></C>
            </div>
            <C l="Código IBGE da cidade"><Input inputMode="numeric" value={d.cidadeIbge} onChange={(e) => set('cidadeIbge', e.target.value)} placeholder="Vem no Buscar CNPJ" /></C>
            <C l="E-mail (recebe a nota)"><Input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></C>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={revende} onChange={(e) => setRevende(e.target.checked)} /> Cliente vai revender ou usar no próprio negócio (não é consumidor final)
          </label>

          {!balcaoOrderId && !orderId && (
            <div className="space-y-2 rounded-lg border p-2.5">
              <p className="text-sm font-medium">Itens</p>
              {itens.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_100px_36px] gap-2">
                  <Input placeholder="Descrição" value={it.descricao} onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))} />
                  <Input inputMode="decimal" placeholder="Qtd" value={it.quantidade} onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} />
                  <Input inputMode="decimal" placeholder="R$ unit." value={it.valor} onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setItens((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : l))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setItens((l) => [...l, { descricao: '', quantidade: '1', valor: '' }])}><Plus className="h-4 w-4" /> Item</Button>
              <p className="text-[11px] text-muted-foreground">Item digitado usa o NCM padrão da loja. Nota avulsa não mexe no estoque nem no caixa.</p>
              <div className="grid grid-cols-2 gap-2">
                <C l="Forma de pagamento">
                  <select value={forma} onChange={(e) => setForma(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="transferencia">Transferência / boleto a prazo</option>
                    <option value="pix">Pix</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cartao_credito">Cartão de crédito</option>
                    <option value="cartao_debito">Cartão de débito</option>
                    <option value="boleto">Boleto</option>
                  </select>
                </C>
                <C l="Desconto (R$)"><Input inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="0,00" /></C>
              </div>
            </div>
          )}
          <C l="Observação na nota (opcional)"><Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: pedido nº 123" /></C>
          {clientId && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={salvarNoCadastro} onChange={(e) => setSalvarNoCadastro(e.target.checked)} /> Guardar estes dados no cadastro do cliente
            </label>
          )}
          <Button className="w-full gap-1.5" disabled={enviando} onClick={emitir}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />} Emitir NF-e
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
