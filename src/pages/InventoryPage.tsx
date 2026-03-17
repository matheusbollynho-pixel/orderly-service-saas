import { useState, useMemo } from 'react';
import { useInventory, type InventoryProduct, type InventoryProductInsert, type InventoryMovementInsert } from '@/hooks/useInventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Package,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  ArrowLeftRight,
  AlertTriangle,
  Edit2,
  Trash2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  em_falta: 'Em falta',
  descontinuado: 'Descontinuado',
};

const STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-green-500/15 text-green-700 border-green-300',
  inativo: 'bg-gray-500/15 text-gray-600 border-gray-300',
  em_falta: 'bg-orange-500/15 text-orange-700 border-orange-300',
  descontinuado: 'bg-red-500/15 text-red-700 border-red-300',
};

const MOV_LABELS: Record<string, string> = {
  entrada_manual: 'Entrada',
  saida_os: 'Saída OS',
  saida_venda: 'Venda avulsa',
  ajuste: 'Ajuste',
  devolucao: 'Devolução',
};

const MOV_COLORS: Record<string, string> = {
  entrada_manual: 'text-green-600',
  devolucao: 'text-green-600',
  saida_os: 'text-red-500',
  saida_venda: 'text-red-500',
  ajuste: 'text-blue-500',
};

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('pt-BR');
}

// ── Empty form ────────────────────────────────────────────────────────────────

const EMPTY_FORM: InventoryProductInsert = {
  code: '',
  name: '',
  barcode: '',
  sku: '',
  description: '',
  classification: '',
  category: '',
  subcategory: '',
  brand: '',
  supplier: '',
  part_type: null,
  moto_brand: '',
  moto_model: '',
  moto_year: '',
  moto_displacement: '',
  moto_version: '',
  compatibility: '',
  manufacturer_part_number: '',
  dimensions: '',
  color: '',
  material: '',
  side: null,
  unit: 'un',
  stock_current: 0,
  stock_minimum: 0,
  stock_maximum: null,
  location: '',
  lot: '',
  cost_price: 0,
  sale_price: 0,
  profit_margin: null,
  promotional_price: null,
  active: true,
  status: 'ativo',
  notes: '',
};

// ── Product Form Dialog ───────────────────────────────────────────────────────

interface ProductFormProps {
  open: boolean;
  product: InventoryProductInsert | (InventoryProduct & { id: string });
  isEditing: boolean;
  isSaving: boolean;
  onChange: (field: string, value: unknown) => void;
  onBulkChange: (fields: Record<string, unknown>) => void;
  onSave: () => void;
  onClose: () => void;
}

function ProductFormDialog({ open, product, isEditing, isSaving, onChange, onBulkChange, onSave, onClose }: ProductFormProps) {
  const [aiDescription, setAiDescription] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const handleAiFill = async () => {
    if (!aiDescription.trim()) {
      toast.error('Descreva a peça antes de usar a IA');
      return;
    }
    setIsAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-fill-product', {
        body: { description: aiDescription },
      });
      if (error) throw error;
      if (data?.fields) {
        // Remove nulls — não sobrescreve campos já preenchidos com null
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data.fields)) {
          if (v !== null && v !== undefined && v !== '') clean[k] = v;
        }
        onBulkChange(clean);
        toast.success('Campos preenchidos pela IA! Revise e confirme.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao chamar IA';
      toast.error(msg);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* IA */}
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              Preencher com IA
            </div>
            <p className="text-xs text-muted-foreground">Descreva a peça e a IA preenche os campos automaticamente. Revise antes de salvar.</p>
            <div className="flex gap-2">
              <Input
                placeholder='Ex: pastilha de freio dianteira Honda CG 160 2020'
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAiFill()}
                disabled={isAiLoading}
                className="flex-1"
              />
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleAiFill}
                disabled={isAiLoading || !aiDescription.trim()}
                className="flex-shrink-0"
              >
                {isAiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isAiLoading ? 'Preenchendo...' : 'Preencher'}
              </Button>
            </div>
          </section>

          {/* Identificação */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Identificação</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código interno *</Label>
                <Input value={product.code} onChange={(e) => onChange('code', e.target.value)} placeholder="Ex: PEÇ-001" />
              </div>
              <div>
                <Label>Nome *</Label>
                <Input value={product.name} onChange={(e) => onChange('name', e.target.value)} placeholder="Nome da peça" />
              </div>
              <div>
                <Label>Código de barras</Label>
                <Input value={product.barcode ?? ''} onChange={(e) => onChange('barcode', e.target.value)} placeholder="EAN/GTIN" />
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={product.sku ?? ''} onChange={(e) => onChange('sku', e.target.value)} placeholder="SKU" />
              </div>
            </div>
            <div className="mt-3">
              <Label>Descrição</Label>
              <Textarea value={product.description ?? ''} onChange={(e) => onChange('description', e.target.value)} placeholder="Descrição detalhada" rows={2} />
            </div>
          </section>

          {/* Classificação */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Classificação</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Input value={product.category ?? ''} onChange={(e) => onChange('category', e.target.value)} placeholder="Ex: freio, motor, suspensão" />
              </div>
              <div>
                <Label>Subcategoria</Label>
                <Input value={product.subcategory ?? ''} onChange={(e) => onChange('subcategory', e.target.value)} placeholder="Subcategoria" />
              </div>
              <div>
                <Label>Classificação geral</Label>
                <Input value={product.classification ?? ''} onChange={(e) => onChange('classification', e.target.value)} placeholder="Classificação" />
              </div>
              <div>
                <Label>Marca da peça</Label>
                <Input value={product.brand ?? ''} onChange={(e) => onChange('brand', e.target.value)} placeholder="Marca" />
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Input value={product.supplier ?? ''} onChange={(e) => onChange('supplier', e.target.value)} placeholder="Fornecedor" />
              </div>
              <div>
                <Label>Tipo de peça</Label>
                <Select value={product.part_type ?? ''} onValueChange={(v) => onChange('part_type', v || null)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="original">Original</SelectItem>
                    <SelectItem value="paralela">Paralela</SelectItem>
                    <SelectItem value="usada">Usada</SelectItem>
                    <SelectItem value="remanufaturada">Remanufaturada</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Aplicação */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Aplicação da peça</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Marca da moto</Label>
                <Input value={product.moto_brand ?? ''} onChange={(e) => onChange('moto_brand', e.target.value)} placeholder="Ex: Honda, Yamaha" />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input value={product.moto_model ?? ''} onChange={(e) => onChange('moto_model', e.target.value)} placeholder="Ex: CG 160, Factor" />
              </div>
              <div>
                <Label>Ano</Label>
                <Input value={product.moto_year ?? ''} onChange={(e) => onChange('moto_year', e.target.value)} placeholder="Ex: 2020-2024" />
              </div>
              <div>
                <Label>Cilindrada</Label>
                <Input value={product.moto_displacement ?? ''} onChange={(e) => onChange('moto_displacement', e.target.value)} placeholder="Ex: 160cc" />
              </div>
              <div>
                <Label>Versão</Label>
                <Input value={product.moto_version ?? ''} onChange={(e) => onChange('moto_version', e.target.value)} placeholder="Versão" />
              </div>
              <div>
                <Label>Lado</Label>
                <Select value={product.side ?? ''} onValueChange={(v) => onChange('side', v || null)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direito">Direito</SelectItem>
                    <SelectItem value="esquerdo">Esquerdo</SelectItem>
                    <SelectItem value="dianteiro">Dianteiro</SelectItem>
                    <SelectItem value="traseiro">Traseiro</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                    <SelectItem value="nao_aplicavel">N/A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <Label>Compatibilidade (texto livre)</Label>
              <Textarea value={product.compatibility ?? ''} onChange={(e) => onChange('compatibility', e.target.value)} placeholder="Ex: compatível com CG 125/150/160 2014 em diante" rows={2} />
            </div>
          </section>

          {/* Características técnicas */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Características técnicas</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nº fabricante</Label>
                <Input value={product.manufacturer_part_number ?? ''} onChange={(e) => onChange('manufacturer_part_number', e.target.value)} placeholder="Part number" />
              </div>
              <div>
                <Label>Dimensões</Label>
                <Input value={product.dimensions ?? ''} onChange={(e) => onChange('dimensions', e.target.value)} placeholder="Ex: 30x15mm" />
              </div>
              <div>
                <Label>Cor</Label>
                <Input value={product.color ?? ''} onChange={(e) => onChange('color', e.target.value)} placeholder="Cor" />
              </div>
              <div>
                <Label>Material</Label>
                <Input value={product.material ?? ''} onChange={(e) => onChange('material', e.target.value)} placeholder="Material" />
              </div>
              <div>
                <Label>Unidade de venda</Label>
                <Select value={product.unit ?? 'un'} onValueChange={(v) => onChange('unit', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="un">Unidade (un)</SelectItem>
                    <SelectItem value="par">Par</SelectItem>
                    <SelectItem value="jogo">Jogo</SelectItem>
                    <SelectItem value="kit">Kit</SelectItem>
                    <SelectItem value="m">Metro (m)</SelectItem>
                    <SelectItem value="l">Litro (l)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Estoque */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Controle de estoque</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Estoque atual</Label>
                <Input type="number" min="0" step="0.001" value={product.stock_current ?? 0} onChange={(e) => onChange('stock_current', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Estoque mínimo</Label>
                <Input type="number" min="0" step="0.001" value={product.stock_minimum ?? 0} onChange={(e) => onChange('stock_minimum', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Estoque máximo</Label>
                <Input type="number" min="0" step="0.001" value={product.stock_maximum ?? ''} onChange={(e) => onChange('stock_maximum', e.target.value ? parseFloat(e.target.value) : null)} placeholder="Opcional" />
              </div>
              <div>
                <Label>Localização</Label>
                <Input value={product.location ?? ''} onChange={(e) => onChange('location', e.target.value)} placeholder="Ex: A2-P3-G1" />
              </div>
              <div>
                <Label>Lote</Label>
                <Input value={product.lot ?? ''} onChange={(e) => onChange('lot', e.target.value)} placeholder="Lote" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={product.status ?? 'ativo'} onValueChange={(v) => onChange('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="em_falta">Em falta</SelectItem>
                    <SelectItem value="descontinuado">Descontinuado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Preços */}
          <section>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Preços</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Preço de custo (R$)</Label>
                <Input type="number" min="0" step="0.01" value={product.cost_price ?? 0} onChange={(e) => onChange('cost_price', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Preço de venda (R$)</Label>
                <Input type="number" min="0" step="0.01" value={product.sale_price ?? 0} onChange={(e) => onChange('sale_price', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Margem de lucro (%)</Label>
                <Input type="number" min="0" step="0.01" value={product.profit_margin ?? ''} onChange={(e) => onChange('profit_margin', e.target.value ? parseFloat(e.target.value) : null)} placeholder="Opcional" />
              </div>
              <div>
                <Label>Preço promocional (R$)</Label>
                <Input type="number" min="0" step="0.01" value={product.promotional_price ?? ''} onChange={(e) => onChange('promotional_price', e.target.value ? parseFloat(e.target.value) : null)} placeholder="Opcional" />
              </div>
            </div>
          </section>

          {/* Observações */}
          <section>
            <Label>Observações</Label>
            <Textarea value={product.notes ?? ''} onChange={(e) => onChange('notes', e.target.value)} placeholder="Observações adicionais..." rows={2} />
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Cadastrar produto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Movement Dialog ───────────────────────────────────────────────────────────

interface MovementDialogProps {
  open: boolean;
  product: InventoryProduct | null;
  isSaving: boolean;
  onSave: (movement: InventoryMovementInsert) => void;
  onClose: () => void;
}

function MovementDialog({ open, product, isSaving, onSave, onClose }: MovementDialogProps) {
  const [type, setType] = useState<'entrada_manual' | 'ajuste' | 'saida_venda'>('entrada_manual');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = () => {
    if (!product) return;
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      toast.error('Informe uma quantidade válida');
      return;
    }
    onSave({
      product_id: product.id,
      type,
      quantity: qty,
      unit_cost: unitCost ? parseFloat(unitCost) : null,
      unit_price: unitPrice ? parseFloat(unitPrice) : null,
      notes: notes || null,
    });
    setType('entrada_manual');
    setQuantity('');
    setUnitCost('');
    setUnitPrice('');
    setNotes('');
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar movimentação</DialogTitle>
          <p className="text-sm text-muted-foreground">{product.name} — estoque atual: <strong>{product.stock_current} {product.unit}</strong></p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada_manual">Entrada manual</SelectItem>
                <SelectItem value="saida_venda">Venda avulsa</SelectItem>
                <SelectItem value="ajuste">Ajuste (define valor absoluto)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade ({product.unit})</Label>
            <Input type="number" min="0" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
          </div>
          {type === 'entrada_manual' && (
            <div>
              <Label>Custo unitário (R$)</Label>
              <Input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Opcional" />
            </div>
          )}
          {type === 'saida_venda' && (
            <div>
              <Label>Preço de venda unitário (R$)</Label>
              <Input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder={String(product.sale_price)} />
            </div>
          )}
          <div>
            <Label>Observação</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const {
    products,
    isLoadingProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    isCreatingProduct,
    isUpdatingProduct,
    isDeletingProduct,
    movements,
    isLoadingMovements,
    createMovement,
    isCreatingMovement,
  } = useInventory();

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('produtos');
  const [filterLowStock, setFilterLowStock] = useState(false);

  // Product form
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null);
  const [formData, setFormData] = useState<InventoryProductInsert>({ ...EMPTY_FORM });

  // Movement dialog
  const [movOpen, setMovOpen] = useState(false);
  const [movProduct, setMovProduct] = useState<InventoryProduct | null>(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let list = products;
    if (filterLowStock) {
      list = list.filter((p) => p.active && p.stock_minimum > 0 && p.stock_current <= p.stock_minimum);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (p.brand ?? '').toLowerCase().includes(q) ||
        (p.moto_model ?? '').toLowerCase().includes(q)
    );
  }, [products, search, filterLowStock]);

  const lowStock = useMemo(
    () => products.filter((p) => p.active && p.stock_minimum > 0 && p.stock_current <= p.stock_minimum),
    [products]
  );

  const nextCode = () => {
    const nums = products
      .map((p) => parseInt(p.code.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return String(max + 1).padStart(3, '0');
  };

  const handleOpenNew = () => {
    setEditingProduct(null);
    setFormData({ ...EMPTY_FORM, code: nextCode() });
    setFormOpen(true);
  };

  const handleOpenEdit = (p: InventoryProduct) => {
    setEditingProduct(p);
    setFormData({ ...p });
    setFormOpen(true);
  };

  const handleFormChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleBulkChange = (fields: Record<string, unknown>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const handleSaveProduct = () => {
    if (!formData.code.trim()) { toast.error('Código interno obrigatório'); return; }
    if (!formData.name.trim()) { toast.error('Nome obrigatório'); return; }

    if (editingProduct) {
      updateProduct({ id: editingProduct.id, ...formData }, { onSuccess: () => setFormOpen(false) });
    } else {
      createProduct(formData, { onSuccess: () => setFormOpen(false) });
    }
  };

  const handleDeleteProduct = (id: string) => {
    setDeletingId(id);
    deleteProduct(id, { onSettled: () => setDeletingId(null) });
  };

  const handleOpenMovement = (p: InventoryProduct) => {
    setMovProduct(p);
    setMovOpen(true);
  };

  const handleSaveMovement = (movement: InventoryMovementInsert) => {
    createMovement(movement, { onSuccess: () => setMovOpen(false) });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Package className="h-5 w-5" /> Estoque
        </h2>
        <Button size="sm" onClick={handleOpenNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo produto
        </Button>
      </div>

      {/* Alerta estoque baixo – clicável para filtrar */}
      {lowStock.length > 0 && (
        <button
          type="button"
          onClick={() => { setFilterLowStock((v) => !v); setTab('produtos'); }}
          className="w-full flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors"
          style={{
            borderColor: '#C1272D',
            color: '#C1272D',
            backgroundColor: filterLowStock ? 'rgba(193,39,45,0.12)' : 'transparent',
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{lowStock.length} produto{lowStock.length > 1 ? 's' : ''} com estoque baixo ou zerado</span>
          </div>
          <span className="text-xs font-normal opacity-80">
            {filterLowStock ? '✕ limpar filtro' : 'ver todos →'}
          </span>
        </button>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="produtos" className="flex-1">Produtos ({products.length})</TabsTrigger>
          <TabsTrigger value="movimentacoes" className="flex-1">Movimentações</TabsTrigger>
        </TabsList>

        {/* ── ABA PRODUTOS ── */}
        <TabsContent value="produtos" className="space-y-3 mt-3">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-10 h-11"
              placeholder="Buscar por nome, código, categoria, marca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoadingProducts ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{search ? `Nenhum produto encontrado para "${search}"` : 'Nenhum produto cadastrado ainda'}</p>
              {!search && (
                <Button variant="outline" size="sm" className="mt-4" onClick={handleOpenNew}>
                  <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro produto
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProducts.map((p) => {
                const isLow = p.stock_minimum > 0 && p.stock_current <= p.stock_minimum;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'rounded-xl border bg-card p-3 flex items-start gap-3',
                      isLow && 'border-[#C1272D] border-2'
                    )}
                  >
                    {/* Stock indicator */}
                    <div className={cn(
                      'mt-0.5 flex-shrink-0 w-2 h-2 rounded-full',
                      isLow ? 'bg-[#C1272D]' : 'bg-green-500'
                    )} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.code}{p.category ? ` · ${p.category}` : ''}{p.brand ? ` · ${p.brand}` : ''}</p>
                        </div>
                        <Badge variant="outline" className={cn('text-[10px] flex-shrink-0', STATUS_COLORS[p.status])}>
                          {STATUS_LABELS[p.status]}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className={cn('font-bold', isLow ? 'text-[#C1272D]' : 'text-foreground')} style={isLow ? { color: '#C1272D' } : {}}>
                          {p.stock_current} {p.unit}
                          {isLow && <span style={{ color: '#C1272D' }} className="ml-1">(mín: {p.stock_minimum})</span>}
                        </span>
                        <span className="text-muted-foreground">Venda: {fmtCurrency(p.sale_price)}</span>
                        {p.location && <span className="text-muted-foreground">📦 {p.location}</span>}
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => handleOpenMovement(p)}
                        >
                          <ArrowLeftRight className="h-3 w-3 mr-1" /> Movimentar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleOpenEdit(p)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteProduct(p.id)}
                          disabled={deletingId === p.id || isDeletingProduct}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── ABA MOVIMENTAÇÕES ── */}
        <TabsContent value="movimentacoes" className="space-y-2 mt-3">
          {isLoadingMovements ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ArrowLeftRight className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma movimentação registrada</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {movements.map((m) => {
                const isIn = ['entrada_manual', 'devolucao'].includes(m.type);
                const isOut = ['saida_os', 'saida_venda'].includes(m.type);
                return (
                  <div key={m.id} className="rounded-lg border bg-card px-3 py-2 flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {isIn && <TrendingUp className="h-4 w-4 text-green-600" />}
                      {isOut && <TrendingDown className="h-4 w-4 text-red-500" />}
                      {!isIn && !isOut && <ArrowLeftRight className="h-4 w-4 text-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {(m as any).inventory_products?.name ?? '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {MOV_LABELS[m.type]} · {fmtDate(m.created_at)}
                        {m.notes ? ` · ${m.notes}` : ''}
                      </p>
                    </div>
                    <span className={cn('text-sm font-bold flex-shrink-0', MOV_COLORS[m.type])}>
                      {isOut ? '-' : isIn ? '+' : '='}{m.quantity}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ProductFormDialog
        open={formOpen}
        product={formData}
        isEditing={!!editingProduct}
        isSaving={isCreatingProduct || isUpdatingProduct}
        onChange={handleFormChange}
        onBulkChange={handleBulkChange}
        onSave={handleSaveProduct}
        onClose={() => setFormOpen(false)}
      />

      <MovementDialog
        open={movOpen}
        product={movProduct}
        isSaving={isCreatingMovement}
        onSave={handleSaveMovement}
        onClose={() => setMovOpen(false)}
      />
    </div>
  );
}
