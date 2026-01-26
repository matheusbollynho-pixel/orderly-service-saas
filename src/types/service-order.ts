export type OrderStatus = 'aberta' | 'em_andamento' | 'concluida';

export interface ChecklistItem {
  id: string;
  order_id: string;
  label: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  item_type?: 'checkbox' | 'yesno' | 'rating' | 'textarea';
  rating?: number | null;
  observations?: string | null;
}

export interface Material {
  id: string;
  order_id: string;
  descricao: string;
  quantidade: string;
  valor: number;
  is_service?: boolean; // true = servico (entra em comissao), false = peca
  mechanic_id?: string | null; // mecanico responsavel pelo item
  paid_at?: string | null; // data quando foi pago
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'transferencia' | 'outro';

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface ServiceOrder {
  id: string;
  client_id?: string | null;
  motorcycle_id?: string | null;
  client_name: string;
  client_cpf?: string;
  client_apelido?: string;
  client_instagram?: string;
  autoriza_instagram?: boolean;
  client_phone: string;
  client_address: string;
  client_birth_date?: string; // YYYY-MM-DD
  equipment: string;
  problem_description: string;
  status: OrderStatus;
  signature_data: string | null;
  entry_date?: string;
  exit_date?: string | null;
  created_at: string;
  updated_at: string;
  mechanic_id?: string | null;
  checklist_items?: ChecklistItem[];
  materials?: Material[];
  payments?: Payment[];
}

export interface BirthdayDiscount {
  id: string;
  service_order_id: string;
  discount_percentage: number;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  message_sent_at: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Mechanic {
  id: string;
  name: string;
  commission_rate: number; // percent e.g., 10.00
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_CHECKLIST_ITEMS = [
  { label: 'Chave da MOTO', type: 'yesno' as const },
  { label: 'Funcionamento do Motor', type: 'yesno' as const },
  { label: 'Elétrica', type: 'yesno' as const },
  { label: 'NÍVEL DE GASOLINA', type: 'rating' as const },
  { label: 'Observações', type: 'textarea' as const },
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
};
