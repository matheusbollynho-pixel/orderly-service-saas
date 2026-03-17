import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, ChevronDown, ChevronUp, Package } from 'lucide-react';
import { Material, Mechanic, PaymentMethod } from '@/types/service-order';
import type { InventoryProduct } from '@/hooks/useInventory';

interface MaterialsNoteProps {
  materiais: Material[];
  mecanicos?: Mechanic[];
  inventoryProducts?: InventoryProduct[];
  onAddMaterial: (material: Omit<Material, 'id' | 'created_at' | 'updated_at'>) => void;
  onRemoveMaterial: (id: string) => void;
  onUpdateMaterial: (id: string, field: string, value: string) => void;
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
  disabled = false,
  loadingAdd = false,
  loadingUpdate = false,
  loadingDelete = false
}: MaterialsNoteProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [newMaterial, setNewMaterial] = useState({
    quantidade: '01',
    descricao: '',
    valor: '',
    is_service: false,
    mechanic_id: undefined as string | undefined,
    product_id: undefined as string | undefined,
  });
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

  const handleDescricaoChange = (value: string) => {
    setNewMaterial((prev) => ({ ...prev, descricao: value, product_id: undefined }));
    if (inventoryProducts.length > 0) {
      const q = value.trim().toLowerCase();
      const found = q.length === 0
        ? inventoryProducts.filter((p) => p.active).slice(0, 8)
        : inventoryProducts
            .filter((p) => p.active && (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)))
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
            .filter((p) => p.active && (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)))
            .slice(0, 8);
      setSuggestions(found);
      setShowSuggestions(true);
    }
  };

  const handleSelectProduct = (product: InventoryProduct) => {
    setNewMaterial((prev) => ({
      ...prev,
      descricao: product.name,
      valor: String(product.sale_price),
      product_id: product.id,
    }));
    setShowSuggestions(false);
  };

  const total = materiais.reduce((sum, m) => {
    const qtd = parseFloat(m.quantidade) || 0;
    return sum + ((m.valor || 0) * qtd);
  }, 0);

  const handleAddMaterial = () => {
    if (!newMaterial.descricao || !newMaterial.quantidade || !newMaterial.valor) {
      alert('Preenchas todos os campos para adicionar material');
      return;
    }

    const payload: Record<string, unknown> = {
      quantidade: newMaterial.quantidade,
      descricao: newMaterial.descricao,
      valor: parseFloat(newMaterial.valor) || 0,
      is_service: newMaterial.is_service,
    };

    if (newMaterial.mechanic_id) payload.mechanic_id = newMaterial.mechanic_id;
    if (newMaterial.product_id) payload.product_id = newMaterial.product_id;

    onAddMaterial(payload);

    setNewMaterial({ quantidade: '01', descricao: '', valor: '', is_service: false, mechanic_id: undefined, product_id: undefined });
    setShowSuggestions(false);
  };

  return (
    <div className="mt-8 space-y-4">
      <div className="glass-card-elevated rounded-lg border border-border/50 p-6 shadow-md">
        <h3 className="text-xl font-bold text-foreground mb-1">📋 Peças e Serviços</h3>
        <p className="text-sm text-muted-foreground mb-4">Materiais e peças utilizadas</p>

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
                  <div className="col-span-7 text-sm font-medium text-foreground">
                    {material.descricao}
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {material.quantidade} × R$ {parseFloat(String(material.valor)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button
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
                    </Button>
                  </div>
                </div>

                {/* Detalhe expandível */}
                {expandedId === material.id && (
                  <div className="bg-muted/50 border border-border/50 border-t-0 p-3 rounded-b space-y-3">
                    <div className="flex gap-2 items-end">
                      <div className="w-16">
                        <label className="text-xs font-semibold text-foreground block mb-1">Quantidade</label>
                        <Select value={material.quantidade || '01'} onValueChange={(value) => onUpdateMaterial(material.id, 'quantidade', value)} disabled={disabled}>
                          <SelectTrigger className="h-8 text-xs text-center bg-muted/50 border-border/50" disabled={disabled}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 99 }, (_, i) => (i + 1).toString().padStart(2, '0')).map((num) => (
                              <SelectItem key={num} value={num}>{num}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-24">
                        <label className="text-xs font-semibold text-foreground block mb-1">Valor (R$)</label>
                        <input
                          type="text"
                          value={editingValues[material.id] !== undefined ? editingValues[material.id] : material.valor}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                              setEditingValues(prev => ({ ...prev, [material.id]: value }));
                            }
                          }}
                          onBlur={(e) => {
                            const value = e.target.value;
                            if (editingValues[material.id] !== undefined && value !== String(material.valor)) {
                              onUpdateMaterial(material.id, 'valor', value);
                            }
                            setEditingValues(prev => {
                              const newValues = { ...prev };
                              delete newValues[material.id];
                              return newValues;
                            });
                          }}
                          disabled={disabled}
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
                        disabled={disabled}
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
                <div className="flex-1 relative" ref={suggestionsRef}>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    Descrição {newMaterial.product_id && <span className="text-green-600 ml-1">✓ estoque</span>}
                  </label>
                  <Input
                    placeholder="Descrição ou clique para buscar no estoque..."
                    value={newMaterial.descricao}
                    onChange={(e) => handleDescricaoChange(e.target.value)}
                    onFocus={handleDescricaoFocus}
                    disabled={disabled}
                    autoComplete="off"
                    className="h-8 bg-muted/50 border-border/50"
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
                              <span className="text-muted-foreground">{p.code} · Estoque: {p.stock_current} {p.unit} · R$ {p.sale_price.toFixed(2)}</span>
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
                  <label className="text-xs font-semibold text-foreground block mb-1">Valor (R$)</label>
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
              </div>
              {newMaterial.is_service && (
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Mecânico</label>
                  <Select value={newMaterial.mechanic_id || 'none'} onValueChange={(value) => setNewMaterial({ ...newMaterial, mechanic_id: value === 'none' ? undefined : value })} disabled={disabled}>
                    <SelectTrigger className="h-8 bg-muted/50 border-border/50" disabled={disabled}>
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
