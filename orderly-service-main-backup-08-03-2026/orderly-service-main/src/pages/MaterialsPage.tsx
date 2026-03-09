import { useState } from 'react';
import { ServiceOrder, Mechanic } from '@/types/service-order';
import { MaterialsNote } from '@/components/MaterialsNote';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MaterialsPageProps {
  order: ServiceOrder;
  mecanicos?: Mechanic[];
  onBack: () => void;
  onAddMaterial: (material: Material) => void;
  onRemoveMaterial: (id: string) => void;
  onUpdateMaterial: (id: string, field: string, value: string) => void;
  isUpdating?: boolean;
  disabledAll?: boolean;
  isCreatingMaterial?: boolean;
  isUpdatingMaterial?: boolean;
  isDeletingMaterial?: boolean;
}

export function MaterialsPage({
  order,
  mecanicos = [],
  onBack,
  onAddMaterial,
  onRemoveMaterial,
  onUpdateMaterial,
  isUpdating = false,
  disabledAll = false,
  isCreatingMaterial = false,
  isUpdatingMaterial = false,
  isDeletingMaterial = false,
}: MaterialsPageProps) {
  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onBack}
          className="h-9 w-9"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Peças e Serviços</h2>
          <p className="text-xs text-muted-foreground">{order.client_name}</p>
        </div>
      </div>

      {/* Order Info Card */}
      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Informações da Ordem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Cliente</p>
            <p className="text-sm font-medium">{order.client_name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">MOTO</p>
            <p className="text-sm font-medium">{order.equipment}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Data</p>
            <p className="text-sm font-medium">
              {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Problema</p>
            <p className="text-sm font-medium">{order.problem_description?.split('\n\nRetirada:')[0] || order.problem_description}</p>
          </div>
        </CardContent>
      </Card>

      {/* Materials Note */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <MaterialsNote
            materiais={order.materials || []}
            mecanicos={mecanicos}
            onAddMaterial={onAddMaterial}
            onRemoveMaterial={onRemoveMaterial}
            onUpdateMaterial={onUpdateMaterial}
            disabled={order.status === 'concluida' || disabledAll}
            loadingAdd={isCreatingMaterial}
            loadingUpdate={isUpdatingMaterial}
            loadingDelete={isDeletingMaterial}
          />
        </CardContent>
      </Card>
    </div>
  );
}
