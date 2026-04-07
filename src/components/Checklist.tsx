import { useState, useEffect } from 'react';
import { ChecklistItem } from '@/types/service-order';
import { DEFAULT_CHECKLIST_ITEMS } from '@/types/service-order';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';
import { VEHICLE_CAP } from '@/lib/vehicleLabel';

interface ChecklistProps {
  items: ChecklistItem[];
  onItemToggle: (id: string, completed: boolean) => void;
  onRatingChange?: (id: string, rating: number) => void;
  onObservationsChange?: (id: string, observations: string) => void;
  disabled?: boolean;
  orderId?: string;
}

// Mapear label para tipo de checklist
const getItemType = (label: string): 'checkbox' | 'yesno' | 'rating' | 'textarea' => {
  const defaultItem = DEFAULT_CHECKLIST_ITEMS.find(
    item => typeof item !== 'string' && item.label === label
  );

  if (defaultItem && typeof defaultItem !== 'string') {
    return defaultItem.type;
  }

  return 'checkbox';
};

const getItemColor = (itemType?: string, completed?: boolean) => {
  if (completed) return 'glass-card-elevated border-emerald-500/30 bg-emerald-500/5';
  return 'glass-card border-border/50';
};

const getLabelColor = (itemType?: string, completed?: boolean) => {
  if (completed) return 'text-emerald-400';
  return 'text-foreground';
};

export function Checklist({ items, onItemToggle, onRatingChange, onObservationsChange, disabled, orderId = '' }: ChecklistProps) {

  const observationItem = items.find(item => {
    const itemType = item.item_type || getItemType(item.label);
    return itemType === 'textarea';
  });

  const [obsDraft, setObsDraft] = useState<string>("");
  const [obsId, setObsId] = useState<string>("");

  useEffect(() => {
    if (!observationItem) return;
    setObsDraft(observationItem.observations || "");
    setObsId(observationItem.id);
  }, [observationItem?.id, observationItem?.observations]);

  useEffect(() => {
    if (!onObservationsChange || !obsId) return;
    const handler = setTimeout(() => {
      if (obsDraft !== observationItem?.observations) {
        onObservationsChange(obsId, obsDraft);
      }
    }, 800);
    return () => clearTimeout(handler);
  }, [obsDraft, obsId]);

  // Mapa de ordenação e normalização de labels
  const orderMap: Record<string, number> = {
    [`Chave d${VEHICLE_CAP === 'Moto' ? 'a MOTO' : 'o ' + VEHICLE_CAP.toUpperCase()}`]: 1,
    [`Chave d${VEHICLE_CAP === 'Moto' ? 'a Moto' : 'o ' + VEHICLE_CAP}`]: 1,
    'Lataria (amassados/riscos)': 2,
    'Lataria sem amassados/riscos': 2,
    'Vidros (trincas)': 3,
    'Vidros sem trincas': 3,
    'Faróis e Lanternas': 4,
    'Faróis e Lanternas funcionando': 4,
    'Pneus e Rodas': 5,
    'Pneus e Rodas em boas condições': 5,
    'Luzes de Advertência no Painel': 6,
    'Painel sem alertas': 6,
    'Funcionamento do Motor': 7,
    'FUNCIONAMENTO': 7,
    'Elétrica': 8,
    'Elétrica funcionando': 8,
    'ELETRICA': 8,
    'Ar Condicionado': 9,
    'Ar Condicionado funcionando': 9,
    'Nível de Óleo': 10,
    'Nível de Óleo adequado': 10,
    'Nível de Água/Radiador': 11,
    'Nível de Água/Radiador adequado': 11,
    'Fluido de Freio': 12,
    'Fluido de Freio adequado': 12,
    'NIVEL DE GASOLINA': 0,
    'NÍVEL DE GASOLINA': 0,
    'NÍVEL DE COMBUSTÍVEL': 0,
    'Observações': 99,
  };

  const normalizeLabel = (label: string) => {
    if (label === `Chave d${VEHICLE_CAP === 'Moto' ? 'a Moto' : 'o ' + VEHICLE_CAP}`) return `Chave d${VEHICLE_CAP === 'Moto' ? 'a MOTO' : 'o ' + VEHICLE_CAP.toUpperCase()}`;
    if (label === 'FUNCIONAMENTO') return 'Funcionamento do Motor';
    if (label === 'ELETRICA') return 'Elétrica';
    if (label === 'NIVEL DE GASOLINA') return 'NÍVEL DE GASOLINA';
    return label;
  };

  // Separar observações dos outros itens
  const checklistItems = items.filter(item => {
    const itemType = item.item_type || getItemType(item.label);
    return itemType !== 'textarea';
  });

  const sortedChecklistItems = [...checklistItems].sort((a, b) => {
    const oa = orderMap[a.label] ?? 999;
    const ob = orderMap[b.label] ?? 999;
    return oa - ob;
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Checklist de Serviço
        </label>
        <div className="space-y-2">
          {sortedChecklistItems.map((item, index) => {
            const itemType = item.item_type || getItemType(item.label);

            return (
              <div key={item.id} className="space-y-2">
                <div
                  className={cn(
                    "flex flex-row items-center gap-3 p-3 rounded-lg border transition-all animate-fade-in",
                    getItemColor(itemType, item.completed)
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                {itemType === 'yesno' ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={item.completed ? 'default' : 'outline'}
                      onClick={() => onItemToggle(item.id, true)}
                      disabled={disabled}
                      className={cn(
                        "h-8 px-3 text-xs font-medium",
                        item.completed && 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      )}
                    >
                      Sim
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!item.completed ? 'default' : 'outline'}
                      onClick={() => onItemToggle(item.id, false)}
                      disabled={disabled}
                      className={cn(
                        "h-8 px-3 text-xs font-medium",
                        !item.completed && 'bg-red-600 hover:bg-red-700 text-white'
                      )}
                    >
                      Não
                    </Button>
                  </div>
                ) : itemType === 'rating' ? (
                  <div className="flex gap-1" key={`rating-${item.id}-${item.rating}`}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={`star-${star}`}
                        onClick={() => onRatingChange?.(item.id, star)}
                        disabled={disabled}
                        className="transition-transform hover:scale-110 cursor-pointer"
                      >
                        <Star
                          className={cn(
                            "h-5 w-5",
                            (item.rating ?? 0) >= star
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-muted-foreground'
                          )}
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <Checkbox
                    id={item.id}
                    checked={item.completed}
                    onCheckedChange={(checked) => onItemToggle(item.id, checked as boolean)}
                    disabled={disabled}
                    className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                  />
                )}
                <label
                  htmlFor={itemType === 'yesno' || itemType === 'rating' ? undefined : item.id}
                  className={cn(
                    "flex-1 text-sm transition-colors",
                    getLabelColor(itemType, item.completed),
                    (itemType === 'checkbox' || !itemType) && 'cursor-pointer'
                  )}
                >
                  {normalizeLabel(item.label)}
                </label>
                {item.completed && itemType === 'checkbox' && (
                  <span className="text-xs text-green-600 font-medium">✓</span>
                )}
                {itemType === 'rating' && item.rating && (
                  <span className="text-xs text-purple-600 font-medium">{item.rating}/5</span>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Observações separadas no final */}
      {observationItem && (
        <div className="pt-4 border-t border-border/30 space-y-2">
          <label
            htmlFor={observationItem.id}
            className="text-sm font-medium block text-foreground"
          >
            {observationItem.label}
          </label>
          <Textarea
            id={observationItem.id}
            placeholder="Digite suas observações aqui..."
            value={obsDraft}
            onChange={e => setObsDraft(e.target.value)}
            disabled={disabled}
            className="resize-none min-h-[120px] bg-muted/50 border-border/50 text-foreground"
          />
        </div>
      )}
    </div>
  );
}
