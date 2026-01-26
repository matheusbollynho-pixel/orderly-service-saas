import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Material, Mechanic } from '@/types/service-order';

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
    descricao: '',
    quantidade: '',
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
      descricao: newMaterial.descricao,
      quantidade: newMaterial.quantidade,
      valor: parseFloat(newMaterial.valor) || 0,
      is_service: newMaterial.is_service,
    };

    // Só adiciona mechanic_id se foi selecionado
    if (newMaterial.mechanic_id) {
      payload.mechanic_id = newMaterial.mechanic_id;
    }

    onAddMaterial(payload);

    setNewMaterial({ descricao: '', quantidade: '', valor: '', is_service: false, mechanic_id: undefined });
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
            <div className="grid grid-cols-12 gap-2 bg-orange-200 p-2 rounded font-semibold text-xs text-orange-900">
              <div className="col-span-7">DESCRIÇÃO</div>
              <div className="col-span-2 text-center">QTD</div>
              <div className="col-span-3 text-right">VALOR</div>
            </div>

            {materiais.map((material) => (
              <div key={material.id} className="bg-white rounded border border-orange-200">
                <div
                  onClick={() => !disabled && setExpandedId(expandedId === material.id ? null : material.id)}
                  className="grid grid-cols-12 gap-2 p-3 cursor-pointer hover:bg-orange-50 transition-colors"
                >
                  <div className="col-span-7 text-sm font-medium text-gray-800 truncate">
                    {material.descricao}
                  </div>
                  <div className="col-span-2 text-center text-sm text-gray-600">
                    {material.quantidade}
                  </div>
                  <div className="col-span-3 text-right text-sm font-semibold text-orange-700">
                    R$ {material.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {!disabled && (
                      expandedId === material.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>

                {expandedId === material.id && !disabled && (
                  <div className="bg-orange-50 border-t border-orange-200 p-3 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs font-semibold text-gray-700">Descrição</label>
                        <Input
                          size={1}
                          value={material.descricao}
                          onChange={(e) => onUpdateMaterial(material.id, 'descricao', e.target.value)}
                          disabled={disabled}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700">Quantidade</label>
                        <Input
                          size={1}
                          value={material.quantidade}
                          onChange={(e) => onUpdateMaterial(material.id, 'quantidade', e.target.value)}
                          disabled={disabled}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-700">Valor (R$)</label>
                        <Input
                          size={1}
                          type="number"
                          step="0.01"
                          value={material.valor}
                          onChange={(e) => onUpdateMaterial(material.id, 'valor', e.target.value)}
                          disabled={disabled}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => onRemoveMaterial(material.id)}
                        disabled={disabled}
                        className="h-7"
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> {loadingDelete ? 'Removendo...' : 'Remover'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="grid grid-cols-12 gap-2 bg-orange-300 p-3 rounded font-bold text-orange-900 text-right mt-2">
              <div className="col-span-9">TOTAL:</div>
              <div className="col-span-3">
                R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}

        {!disabled && (
          <div className="border-t border-orange-300 pt-4 space-y-3">
            <h4 className="font-semibold text-orange-900 text-sm">Adicionar novo material</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="text-xs font-semibold text-orange-900 block mb-1">Qtd</label>
                  <Input
                    placeholder="Un"
                    value={newMaterial.quantidade}
                    onChange={(e) => setNewMaterial({ ...newMaterial, quantidade: e.target.value })}
                    disabled={disabled}
                    className="h-8"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-orange-900 block mb-1">Descrição</label>
                  <Input
                    placeholder="Descrição"
                    value={newMaterial.descricao}
                    onChange={(e) => setNewMaterial({ ...newMaterial, descricao: e.target.value })}
                    disabled={disabled}
                    className="h-8"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-orange-900 block mb-1">Valor (R$)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={newMaterial.valor}
                    onChange={(e) => setNewMaterial({ ...newMaterial, valor: e.target.value })}
                    disabled={disabled}
                    className="h-8"
                  />
                </div>
              </div>
              {newMaterial.is_service && (
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-3">
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
                  <div className="flex items-end">
                    <div className="flex items-center gap-1 flex-1">
                      <Checkbox 
                        checked={newMaterial.is_service} 
                        onCheckedChange={(checked) => setNewMaterial({ ...newMaterial, is_service: Boolean(checked) })}
                        disabled={disabled}
                        className="h-4 w-4"
                      />
                      <span className="text-xs font-medium leading-none">Srv</span>
                    </div>
                  </div>
                </div>
              )}
              {!newMaterial.is_service && (
                <div className="flex items-end justify-end">
                  <div className="flex items-center gap-1">
                    <Checkbox 
                      checked={newMaterial.is_service} 
                      onCheckedChange={(checked) => setNewMaterial({ ...newMaterial, is_service: Boolean(checked) })}
                      disabled={disabled}
                      className="h-4 w-4"
                    />
                    <span className="text-xs font-medium leading-none">Srv</span>
                  </div>
                  <Button
                    type="button"
                    onClick={handleAddMaterial}
                    disabled={disabled || loadingAdd}
                    className="h-8 bg-orange-600 hover:bg-orange-700 ml-2"
                  >
                    {loadingAdd ? 'Salvando...' : '+'}
                  </Button>
                </div>
              )}
              {newMaterial.is_service && (
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    onClick={handleAddMaterial}
                    disabled={disabled || loadingAdd}
                    className="h-8 bg-orange-600 hover:bg-orange-700"
                  >
                    {loadingAdd ? 'Salvando...' : '+'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
