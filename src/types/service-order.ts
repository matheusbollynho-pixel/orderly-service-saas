export type OrderStatus = 'aberta' | 'em_andamento' | 'concluida';

export interface ChecklistItem {
  id: string;
  order_id: string;
  label: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface ServiceOrder {
  id: string;
  client_name: string;
  client_phone: string;
  client_address: string;
  equipment: string;
  problem_description: string;
  status: OrderStatus;
  signature_data: string | null;
  created_at: string;
  updated_at: string;
  checklist_items?: ChecklistItem[];
}

export const DEFAULT_CHECKLIST_ITEMS = [
  'Diagnóstico inicial',
  'Limpeza do equipamento',
  'Verificação de componentes',
  'Troca de peças (se necessário)',
  'Teste de funcionamento',
  'Limpeza final',
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
};
