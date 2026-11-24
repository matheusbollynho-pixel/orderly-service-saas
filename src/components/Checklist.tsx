import { useState, useEffect } from 'react';
import { ChecklistItem } from '@/types/service-order';
import { getDefaultChecklistItems, chaveRotulo, rotuloChecklist } from '@/types/service-order';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';

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
  // Procura nos modelos de carro e de moto: a loja pode atender os dois, e cada
  // OS tem o checklist do tipo do veículo dela.
  const chave = chaveRotulo(rotuloChecklist(label));
  const defaultItem = [...getDefaultChecklistItems('carro'), ...getDefaultChecklistItems('moto')].find(
    item => typeof item !== 'string' && chaveRotulo(item.label) === chave
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

  // Ordem do checklist padrão (pelo nome padronizado; vale para OS antigas,
  // que guardam os nomes antigos com maiúsculas misturadas).
  const ORDEM_PADRAO: Record<string, number> = {
    'Nível de gasolina': 0,
    'Nível de combustível': 0,
    'Chave da moto': 1,
    'Chave do carro': 1,
    'Lataria (amassados/riscos)': 2,
    'Lataria sem amassados/riscos': 2,
    'Vidros (trincas)': 3,
    'Vidros sem trincas': 3,
    'Faróis e lanternas': 4,
    'Faróis e lanternas funcionando': 4,
    'Pneus e rodas': 5,
    'Pneus e rodas em boas condições': 5,
    'Luzes de advertência no painel': 6,
    'Painel sem alertas': 6,
    'Funcionamento do motor': 7,
    'Elétrica': 8,
    'Elétrica funcionando': 8,
    'Ar-condicionado': 9,
    'Ar-condicionado funcionando': 9,
    'Nível de óleo': 10,
    'Nível de óleo adequado': 10,
    'Nível de água/radiador': 11,
    'Nível de água/radiador adequado': 11,
    'Fluido de freio': 12,
    'Fluido de freio adequado': 12,
    'Observações': 99,
  };
  const ordem = (label: string) => ORDEM_PADRAO[rotuloChecklist(label)] ?? 999;

  // Separar observações dos outros itens
  const checklistItems = items.filter(item => {
    const itemType = item.item_type || getItemType(item.label);
    return itemType !== 'textarea';
  });

  // Checklist personalizado da loja: segue a ordem montada (posicao).
  // Checklist padrão (sem posição): ordem fixa de sempre.
  const sortedChecklistItems = [...checklistItems].sort((a, b) => {
    if (a.posicao != null && b.posicao != null) return a.posicao - b.posicao;
    return ordem(a.label) - ordem(b.label);
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
                  {rotuloChecklist(item.label)}
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
