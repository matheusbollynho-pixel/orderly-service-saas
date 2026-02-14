import { useState } from 'react';
import { ChecklistItem } from '@/types/service-order';
import { DEFAULT_CHECKLIST_ITEMS } from '@/types/service-order';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Star, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { uploadChecklistPhoto, getChecklistPhotos } from '@/lib/photoService';
import { toast } from 'sonner';

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
  
  // Fallback ao item_type do banco (se disponível) ou checkbox
  return 'checkbox';
};

const getItemColor = (itemType?: string, completed?: boolean) => {
  if (completed) return 'bg-green-50 border-green-300';
  
  switch (itemType) {
    case 'yesno':
      return 'bg-blue-50 border-blue-300';
    case 'rating':
      return 'bg-purple-50 border-purple-300';
    case 'textarea':
      return 'bg-amber-50 border-amber-300';
    default:
      return 'bg-card border-border';
  }
};

const getLabelColor = (itemType?: string, completed?: boolean) => {
  if (completed) return 'text-green-900';
  
  switch (itemType) {
    case 'yesno':
      return 'text-blue-900';
    case 'rating':
      return 'text-purple-900';
    case 'textarea':
      return 'text-amber-900';
    default:
      return 'text-foreground';
  }
};

export function Checklist({ items, onItemToggle, onRatingChange, onObservationsChange, disabled, orderId = '' }: ChecklistProps) {
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [itemPhotos, setItemPhotos] = useState<Record<string, any[]>>({});
  const [generalPhotos, setGeneralPhotos] = useState<any[]>([]);
  const [uploadingGeneral, setUploadingGeneral] = useState(false);

  const handlePhotoUpload = async (itemId: string, file: File) => {
    if (!orderId) {
      toast.error('OS não identificada');
      return;
    }

    setUploadingPhotoId(itemId);
    try {
      const result = await uploadChecklistPhoto(file, orderId, itemId);
      if (result) {
        toast.success('Foto enviada com sucesso');
        const photos = await getChecklistPhotos(itemId);
        setItemPhotos((prev) => ({ ...prev, [itemId]: photos }));
      } else {
        toast.error('Erro ao enviar foto');
      }
    } finally {
      setUploadingPhotoId(null);
    }
  };

  const handleGeneralPhotoUpload = async (file: File) => {
    if (!orderId) {
      toast.error('OS não identificada');
      return;
    }

    setUploadingGeneral(true);
    try {
      const result = await uploadChecklistPhoto(file, orderId, 'geral');
      if (result) {
        toast.success('Foto enviada com sucesso');
        const photos = await getChecklistPhotos('geral');
        setGeneralPhotos(photos);
      } else {
        toast.error('Erro ao enviar foto');
      }
    } finally {
      setUploadingGeneral(false);
    }
  };

  // Mapa de ordenação e normalização de labels
  const orderMap: Record<string, number> = {
    'Chave da MOTO': 1,
    'Chave da Moto': 1,
    'Funcionamento do Motor': 2,
    'FUNCIONAMENTO': 2,
    'Elétrica': 3,
    'ELETRICA': 3,
    'NIVEL DE GASOLINA': 4,
    'NÍVEL DE GASOLINA': 4,
    'Observações': 5,
  };

  const normalizeLabel = (label: string) => {
    if (label === 'Chave da Moto') return 'Chave da MOTO';
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
  
  // Ordenar os itens conforme o mapa acima (mantém desconhecidos no fim)
  const sortedChecklistItems = [...checklistItems].sort((a, b) => {
    const oa = orderMap[a.label] ?? 999;
    const ob = orderMap[b.label] ?? 999;
    return oa - ob;
  });

  const observationItem = items.find(item => {
    const itemType = item.item_type || getItemType(item.label);
    return itemType === 'textarea';
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
              <div 
                key={item.id}
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
                        item.completed && 'bg-green-600 hover:bg-green-700 text-white'
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
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => onRatingChange?.(item.id, star)}
                        disabled={disabled}
                        className="transition-transform hover:scale-110"
                      >
                        <Star
                          className={cn(
                            "h-5 w-5",
                            (item.rating ?? 0) >= star
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
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

                {/* Botão de foto */}
                {!disabled && (
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          const file = e.currentTarget.files?.[0];
                          if (file) handlePhotoUpload(item.id, file);
                        }}
                        className="hidden"
                        disabled={uploadingPhotoId === item.id}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        disabled={uploadingPhotoId === item.id}
                        asChild
                      >
                        <span>
                          {uploadingPhotoId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ImageIcon className="h-4 w-4" />
                          )}
                        </span>
                      </Button>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Observações separadas no final */}
      {observationItem && (
        <div className="pt-4 border-t space-y-2">
          <label 
            htmlFor={observationItem.id}
            className="text-sm font-medium block text-amber-900"
          >
            {observationItem.label}
          </label>
          <Textarea
            id={observationItem.id}
            placeholder="Digite suas observações aqui..."
            value={observationItem.observations || ''}
            onChange={(e) => onObservationsChange?.(observationItem.id, e.target.value)}
            disabled={disabled}
            className="resize-none min-h-[120px] bg-amber-50 border-amber-300"
          />
        </div>
      )}

      {/* Fotos Gerais da Ordem */}
      {!disabled && (
        <div className="pt-4 border-t space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              📸 Fotos da Ordem
            </label>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={(e) => {
                  const files = e.currentTarget.files;
                  if (files) {
                    Array.from(files).forEach((file) => {
                      handleGeneralPhotoUpload(file);
                    });
                  }
                }}
                className="hidden"
                disabled={uploadingGeneral}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={uploadingGeneral}
                asChild
              >
                <span>
                  {uploadingGeneral ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                  Adicionar Fotos
                </span>
              </Button>
            </label>
          </div>

          {/* Galeria de fotos gerais */}
          {generalPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {generalPhotos.map((photo) => (
                <div key={photo.id} className="relative group">
                  <img
                    src={photo.photo_url}
                    alt="Foto da ordem"
                    className="w-full h-24 object-cover rounded-md border border-border"
                  />
                  <button
                    onClick={() => {
                      setGeneralPhotos((prev) =>
                        prev.filter((p) => p.id !== photo.id)
                      );
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
