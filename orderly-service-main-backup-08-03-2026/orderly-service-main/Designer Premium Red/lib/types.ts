export interface Cliente {
  id: string
  nome: string
  cpf: string
  telefone?: string
  apelido?: string
  instagram?: string
  endereco?: string
  nascimento?: string
  autoriza_instagram: boolean
  autoriza_lembretes: boolean
}

export interface Moto {
  id: string
  modelo: string
  ano?: string
  cor?: string
  placa: string
  km?: string
}

export interface OrdemServico {
  id: string
  numero: number
  cliente: Cliente
  motos: Moto[]
  data_entrada: string
  quem_retira: 'cliente' | 'outro'
  retirada_nome?: string
  retirada_telefone?: string
  retirada_cpf?: string
  atendente: string
  adesivo_loja: boolean
  descricao_servico: string
  status: 'aberta' | 'em_andamento' | 'aguardando_peca' | 'finalizada' | 'entregue'
  checklist: ChecklistItem[]
  materiais: Material[]
  pagamentos: Pagamento[]
  assinatura?: string
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: string
  label: string
  checked: boolean
}

export interface Material {
  id: string
  nome: string
  quantidade: number
  valor: number
}

export interface Pagamento {
  id: string
  metodo: 'dinheiro' | 'pix' | 'cartao_credito' | 'cartao_debito'
  valor: number
  data: string
}

export type StatusOS = OrdemServico['status']

export const STATUS_LABELS: Record<StatusOS, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em Andamento',
  aguardando_peca: 'Aguardando Peca',
  finalizada: 'Finalizada',
  entregue: 'Entregue',
}

export const STATUS_COLORS: Record<StatusOS, string> = {
  aberta: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  em_andamento: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  aguardando_peca: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  finalizada: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  entregue: 'bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30',
}
