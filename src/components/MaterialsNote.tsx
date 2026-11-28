import { toast } from 'sonner';
import { matchesSearch } from '@/lib/textSearch';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { Material, Mechanic, PaymentMethod } from '@/types/service-order';
import type { InventoryProduct } from '@/hooks/useInventory';
import { useStore } from '@/contexts/StoreContext';
import { useColaboradorLogado } from '@/hooks/useColaboradorLogado';
import { useTipoDoCliente, useTiposCliente } from '@/hooks/useTiposCliente';
import { digitadoParaCliente, economiaUnit, precoParaCliente, servicoParaCliente, tipoEmDia } from '@/lib/precoCliente';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { fracaoDaEmbalagem, origemPadrao, qtdEstoque, textoParte, unidadesDoConteudo, type Origem } from '@/lib/almoxarifado';

// Campos do almoxarifado que ainda não estão nos tipos gerados do banco
type ProdutoAlmox = InventoryProduct & { uso?: string | null; conteudo_qtd?: number | null; conteudo_unidade?: string | null; stock_almox?: number | null };

// Produto vendido por litro, metro ou quilo pode ser usado aos poucos na OS
// (ex.: 150 ml de um frasco de 1 L). O estoque continua na unidade do produto.
const FRACAO: Record<string, { pequena: string; grande: string; fator: number }> = {
  l: { pequena: 'ml', grande: 'L', fator: 1000 },
  m: { pequena: 'cm', grande: 'm', fator: 100 },
  kg: { pequena: 'g', grande: 'kg', fator: 1000 },
};
const ehFracionado = (q: string) => !Number.isInteger(parseFloat(String(q).replace(',', '.')));
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface MaterialsNoteProps {
  materiais: Material[];
  mecanicos?: Mechanic[];
  inventoryProducts?: InventoryProduct[];
  onAddMaterial: (material: Omit<Material, 'id' | 'created_at' | 'updated_at'>) => void;
  onRemoveMaterial: (id: string) => void;
  onUpdateMaterial: (id: string, field: string, value: string) => void;
  /** Cliente da OS: se tiver tipo (Lojista etc.), peça/serviço saem com o preço dele */
  clientId?: string | null;
  disabled?: boolean;
  loadingAdd?: boolean;
  loadingUpdate?: boolean;
  loadingDelete?: boolean;
}

export function MaterialsNote({
  materiais,
  mecanicos = [],
  inventoryProducts = [],
  onAddMaterial,
  onRemoveMaterial,
  onUpdateMaterial,
  clientId,
  disabled = false,
  loadingAdd = false,
  loadingUpdate = false,
  loadingDelete = false
}: MaterialsNoteProps) {
  // Sem a permissão "Editar ou remover itens da OS": só adiciona (o banco também confere)
  const { permissions } = useStore();
  const podeEditar = permissions.editar_itens_os !== false;
  // Login de um mecânico/capoteiro: o item novo já sai no nome dele
  const eu = useColaboradorLogado();
  const meuMecanico = eu?.tipo === 'mecanico' ? eu.id : undefined;
  // Tipo do cliente (Lojista etc.), se a loja usa e se vale na OS
  const { data: tiposCli = [] } = useTiposCliente();
  const { data: tipoCli } = useTipoDoCliente(clientId);
  const tipoAchado = clientId ? tiposCli.find((t) => t.id === tipoCli?.tipo_cliente_id) : undefined;
  const tipoOS = tipoAchado && tipoEmDia(tipoAchado, tipoCli?.tipo_valido_ate) ? tipoAchado : null;
  const tipoPecas = tipoOS && tipoOS.vale_pecas_os !== false ? tipoOS : null;
  const tipoServico = tipoOS && tipoOS.vale_servico_os && tipoOS.desconto_pct > 0 ? tipoOS : null;
  const precoPeca = (p: InventoryProduct) => precoParaCliente(p, tipoPecas);
  // Valor final do item novo: serviço (se o tipo vale no serviço) ou peça digitada fora do estoque
  const finalDoNovo = (digitado: number) => newMaterial.is_service
    ? servicoParaCliente(digitado, tipoServico)
    : !newMaterial.product_id ? digitadoParaCliente(digitado, tipoPecas) : digitado;
  const vazio = () => ({ quantidade: '01', descricao: '', valor: '', is_service: false, mechanic_id: meuMecanico, product_id: undefined as string | undefined });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  // Nome do item digitado à mão (sem estoque) em edição
  const [editingNomes, setEditingNomes] = useState<Record<string, string>>({});
  const [fracao, setFracao] = useState({ valor: '', unidade: 'pequena' as 'pequena' | 'grande', cobrar: false });
  // Almoxarifado ligado: de onde sai o item, quem retirou e se usou só parte da embalagem
  const { settings: lojaCfg } = useStoreSettings();
  const usaAlmox = !!(lojaCfg as { usa_almoxarifado?: boolean } | null)?.usa_almoxarifado;
  const [origem, setOrigem] = useState<Origem>('almox');
  const [retirou, setRetirou] = useState('');
  const [parte, setParte] = useState<{ fracao: number | null; medida: string; unidade: string }>({ fracao: null, medida: '', unidade: '' });
  const [newMaterial, setNewMaterial] = useState<{ quantidade: string; descricao: string; valor: string; is_service: boolean; mechanic_id: string | undefined; product_id: string | undefined }>(vazio);
  // O nome do login chega depois (lista de mecânicos carregando)
  useEffect(() => {
    if (meuMecanico) setNewMaterial((m) => (m.mechanic_id ? m : { ...m, mechanic_id: meuMecanico }));
  }, [meuMecanico]);
  const [suggestions, setSuggestions] = useState<InventoryProduct[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const looksLikeService = (text: string) => {
    const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /servi[cs]/.test(normalized); // serviço, servico, serviso, serviços...
  };

  const handleDescricaoChange = (value: string) => {
    const autoService = looksLikeService(value);
    setNewMaterial((prev) => ({
      ...prev,
      descricao: value,
      product_id: undefined,
      is_service: autoService ? true : prev.is_service,
    }));
    if (inventoryProducts.length > 0) {
      const q = value.trim().toLowerCase();
      const found = q.length === 0
        ? inventoryProducts.filter((p) => p.active).slice(0, 8)
        : inventoryProducts
            .filter((p) => p.active && matchesSearch(q, p.name, p.code))
            .slice(0, 8);
      setSuggestions(found);
      setShowSuggestions(true);
    }
  };

  const handleDescricaoFocus = () => {
    if (inventoryProducts.length > 0 && !newMaterial.product_id) {
      const q = newMaterial.descricao.trim().toLowerCase();
      const found = q.length === 0
        ? inventoryProducts.filter((p) => p.active).slice(0, 8)
        : inventoryProducts
            .filter((p) => p.active && matchesSearch(q, p.name, p.code))
            .slice(0, 8);
      setSuggestions(found);
      setShowSuggestions(true);
    }
  };

  const handleSelectProduct = (product: InventoryProduct) => {
    setFracao({ valor: '', unidade: 'pequena', cobrar: false });
    const pa = product as ProdutoAlmox;
    setOrigem(origemPadrao(pa.uso));
    setParte({ fracao: null, medida: '', unidade: pa.conteudo_unidade || '' });
    // Quem retirou: já vem com o mecânico do login (ou o último escolhido)
    if (!retirou && meuMecanico) setRetirou(mecanicos.find((m) => m.id === meuMecanico)?.name ?? '');
    setNewMaterial((prev) => ({
      ...prev,
      descricao: product.name,
      valor: String(precoPeca(product)),
      product_id: product.id,
    }));
    setShowSuggestions(false);
  };

  const total = materiais.reduce((sum, m) => {
    const qtd = parseFloat(m.quantidade) || 0;
    return sum + ((m.valor || 0) * qtd);
  }, 0);
  // Desconto do tipo de cliente que já está nos valores (Lojista etc.)
  const economiaTipo = materiais.reduce((s, m) => s + economiaUnit(m, Number(m.valor) || 0) * (parseFloat(String(m.quantidade).replace(',', '.')) || 0), 0);
  const nomeTipoOS = materiais.find((m) => economiaUnit(m, Number(m.valor) || 0) > 0)?.tipo_preco ?? '';

  // Produto escolhido do estoque que pode ser usado fracionado
  const produtoSel = newMaterial.product_id ? inventoryProducts.find((p) => p.id === newMaterial.product_id) : undefined;
  const fr = produtoSel ? FRACAO[(produtoSel.unit || '').toLowerCase()] : undefined;
  const fracNum = parseFloat(fracao.valor.replace(',', '.')) || 0;
  const fracBase = fr ? (fracao.unidade === 'pequena' ? fracNum / fr.fator : fracNum) : 0;

  // Almoxarifado: só para produto do estoque que não é serviço, em loja com almoxarifado ligado
  const prodAlmox = produtoSel as ProdutoAlmox | undefined;
  const almoxNoItem = usaAlmox && !!produtoSel && !newMaterial.is_service;
  const conteudo = almoxNoItem && !fr && Number(prodAlmox?.conteudo_qtd) > 0
    ? { qtd: Number(prodAlmox!.conteudo_qtd), un: prodAlmox!.conteudo_unidade || 'ml' } : null;
  const podeParte = almoxNoItem && !fr;
  const medidaNum = parseFloat(parte.medida.replace(',', '.')) || 0;
  const parteFrac = !podeParte ? 0
    : parte.fracao ?? (conteudo && medidaNum > 0 ? (fracaoDaEmbalagem(medidaNum, parte.unidade || conteudo.un, conteudo.qtd, conteudo.un) ?? 0) : 0);
  const usandoParte = parteFrac > 0;
  const mecanicosAtivos = mecanicos.filter((m) => m.active);
  const precisaRetirou = almoxNoItem && origem === 'almox' && mecanicosAtivos.length > 0;
  const limparParte = () => setParte({ fracao: null, medida: '', unidade: prodAlmox?.conteudo_unidade || '' });

  const handleAddMaterial = () => {
    if (precisaRetirou && !retirou) {
      toast.error('Escolha quem retirou o material do almoxarifado.');
      return;
    }
    // De onde sai e quem retirou (o banco decide pela escolha; sem almoxarifado, sempre loja)
    const extrasAlmox: Record<string, unknown> = almoxNoItem
      ? { origem, ...(origem === 'almox' && retirou ? { retirado_por: retirou } : {}) } : {};
    if (usandoParte && produtoSel) {
      if (parteFrac < 0.001) { toast.error('Quantidade muito pequena.'); return; }
      if (parteFrac > 1.0005) { toast.error(`Passou de 1 ${produtoSel.unit}. Lance as inteiras na quantidade e o resto como parte.`); return; }
      const txt = parte.fracao ? `${textoParte(parte.fracao)} ${produtoSel.unit}` : `${parte.medida.replace('.', ',')} ${parte.unidade || conteudo!.un}`;
      onAddMaterial({
        quantidade: String(qtdEstoque(parteFrac)),
        descricao: `${newMaterial.descricao} (${txt})`,
        // Sem "Cobrar do cliente": sai do estoque mas não soma no valor da OS
        valor: fracao.cobrar ? (parseFloat(newMaterial.valor) || 0) : 0,
        is_service: false,
        product_id: newMaterial.product_id,
        ...extrasAlmox,
      } as unknown as Omit<Material, 'id' | 'created_at' | 'updated_at'>);
      setNewMaterial(vazio());
      setFracao({ valor: '', unidade: 'pequena', cobrar: false });
      limparParte();
      setShowSuggestions(false);
      return;
    }
    if (fr && produtoSel) {
      if (!fracNum || fracNum <= 0) {
        toast.error(`Informe quanto foi usado (em ${fr.pequena} ou ${fr.grande}).`);
        return;
      }
      if (fracBase < 0.001) {
        toast.error(`Quantidade muito pequena. O mínimo é 1 ${fr.pequena === 'cm' ? 'mm' : fr.pequena}.`);
        return;
      }
      const unidadeTxt = fracao.unidade === 'pequena' ? fr.pequena : fr.grande;
      onAddMaterial({
        quantidade: String(Number(fracBase.toFixed(3))),
        descricao: `${newMaterial.descricao} (${String(fracNum).replace('.', ',')} ${unidadeTxt})`,
        // Sem "Cobrar do cliente": sai do estoque mas não soma no valor da OS
        valor: fracao.cobrar ? (parseFloat(newMaterial.valor) || 0) : 0,
        is_service: false,
        product_id: newMaterial.product_id,
        ...extrasAlmox,
      } as unknown as Omit<Material, 'id' | 'created_at' | 'updated_at'>);
      setNewMaterial(vazio());
      setFracao({ valor: '', unidade: 'pequena', cobrar: false });
      setShowSuggestions(false);
      return;
    }
    if (!newMaterial.descricao || !newMaterial.quantidade || !newMaterial.valor) {
      toast.error('Preencha todos os campos para adicionar material');
      return;
    }
    if (newMaterial.is_service && !newMaterial.mechanic_id) {
      toast.error('Selecione o mecânico responsável pelo serviço antes de adicionar.');
      return;
    }

    const digitado = parseFloat(newMaterial.valor) || 0;
    // Serviço de cliente com tipo (ex.: Lojista 10%) sai com o desconto, se o tipo vale no serviço
    // Peça digitada (fora do estoque) leva o desconto % se o tipo vale nas peças
    const valorFinal = finalDoNovo(digitado);
    const tipoAplicado = newMaterial.is_service ? tipoServico : tipoPecas;
    if (valorFinal !== digitado) toast.success(`${newMaterial.is_service ? 'Serviço' : 'Peça'} com ${tipoAplicado!.desconto_pct}% de ${tipoAplicado!.nome}: R$ ${brl(valorFinal)}`);
    // Guarda o preço normal quando saiu com preço do tipo (destaque na OS e no PDF)
    let destaque: { preco_tabela: number; tipo_preco: string } | null = null;
    if (valorFinal < digitado - 0.004 && tipoAplicado) {
      destaque = { preco_tabela: digitado, tipo_preco: tipoAplicado.nome };
    } else if (!newMaterial.is_service && produtoSel && tipoPecas) {
      const normal = Number(produtoSel.sale_price) || 0;
      if (Math.abs(digitado - precoPeca(produtoSel)) < 0.005 && digitado < normal - 0.004) destaque = { preco_tabela: normal, tipo_preco: tipoPecas.nome };
    }
    const payload: Record<string, unknown> = {
      ...(destaque ?? {}),
      quantidade: newMaterial.quantidade,
      descricao: newMaterial.descricao,
      valor: valorFinal,
      is_service: newMaterial.is_service,
    };

    if (newMaterial.mechanic_id) payload.mechanic_id = newMaterial.mechanic_id;
    if (newMaterial.product_id) payload.product_id = newMaterial.product_id;
    Object.assign(payload, extrasAlmox);

    onAddMaterial(payload);

    setNewMaterial(vazio());
    setShowSuggestions(false);
  };

  return (
    <div className="mt-8 space-y-4">
      <div className="glass-card-elevated rounded-lg border border-border/50 p-6 shadow-md">
        <h3 className="text-xl font-bold text-foreground mb-1">📋 Peças e Serviços</h3>
        <p className="text-sm text-muted-foreground mb-4">Materiais e peças utilizadas</p>
        {(tipoPecas || tipoServico) && (
          <p className="-mt-3 mb-4 text-xs font-medium text-emerald-500">
            Cliente {tipoOS!.nome}: {[tipoPecas ? `peças com o preço dele${tipoPecas.desconto_pct > 0 ? ` (digitadas: ${tipoPecas.desconto_pct}% off)` : ''}` : null, tipoServico ? `serviço com ${tipoServico.desconto_pct}% de desconto` : null].filter(Boolean).join(' e ')}.
          </p>
        )}
        {tipoAchado && !tipoOS && (
          <p className="-mt-3 mb-4 text-xs font-medium text-amber-500">Cliente {tipoAchado.nome} vencido: preço normal.</p>
        )}

        {materiais.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">Nenhum material adicionado ainda</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {/* Cabeçalho simplificado */}
            <div className="grid grid-cols-12 gap-2 bg-[#C1272D]/10 p-2 rounded font-semibold text-xs text-foreground">
              <div className="col-span-1"></div>
              <div className="col-span-7">DESCRIÇÃO</div>
              <div className="col-span-2">QTD/VALOR</div>
              <div className="col-span-2">AÇÃO</div>
            </div>

            {/* Linhas de materiais - Expandível */}
            {materiais.map((material) => (
              <div key={material.id}>
                <div 
                  className="grid grid-cols-12 gap-2 bg-muted/30 p-2 rounded border border-border/50 items-center hover:bg-muted/50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === material.id ? null : material.id)}
                >
                  <div className="col-span-1 flex justify-center">
                    {expandedId === material.id ? (
                      <ChevronUp className="h-4 w-4 text-[#C1272D]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[#C1272D]" />
                    )}
                  </div>
                  <div className="col-span-7 text-sm font-medium text-foreground flex items-center gap-1">
                    {material.descricao}
                    {material.product_id && <Package className="h-3 w-3 text-green-600 flex-shrink-0" title="Vinculado ao estoque" />}
                    {(material as { origem?: string | null }).origem === 'almox' && (
                      <span className="rounded bg-blue-500/15 px-1.5 text-[10px] font-semibold text-blue-500 flex-shrink-0">almox.</span>
                    )}
                    {economiaUnit(material, Number(material.valor) || 0) > 0 && (
                      <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-500 flex-shrink-0">Preço {material.tipo_preco}</span>
                    )}
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {economiaUnit(material, Number(material.valor) || 0) > 0 && (
                      <s className="block text-[11px]">R$ {Number(material.preco_tabela).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</s>
                    )}
                    {String(material.quantidade).replace('.', ',')} × R$ {parseFloat(String(material.valor)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    {podeEditar && <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveMaterial(material.id);
                      }}
                      disabled={disabled}
                      className="h-7 w-7 p-0 text-[#C1272D] hover:text-red-600 hover:bg-red-50/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>}
                  </div>
                </div>

                {/* Detalhe expandível */}
                {expandedId === material.id && (
                  <div className="bg-muted/50 border border-border/50 border-t-0 p-3 rounded-b space-y-3">
                    {!podeEditar && (
                      <p className="text-xs text-muted-foreground">Para tirar ou mudar este item, chame o gerente.</p>
                    )}
                    {(material as { retirado_por?: string | null }).retirado_por && (
                      <p className="text-xs text-muted-foreground">Retirado do almoxarifado por <strong>{(material as { retirado_por?: string | null }).retirado_por}</strong></p>
                    )}
                    {/* Item digitado à mão (não veio do estoque): dá para corrigir o nome */}
                    {!material.product_id && (
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-1">Descrição</label>
                        <input
                          type="text"
                          value={editingNomes[material.id] !== undefined ? editingNomes[material.id] : material.descricao}
                          onChange={(e) => { const v = e.target.value; setEditingNomes(prev => ({ ...prev, [material.id]: v })); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          onBlur={(e) => {
                            const nome = e.target.value.trim();
                            if (editingNomes[material.id] !== undefined && nome && nome !== material.descricao) {
                              onUpdateMaterial(material.id, 'descricao', nome);
                            } else if (!nome) {
                              toast.error('O nome do item não pode ficar vazio.');
                            }
                            setEditingNomes(prev => { const n = { ...prev }; delete n[material.id]; return n; });
                          }}
                          disabled={disabled || !podeEditar}
                          spellCheck
                          lang="pt-BR"
                          className="h-8 text-sm bg-muted/50 border-border/50 flex w-full rounded-md border border-input bg-transparent px-3 py-1 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>
                    )}
                    <div className="flex gap-2 items-end">
                      {ehFracionado(material.quantidade) ? (
                        <div className="text-xs text-muted-foreground max-w-[12rem]">
                          Quantidade fracionada ({String(material.quantidade).replace('.', ',')}). Para mudar, remova e lance de novo.
                        </div>
                      ) : (
                      <div className="w-16">
                        <label className="text-xs font-semibold text-foreground block mb-1">Quantidade</label>
                        <Select value={material.quantidade || '01'} onValueChange={(value) => onUpdateMaterial(material.id, 'quantidade', value)} disabled={disabled || !podeEditar}>
                          <SelectTrigger className="h-8 text-xs text-center bg-muted/50 border-border/50" disabled={disabled || !podeEditar}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 99 }, (_, i) => (i + 1).toString().padStart(2, '0')).map((num) => (
                              <SelectItem key={num} value={num}>{num}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      )}
                      <div className="w-24">
                        <label className="text-xs font-semibold text-foreground block mb-1">Valor (R$)</label>
                        <input
                          type="text"
                          value={editingValues[material.id] !== undefined ? editingValues[material.id] : material.valor}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Aceita vírgula (5,50) ou ponto (5.50)
                            if (value === '' || /^\d*[.,]?\d{0,2}$/.test(value)) {
                              setEditingValues(prev => ({ ...prev, [material.id]: value }));
                            }
                          }}
                          onBlur={(e) => {
                            const value = e.target.value.replace(',', '.');
                            if (editingValues[material.id] !== undefined && value !== '' && Number(value) !== Number(material.valor)) {
                              onUpdateMaterial(material.id, 'valor', value);
                            }
                            setEditingValues(prev => {
                              const newValues = { ...prev };
                              delete newValues[material.id];
                              return newValues;
                            });
                          }}
                          disabled={disabled || !podeEditar}
                          inputMode="decimal"
                          className="h-8 text-xs text-right bg-muted/50 border-border/50 flex w-full rounded-md border border-input bg-transparent px-3 py-1 shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          placeholder="0,00"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox 
                        checked={material.is_service || false} 
                        onCheckedChange={(checked) => onUpdateMaterial(material.id, 'is_service', String(Boolean(checked)))}
                        disabled={disabled || !podeEditar}
                        className="h-4 w-4"
                      />
                      <span className="text-xs font-medium text-foreground">Serviço</span>
                    </div>

                    {material.is_service && (
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-1">Mecânico</label>
                        <Select value={material.mechanic_id || 'none'} onValueChange={(value) => onUpdateMaterial(material.id, 'mechanic_id', value === 'none' ? '' : value)} disabled={disabled}>
                          <SelectTrigger className="h-8 text-xs bg-muted/50 border-border/50">
                            <SelectValue placeholder="Nenhum" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            {mecanicos.filter(m => m.active).map(m => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {economiaTipo > 0 && (
              <div className="grid grid-cols-12 gap-2 bg-emerald-500/10 p-2 rounded font-semibold text-emerald-500 text-xs mt-2">
                <div className="col-span-9">DESCONTO {nomeTipoOS.toUpperCase()} (JÁ NOS VALORES):</div>
                <div className="col-span-3 text-right">- R$ {economiaTipo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
            )}
            {/* Total */}
            <div className="grid grid-cols-12 gap-2 bg-[#C1272D]/20 p-2 rounded font-bold text-foreground text-xs mt-2">
              <div className="col-span-9">TOTAL:</div>
              <div className="col-span-3 text-right">
                R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}

        {!disabled && (
          <div className="border-t border-border/30 pt-4 space-y-3">
            <h4 className="font-semibold text-foreground text-sm">Adicionar novo material</h4>
            <div className="space-y-3">
              <div className="flex gap-2 items-end">
                {fr ? (
                  <div className="w-32">
                    <label className="text-xs font-semibold text-foreground block mb-1">Quanto usou</label>
                    <div className="flex gap-1">
                      <Input
                        inputMode="decimal"
                        placeholder="150"
                        value={fracao.valor}
                        onChange={(e) => setFracao({ ...fracao, valor: e.target.value.replace(/[^\d.,]/g, '') })}
                        className="h-8 text-xs text-right bg-muted/50 border-border/50"
                      />
                      <Select value={fracao.unidade} onValueChange={(v) => setFracao({ ...fracao, unidade: v as 'pequena' | 'grande' })}>
                        <SelectTrigger className="h-8 w-16 text-xs bg-muted/50 border-border/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pequena">{fr.pequena}</SelectItem>
                          <SelectItem value="grande">{fr.grande}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : usandoParte ? (
                  <div className="w-16">
                    <label className="text-xs font-semibold text-foreground block mb-1">Qtd</label>
                    <div className="h-8 flex items-center justify-center rounded-md border border-border/50 bg-muted/50 text-xs">parte</div>
                  </div>
                ) : (
                <div className="w-16">
                  <label className="text-xs font-semibold text-foreground block mb-1">Qtd</label>
                  <Select value={newMaterial.quantidade || '01'} onValueChange={(value) => setNewMaterial({ ...newMaterial, quantidade: value })}>
                    <SelectTrigger className="h-8 text-xs text-center bg-muted/50 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 99 }, (_, i) => (i + 1).toString().padStart(2, '0')).map((num) => (
                        <SelectItem key={num} value={num}>{num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                )}
                <div className="flex-1 relative" ref={suggestionsRef}>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Descrição{' '}
                    {newMaterial.product_id
                      ? <span className="text-green-600 ml-1 font-normal">✓ vinculado ao estoque — dará baixa automática</span>
                      : newMaterial.descricao && inventoryProducts.length > 0
                        ? <span className="text-amber-500 ml-1 font-normal">⚠ selecione do dropdown para dar baixa no estoque</span>
                        : null
                    }
                  </label>
                  <Textarea
                    placeholder="Clique para buscar no estoque ou digite livremente..."
                    value={newMaterial.descricao}
                    onChange={(e) => handleDescricaoChange(e.target.value)}
                    onFocus={handleDescricaoFocus}
                    disabled={disabled}
                    autoComplete="off"
                    spellCheck
                    lang="pt-BR"
                    rows={1}
                    className="h-8 min-h-0 py-1 resize-none bg-muted/50 border-border/50"
                  />
                  {showSuggestions && (
                    <div className="absolute top-full left-0 right-0 z-[100] mt-1 rounded-md border border-border bg-popover shadow-lg max-h-52 overflow-y-auto">
                      {suggestions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum produto encontrado</div>
                      ) : (
                        suggestions.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleSelectProduct(p); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted transition-colors"
                          >
                            <Package className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium truncate block">{p.name}</span>
                              <span className="text-muted-foreground">{p.code} · Estoque: {p.stock_current} {p.unit} · R$ {precoPeca(p).toFixed(2)}{tipoPecas && precoPeca(p) !== p.sale_price ? ` (${tipoPecas.nome})` : ''}</span>
                            </div>
                            {p.stock_current <= 0 && <span className="text-red-500 flex-shrink-0">Zerado</span>}
                            {p.stock_current > 0 && p.stock_current <= p.stock_minimum && <span className="text-orange-500 flex-shrink-0">Baixo</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="w-24">
                  <label className="text-xs font-semibold text-foreground block mb-1">{fr ? `R$ por ${fr.grande}` : 'Valor (R$)'}</label>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={newMaterial.valor}
                    onChange={(e) => setNewMaterial({ ...newMaterial, valor: e.target.value })}
                    disabled={disabled}
                    className="h-8 text-xs text-right bg-muted/50 border-border/50"
                  />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex items-center gap-1 flex-1">
                  <Checkbox 
                    checked={newMaterial.is_service} 
                    onCheckedChange={(checked) => setNewMaterial({ ...newMaterial, is_service: Boolean(checked) })}
                    disabled={disabled}
                    className="h-4 w-4"
                  />
                  <span className="text-xs font-medium leading-none text-foreground">Serviço</span>
                </div>
                {(parseFloat(newMaterial.valor) || 0) > 0 && finalDoNovo(parseFloat(newMaterial.valor) || 0) < (parseFloat(newMaterial.valor) || 0) && (
                  <span className="text-xs text-emerald-500">{tipoOS!.nome}: sai R$ {brl(finalDoNovo(parseFloat(newMaterial.valor) || 0))}</span>
                )}
              </div>
              {almoxNoItem && (
                <div className="rounded-md border border-border/50 bg-muted/30 p-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground">Sai de:</span>
                    {(['loja', 'almox'] as Origem[]).map((o) => {
                      const saldo = o === 'loja' ? Number(produtoSel!.stock_current) || 0 : Number(prodAlmox?.stock_almox) || 0;
                      return (
                        <button key={o} type="button" onClick={() => setOrigem(o)}
                          className={`rounded-full border px-3 py-1 ${origem === o ? 'border-[#C1272D] bg-[#C1272D]/15 text-foreground font-semibold' : 'border-border text-muted-foreground'}`}>
                          {o === 'loja' ? 'Loja' : 'Almoxarifado'} ({String(Number(saldo.toFixed(3))).replace('.', ',')})
                        </button>
                      );
                    })}
                  </div>
                  {origem === 'almox' && mecanicosAtivos.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-foreground whitespace-nowrap">Quem retirou <span className="text-destructive">*</span></label>
                      <Select value={retirou || 'none'} onValueChange={(v) => setRetirou(v === 'none' ? '' : v)}>
                        <SelectTrigger className={`h-8 text-xs bg-muted/50 ${!retirou ? 'border-destructive' : 'border-border/50'}`}><SelectValue placeholder="Escolha" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Escolha</SelectItem>
                          {mecanicosAtivos.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {podeParte && (
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Usou só uma parte?</span>
                        {[0.25, 0.5, 0.75].map((f) => (
                          <button key={f} type="button"
                            onClick={() => setParte((p) => (p.fracao === f ? { ...p, fracao: null } : { ...p, fracao: f, medida: '' }))}
                            className={`rounded border px-2 py-0.5 ${parte.fracao === f ? 'border-[#C1272D] bg-[#C1272D]/15 font-semibold text-foreground' : 'border-border text-muted-foreground'}`}>
                            {textoParte(f)}
                          </button>
                        ))}
                        {conteudo && (
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">ou</span>
                            <Input inputMode="decimal" placeholder="50" value={parte.medida}
                              onChange={(e) => setParte((p) => ({ ...p, fracao: null, medida: e.target.value.replace(/[^\d.,]/g, '') }))}
                              className="h-7 w-16 text-xs text-right bg-muted/50 border-border/50" />
                            <Select value={parte.unidade || conteudo.un} onValueChange={(v) => setParte((p) => ({ ...p, unidade: v }))}>
                              <SelectTrigger className="h-7 w-16 text-xs bg-muted/50 border-border/50"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {unidadesDoConteudo(conteudo.un).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <span className="text-muted-foreground">de {String(conteudo.qtd).replace('.', ',')} {conteudo.un}</span>
                          </span>
                        )}
                        {usandoParte && <button type="button" onClick={limparParte} className="text-muted-foreground underline">usar inteira</button>}
                      </div>
                      {usandoParte && (
                        <>
                          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                            <Checkbox checked={fracao.cobrar} onCheckedChange={(c) => setFracao({ ...fracao, cobrar: Boolean(c) })} className="h-4 w-4" />
                            Cobrar do cliente
                          </label>
                          <p className="text-xs text-muted-foreground">
                            Sai do {origem === 'almox' ? 'almoxarifado' : 'estoque da loja'}: {String(qtdEstoque(parteFrac)).replace('.', ',')} {produtoSel!.unit}
                            {' · '}
                            {fracao.cobrar
                              ? `cliente paga R$ ${brl(parteFrac * (parseFloat(newMaterial.valor) || 0))}`
                              : 'não soma no valor da OS (material de uso no serviço)'}
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {fr && produtoSel && (
                <div className="rounded-md border border-border/50 bg-muted/30 p-2 space-y-1">
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Checkbox
                      checked={fracao.cobrar}
                      onCheckedChange={(c) => setFracao({ ...fracao, cobrar: Boolean(c) })}
                      className="h-4 w-4"
                    />
                    Cobrar do cliente
                  </label>
                  {fracNum > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Sai do estoque: {String(Number(fracBase.toFixed(3))).replace('.', ',')} {fr.grande}
                      {' · '}
                      {fracao.cobrar
                        ? `cliente paga R$ ${brl(fracBase * (parseFloat(newMaterial.valor) || 0))}`
                        : 'não soma no valor da OS (material de uso no serviço)'}
                    </p>
                  )}
                </div>
              )}
              {newMaterial.is_service && (
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Mecânico <span className="text-destructive">*</span>
                    {!newMaterial.mechanic_id && <span className="text-destructive ml-1 font-normal">— obrigatório para serviços</span>}
                  </label>
                  <Select value={newMaterial.mechanic_id || 'none'} onValueChange={(value) => setNewMaterial({ ...newMaterial, mechanic_id: value === 'none' ? undefined : value })} disabled={disabled}>
                    <SelectTrigger className={`h-8 bg-muted/50 ${!newMaterial.mechanic_id ? 'border-destructive' : 'border-border/50'}`} disabled={disabled}>
                      <SelectValue placeholder="Nenhum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {mecanicos.filter(m => m.active).map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-end justify-end gap-2">
                <Button
                  type="button"
                  onClick={handleAddMaterial}
                  disabled={disabled || loadingAdd}
                  className="h-8 bg-[#C1272D] hover:bg-red-700"
                >
                  {loadingAdd ? 'Salvando...' : '+ Adicionar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
