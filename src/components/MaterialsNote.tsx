import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Material, Mechanic, PaymentMethod } from '@/types/service-order';

interface MaterialsNoteProps {
  materiais: Material[];
  mecanicos?: Mechanic[];
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
  onAddMaterial,
  onRemoveMaterial,
  onUpdateMaterial,
  disabled = false,
  loadingAdd = false,
  loadingUpdate = false,
  loadingDelete = false
}: MaterialsNoteProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newMaterial, setNewMaterial] = useState({
    quantidade: '01',
    descricao: '',
    valor: '',
    is_service: false,
    mechanic_id: undefined as string | undefined
  });

  const total = materiais.reduce((sum, m) => {
    const qtd = parseFloat(m.quantidade) || 0;
    return sum + ((m.valor || 0) * qtd);
  }, 0);

  const handleAddMaterial = () => {
    if (!newMaterial.descricao || !newMaterial.quantidade || !newMaterial.valor) {
      alert('Preenchas todos os campos para adicionar material');
      return;
    }

    const payload: any = {
      quantidade: newMaterial.quantidade,
      descricao: newMaterial.descricao,
      valor: parseFloat(newMaterial.valor) || 0,
      is_service: newMaterial.is_service,
    };

    // Só adiciona mechanic_id se foi selecionado
    if (newMaterial.mechanic_id) {
      payload.mechanic_id = newMaterial.mechanic_id;
    }

    onAddMaterial(payload);

    setNewMaterial({ quantidade: '01', descricao: '', valor: '', is_service: false, mechanic_id: undefined });
  };

  return (
    <div className="mt-8 space-y-4">
      <div className="bg-gradient-to-r from-orange-100 via-yellow-50 to-orange-50 rounded-lg border-2 border-orange-300 p-6 shadow-md">
        <h3 className="text-xl font-bold text-orange-900 mb-1">📋 Peças e Serviços</h3>
        <p className="text-sm text-orange-700 mb-4">Materiais e peças utilizadas</p>

        {materiais.length === 0 ? (
          <div className="text-center py-6 text-orange-600">
            <p className="text-sm">Nenhum material adicionado ainda</p>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {/* Cabeçalho simplificado */}
            <div className="grid grid-cols-12 gap-2 bg-orange-200 p-2 rounded font-semibold text-xs text-orange-900">
              <div className="col-span-1"></div>
              <div className="col-span-7">DESCRIÇÃO</div>
              <div className="col-span-2">QTD/VALOR</div>
              <div className="col-span-2">AÇÃO</div>
            </div>

            {/* Linhas de materiais - Expandível */}
            {materiais.map((material) => (
              <div key={material.id}>
                <div 
                  className="grid grid-cols-12 gap-2 bg-white p-2 rounded border border-orange-200 items-center hover:bg-orange-50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === material.id ? null : material.id)}
                >
                  <div className="col-span-1 flex justify-center">
                    {expandedId === material.id ? (
                      <ChevronUp className="h-4 w-4 text-orange-600" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-orange-600" />
                    )}
                  </div>
                  <div className="col-span-7 text-sm font-medium text-orange-900">
                    {material.descricao}
                  </div>
                  <div className="col-span-2 text-sm text-orange-800">
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
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Detalhe expandível */}
                {expandedId === material.id && (
                  <div className="bg-orange-50 border border-orange-200 border-t-0 p-3 rounded-b space-y-3">
                    <div className="flex gap-2 items-end">
                      <div className="w-16">
                        <label className="text-xs font-semibold text-orange-900 block mb-1">Quantidade</label>
                        <Select value={material.quantidade || '01'} onValueChange={(value) => onUpdateMaterial(material.id, 'quantidade', value)}>
                          <SelectTrigger className="h-8 text-xs text-center">
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
                        <label className="text-xs font-semibold text-orange-900 block mb-1">Valor (R$)</label>
                        <Input
                          type="number"
                          value={material.valor}
                          onChange={(e) => onUpdateMaterial(material.id, 'valor', e.target.value)}
                          disabled={disabled}
                          className="h-8 text-xs text-right"
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
                      <span className="text-xs font-medium">Serviço</span>
                    </div>

                    {material.is_service && (
                      <div>
                        <label className="text-xs font-semibold text-orange-900 block mb-1">Mecânico</label>
                        <Select value={material.mechanic_id || 'none'} onValueChange={(value) => onUpdateMaterial(material.id, 'mechanic_id', value === 'none' ? '' : value)} disabled={disabled}>
                          <SelectTrigger className="h-8 text-xs">
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
            <div className="grid grid-cols-12 gap-2 bg-orange-300 p-2 rounded font-bold text-orange-900 text-xs mt-2">
              <div className="col-span-9">TOTAL:</div>
              <div className="col-span-3 text-right">
                R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}

        {!disabled && (
          <div className="border-t border-orange-300 pt-4 space-y-3">
            <h4 className="font-semibold text-orange-900 text-sm">Adicionar novo material</h4>
            <div className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="w-16">
                  <label className="text-xs font-semibold text-orange-900 block mb-1">Qtd</label>
                  <Select value={newMaterial.quantidade || '01'} onValueChange={(value) => setNewMaterial({ ...newMaterial, quantidade: value })}>
                    <SelectTrigger className="h-8 text-xs text-center">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 99 }, (_, i) => (i + 1).toString().padStart(2, '0')).map((num) => (
                        <SelectItem key={num} value={num}>{num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-orange-900 block mb-1">Descrição</label>
                  <Input
                    placeholder="Descrição"
                    value={newMaterial.descricao}
                    onChange={(e) => setNewMaterial({ ...newMaterial, descricao: e.target.value })}
                    disabled={disabled}
                    className="h-8"
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs font-semibold text-orange-900 block mb-1">Valor (R$)</label>
                  <Input
                    type="number"
                    placeholder="0,00"
                    value={newMaterial.valor}
                    onChange={(e) => setNewMaterial({ ...newMaterial, valor: e.target.value })}
                    disabled={disabled}
                    className="h-8 text-xs text-right"
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
                  <span className="text-xs font-medium leading-none">Serviço</span>
                </div>
              </div>
              {newMaterial.is_service && (
                <div>
                  <label className="text-xs font-semibold text-orange-900 block mb-1">Mecânico</label>
                  <Select value={newMaterial.mechanic_id || 'none'} onValueChange={(value) => setNewMaterial({ ...newMaterial, mechanic_id: value === 'none' ? undefined : value })} disabled={disabled}>
                    <SelectTrigger className="h-8" disabled={disabled}>
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
                  className="h-8 bg-orange-600 hover:bg-orange-700"
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
