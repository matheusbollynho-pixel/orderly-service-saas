'use client'

import { useState } from 'react'
import {
  User, Bike, Settings, CheckSquare, Package, CreditCard, PenTool,
  Phone, MapPin, Instagram, Calendar, ChevronDown, ChevronUp, Check
} from 'lucide-react'
import { useApp } from '@/lib/store'
import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS, STATUS_COLORS, type StatusOS } from '@/lib/types'
import { cn, formatDateBR } from '@/lib/utils'
import { toast } from 'sonner'

const DETAIL_SECTIONS = [
  { id: 'checklist' as const, label: 'Checklist', icon: CheckSquare },
  { id: 'materiais' as const, label: 'Materiais', icon: Package },
  { id: 'pagamentos' as const, label: 'Pagamentos', icon: CreditCard },
  { id: 'assinatura' as const, label: 'Assinatura', icon: PenTool },
]

const STATUS_FLOW: StatusOS[] = ['aberta', 'em_andamento', 'aguardando_peca', 'finalizada', 'entregue']

export function OSDetail() {
  const { selectedOS, navigate, updateOS } = useApp()
  const [activeSection, setActiveSection] = useState<string | null>('checklist')

  if (!selectedOS) {
    navigate('lista')
    return null
  }

  const os = selectedOS

  const toggleChecklist = (itemId: string) => {
    const updated = {
      ...os,
      checklist: os.checklist.map(c =>
        c.id === itemId ? { ...c, checked: !c.checked } : c
      ),
      updated_at: new Date().toISOString(),
    }
    updateOS(updated)
  }

  const advanceStatus = () => {
    const currentIdx = STATUS_FLOW.indexOf(os.status)
    if (currentIdx < STATUS_FLOW.length - 1) {
      const nextStatus = STATUS_FLOW[currentIdx + 1]
      const updated = { ...os, status: nextStatus, updated_at: new Date().toISOString() }
      updateOS(updated)
      toast.success(`Status alterado para: ${STATUS_LABELS[nextStatus]}`)
    }
  }

  const totalMateriais = os.materiais.reduce((acc, m) => acc + m.quantidade * m.valor, 0)
  const totalPagamentos = os.pagamentos.reduce((acc, p) => acc + p.valor, 0)
  const checklistDone = os.checklist.filter(c => c.checked).length
  const checklistTotal = os.checklist.length

  const metodoLabel: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao_credito: 'Cartao Credito',
    cartao_debito: 'Cartao Debito',
  }

  return (
    <div className="flex flex-col min-h-0">
      {/* OS identifier bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-primary">
            #{os.numero}
          </span>
          <Badge
            variant="outline"
            className={cn('text-[9px] rounded-[2px] border px-1.5 py-0 leading-4', STATUS_COLORS[os.status])}
          >
            {STATUS_LABELS[os.status]}
          </Badge>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {formatDateBR(os.data_entrada)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {/* Client Info */}
        <section className="glass-card rounded-[4px] p-3">
          <div className="flex items-center gap-2 mb-2">
            <User className="h-3.5 w-3.5 text-muted-foreground icon-hover" strokeWidth={1.5} />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <em>Cliente</em>
            </h3>
          </div>
          <p className="text-sm font-bold text-foreground">{os.cliente.nome}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">CPF: {os.cliente.cpf}</p>
          {os.cliente.telefone && (
            <div className="flex items-center gap-1.5 mt-1">
              <Phone className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-xs text-muted-foreground">{os.cliente.telefone}</span>
            </div>
          )}
          {os.cliente.endereco && (
            <div className="flex items-center gap-1.5 mt-1">
              <MapPin className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-xs text-muted-foreground">{os.cliente.endereco}</span>
            </div>
          )}
          {os.cliente.instagram && (
            <div className="flex items-center gap-1.5 mt-1">
              <Instagram className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-xs text-muted-foreground">{os.cliente.instagram}</span>
            </div>
          )}
        </section>

        {/* Motos */}
        <section className="glass-card rounded-[4px] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Bike className="h-3.5 w-3.5 text-muted-foreground icon-hover" strokeWidth={1.5} />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <em>Motos</em>
            </h3>
          </div>
          {os.motos.map(m => (
            <div key={m.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div>
                <p className="text-sm font-semibold text-foreground">{m.modelo || 'Sem modelo'}</p>
                <p className="text-xs text-muted-foreground">
                  {[m.ano, m.cor, m.km ? `${m.km}km` : ''].filter(Boolean).join(' - ')}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-primary">{m.placa}</span>
            </div>
          ))}
        </section>

        {/* Service Info */}
        <section className="glass-card rounded-[4px] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="h-3.5 w-3.5 text-muted-foreground icon-hover" strokeWidth={1.5} />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <em>Servico</em>
            </h3>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
              <span className="text-xs text-muted-foreground">
                Entrada: {formatDateBR(os.data_entrada)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Atendente: {os.atendente || 'Nao definido'}</p>
            <p className="text-xs text-muted-foreground">Adesivo: {os.adesivo_loja ? 'Sim' : 'Nao'}</p>
            {os.quem_retira === 'outro' && (
              <p className="text-xs text-muted-foreground">
                Retirada: {os.retirada_nome} ({os.retirada_telefone})
              </p>
            )}
            <div className="mt-2 rounded-[4px] bg-accent/50 p-3">
              <p className="text-sm text-foreground leading-relaxed">{os.descricao_servico}</p>
            </div>
          </div>
        </section>

        {/* Accordion sections */}
        {DETAIL_SECTIONS.map(section => {
          const Icon = section.icon
          const isOpen = activeSection === section.id
          return (
            <section key={section.id} className="glass-card rounded-[4px] overflow-hidden">
              <button
                onClick={() => setActiveSection(isOpen ? null : section.id)}
                className="w-full flex items-center justify-between p-3 text-left transition-colors hover:bg-accent/30"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground icon-hover" strokeWidth={1.5} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {section.label}
                  </span>
                  {section.id === 'checklist' && checklistTotal > 0 && (
                    <span className="text-[10px] font-mono text-primary">
                      {checklistDone}/{checklistTotal}
                    </span>
                  )}
                </div>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                )}
              </button>

              {isOpen && (
                <div className="border-t border-border p-3">
                  {/* Checklist */}
                  {section.id === 'checklist' && (
                    os.checklist.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum item no checklist</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {os.checklist.map(item => (
                          <button
                            key={item.id}
                            onClick={() => toggleChecklist(item.id)}
                            className="flex items-center gap-3 rounded-[4px] p-2 text-left transition-colors hover:bg-accent/30"
                          >
                            <div className={cn(
                              'flex h-5 w-5 items-center justify-center rounded-[4px] border transition-colors',
                              item.checked
                                ? 'border-primary bg-primary'
                                : 'border-border'
                            )}>
                              {item.checked && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={2} />}
                            </div>
                            <span className={cn(
                              'text-sm',
                              item.checked ? 'text-muted-foreground line-through' : 'text-foreground'
                            )}>
                              {item.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  )}

                  {/* Materiais */}
                  {section.id === 'materiais' && (
                    os.materiais.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum material registrado</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {os.materiais.map(m => (
                          <div key={m.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                            <div>
                              <p className="text-sm text-foreground">{m.nome}</p>
                              <p className="text-xs text-muted-foreground">Qtd: {m.quantidade}</p>
                            </div>
                            <span className="text-sm font-mono font-semibold text-foreground">
                              R$ {(m.quantidade * m.valor).toFixed(2)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total</span>
                          <span className="text-sm font-mono font-bold text-primary">
                            R$ {totalMateriais.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )
                  )}

                  {/* Pagamentos */}
                  {section.id === 'pagamentos' && (
                    os.pagamentos.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum pagamento registrado</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {os.pagamentos.map(p => (
                          <div key={p.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                            <div>
                              <p className="text-sm text-foreground">{metodoLabel[p.metodo] || p.metodo}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateBR(p.data)}
                              </p>
                            </div>
                            <span className="text-sm font-mono font-semibold text-foreground">
                              R$ {p.valor.toFixed(2)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Pago</span>
                          <span className="text-sm font-mono font-bold text-primary">
                            R$ {totalPagamentos.toFixed(2)}
                          </span>
                        </div>
                        {totalMateriais > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saldo</span>
                            <span className={cn(
                              'text-sm font-mono font-bold',
                              totalPagamentos >= totalMateriais ? 'text-success' : 'text-warning'
                            )}>
                              R$ {(totalPagamentos - totalMateriais).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {/* Assinatura */}
                  {section.id === 'assinatura' && (
                    <div className="flex flex-col items-center gap-3 py-4">
                      {os.assinatura ? (
                        <div className="rounded-[4px] border border-border p-4 bg-accent/20">
                          <p className="text-xs text-muted-foreground text-center">Assinatura registrada</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <div className="h-24 w-full rounded-[4px] border border-dashed border-border flex items-center justify-center">
                            <PenTool className="h-6 w-6 text-muted-foreground/40" strokeWidth={1} />
                          </div>
                          <p className="text-xs text-muted-foreground">Assinatura pendente</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {/* Bottom action - advance status */}
      {os.status !== 'entregue' && (
        <div className="border-t border-border p-4 pb-22">
          <button
            onClick={advanceStatus}
            className="w-full rounded-[4px] bg-primary py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.995]"
          >
            Avancar para: {STATUS_LABELS[STATUS_FLOW[STATUS_FLOW.indexOf(os.status) + 1]]}
          </button>
        </div>
      )}
    </div>
  )
}
