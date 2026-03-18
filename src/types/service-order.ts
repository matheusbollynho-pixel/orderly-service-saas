export type OrderStatus = 'aberta' | 'em_andamento' | 'concluida' | 'concluida_entregue';

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
  type?: CashFlowType; // entrada, saida ou retirada
  is_service?: boolean; // true = servico (entra em comissao), false = peca
  mechanic_id?: string | null; // mecanico responsavel pelo item
  payment_method?: PaymentMethod | null; // forma de pagamento do item (pix, dinheiro, cartao)
  paid_at?: string | null; // data quando foi pago
  product_id?: string | null; // produto do estoque vinculado (baixa automática)
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = 'dinheiro' | 'pix' | 'cartao';

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  discount_amount?: number | null;
  method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  finalized_by_staff_id?: string | null;
  created_at: string;
}

export interface ServiceOrder {
  id: string;
  client_id?: string | null;
  motorcycle_id?: string | null;
  atendimento_id?: string | null;
  client_name: string;
  client_cpf?: string;
  client_apelido?: string;
  client_instagram?: string;
  autoriza_instagram?: boolean;
  autoriza_lembretes?: boolean;
  client_phone: string;
  client_address: string;
  client_birth_date?: string; // YYYY-MM-DD
  equipment: string;
  problem_description: string;
  status: OrderStatus;
  signature_data: string | null;
  first_signature_data?: string | null;
  conclusion_date?: string | null;
  terms_accepted?: boolean; // Se aceitou os termos da OS
  delivery_terms_accepted?: boolean;
  delivery_signature_data?: string | null;
  first_delivery_signature_data?: string | null;
  entry_date?: string;
  exit_date?: string | null;
  created_at: string;
  updated_at: string;
  mechanic_id?: string | null;
  checklist_items?: ChecklistItem[];
  materials?: Material[];
  payments?: Payment[];
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'balconista' | 'dono' | 'outro';
  photo_url?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SatisfactionRating {
  id: string;
  order_id: string | null;
  client_id?: string | null;
  atendimento_id?: string | null;
  mechanic_id?: string | null;
  atendimento_rating?: number | null;
  servico_rating?: number | null;
  tags: {
    atendimento: string[];
    servico: string[];
  };
  comment?: string | null;
  recommends?: boolean | null;
  status: 'pendente' | 'resolvido';
  responded_at?: string | null;
  public_token: string;
  sent_at: string;
  created_at: string;
  updated_at: string;
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
  photo_url?: string | null;
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
  concluida_entregue: 'Concluída e Entregue',
};

export type CashFlowType = 'entrada' | 'saida' | 'retirada';

export interface CashFlow {
  id: string;
  type: CashFlowType;
  amount: number;
  description: string;
  category?: string | null;
  payment_method?: PaymentMethod | null;
  order_id?: string | null;
  payment_id?: string | null;
  inventory_movement_id?: string | null;
  date: string;
  notes?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface CashFlowSummary {
  date: string;
  total_entradas: number;
  total_saidas: number;
  total_retiradas: number;
  saldo: number;
  entradas: CashFlow[];
  saidas: CashFlow[];
  retiradas: CashFlow[];
}

export interface CashFlowPeriodSummary {
  start_date: string;
  end_date: string;
  total_entradas: number;
  total_saidas: number;
  total_retiradas: number;
  saldo: number;
  entradas: CashFlow[];
  saidas: CashFlow[];
  retiradas: CashFlow[];
}
