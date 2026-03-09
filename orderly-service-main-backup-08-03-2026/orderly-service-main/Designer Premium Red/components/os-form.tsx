'use client'

import { useState, useCallback } from 'react'
import {
  ArrowLeft, User, Bike, Settings, Plus, Trash2, Search,
  AlertTriangle, Loader2
} from 'lucide-react'
import { useApp } from '@/lib/store'
import { ATENDENTES, CLIENTES_MOCK } from '@/lib/mock-data'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Cliente, Moto, OrdemServico } from '@/lib/types'

const PALAVRAS_CHAVE = ['urgente', 'garantia', 'recall', 'sinistro', 'seguro']

const TABS = [
  { id: 'cliente' as const, label: 'Cliente', icon: User },
  { id: 'motos' as const, label: 'Motos', icon: Bike },
  { id: 'servicos' as const, label: 'Servicos', icon: Settings },
]

interface FormMoto {
  id: string
  modelo: string
  ano: string
  cor: string
  placa: string
  km: string
}

function emptyMoto(): FormMoto {
  return { id: crypto.randomUUID(), modelo: '', ano: '', cor: '', placa: '', km: '' }
}

export function OSForm() {
  const { navigate, addOS, ordens } = useApp()
  const [tab, setTab] = useState<'cliente' | 'motos' | 'servicos'>('cliente')
  const [loading, setLoading] = useState(false)

  // Client search
  const [clienteSearch, setClienteSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Cliente fields
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [apelido, setApelido] = useState('')
  const [instagram, setInstagram] = useState('')
  const [endereco, setEndereco] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [autorizaInstagram, setAutorizaInstagram] = useState(false)
  const [autorizaLembretes, setAutorizaLembretes] = useState(false)

  // Motos
  const [motos, setMotos] = useState<FormMoto[]>([emptyMoto()])

  // Servicos
  const [dataEntrada, setDataEntrada] = useState(new Date().toISOString().split('T')[0])
  const [quemRetira, setQuemRetira] = useState<'cliente' | 'outro'>('cliente')
  const [retiradaNome, setRetiradaNome] = useState('')
  const [retiradaTelefone, setRetiradaTelefone] = useState('')
  const [retiradaCpf, setRetiradaCpf] = useState('')
  const [atendente, setAtendente] = useState('')
  const [adesivoLoja, setAdesivoLoja] = useState<'sim' | 'nao'>('sim')
  const [descricao, setDescricao] = useState('')

  const suggestions = CLIENTES_MOCK.filter(c =>
    clienteSearch.length >= 2 &&
    (c.nome.toLowerCase().includes(clienteSearch.toLowerCase()) ||
     c.cpf.includes(clienteSearch) ||
     c.telefone?.includes(clienteSearch))
  )

  const selectCliente = (c: Cliente) => {
    setNome(c.nome)
    setCpf(c.cpf)
    setTelefone(c.telefone || '')
    setApelido(c.apelido || '')
    setInstagram(c.instagram || '')
    setEndereco(c.endereco || '')
    setNascimento(c.nascimento || '')
    setAutorizaInstagram(c.autoriza_instagram)
    setAutorizaLembretes(c.autoriza_lembretes)
    setClienteSearch('')
    setShowSuggestions(false)
  }

  const updateMoto = (id: string, field: keyof FormMoto, value: string) => {
    setMotos(prev => prev.map(m =>
      m.id === id ? { ...m, [field]: field === 'placa' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : value } : m
    ))
  }

  const addMoto = () => setMotos(prev => [...prev, emptyMoto()])
  const removeMoto = (id: string) => setMotos(prev => prev.filter(m => m.id !== id))

  const detectedKeywords = PALAVRAS_CHAVE.filter(kw =>
    descricao.toLowerCase().includes(kw)
  )

  const isValid = nome.trim() && cpf.trim() && motos.every(m => m.placa.trim()) && dataEntrada

  const handleSubmit = useCallback(async () => {
    if (!isValid) return
    setLoading(true)
    // Simulate API delay
    await new Promise(r => setTimeout(r, 1200))

    const newOS: OrdemServico = {
      id: `os-${crypto.randomUUID().slice(0, 8)}`,
      numero: (ordens.length > 0 ? Math.max(...ordens.map(o => o.numero)) : 1000) + 1,
      cliente: {
        id: crypto.randomUUID(),
        nome, cpf, telefone, apelido, instagram, endereco, nascimento,
        autoriza_instagram: autorizaInstagram,
        autoriza_lembretes: autorizaLembretes,
      },
      motos: motos.map(m => ({ id: m.id, modelo: m.modelo, ano: m.ano, cor: m.cor, placa: m.placa, km: m.km })),
      data_entrada: dataEntrada,
      quem_retira: quemRetira,
      retirada_nome: quemRetira === 'outro' ? retiradaNome : undefined,
      retirada_telefone: quemRetira === 'outro' ? retiradaTelefone : undefined,
      retirada_cpf: quemRetira === 'outro' ? retiradaCpf : undefined,
      atendente,
      adesivo_loja: adesivoLoja === 'sim',
      descricao_servico: descricao,
      status: 'aberta',
      checklist: [],
      materiais: [],
      pagamentos: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    addOS(newOS)
    setLoading(false)
    toast.success(`OS #${newOS.numero} criada com sucesso!`)
    navigate('detalhe', newOS)
  }, [isValid, nome, cpf, telefone, apelido, instagram, endereco, nascimento, autorizaInstagram, autorizaLembretes, motos, dataEntrada, quemRetira, retiradaNome, retiradaTelefone, retiradaCpf, atendente, adesivoLoja, descricao, ordens, addOS, navigate])

  return (
    <div className="flex flex-col min-h-0">
      {/* Back button */}
      {/* Back handled by header */}

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors border-b-2',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* ====== CLIENTE TAB ====== */}
        {tab === 'cliente' && (
          <div className="flex flex-col gap-4">
            {/* Search autocomplete */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
              <input
                type="text"
                placeholder="Buscar cliente existente..."
                value={clienteSearch}
                onChange={e => { setClienteSearch(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full rounded-[4px] border border-border bg-input py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-[4px] border border-border bg-popover shadow-lg">
                  {suggestions.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectCliente(c)}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 transition-colors border-b border-border last:border-0"
                    >
                      <span className="font-semibold">{c.nome}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{c.cpf}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <FormField label="Nome *" value={nome} onChange={setNome} placeholder="Nome completo" />
            <FormField label="CPF *" value={cpf} onChange={setCpf} placeholder="000.000.000-00" />
            <FormField label="Telefone" value={telefone} onChange={setTelefone} placeholder="(00) 00000-0000" />
            <FormField label="Apelido" value={apelido} onChange={setApelido} placeholder="Apelido" />
            <FormField label="Instagram" value={instagram} onChange={setInstagram} placeholder="@usuario" />
            <FormField label="Endereco" value={endereco} onChange={setEndereco} placeholder="Endereco completo" />

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Data de Nascimento
              </label>
              <input
                type="date"
                value={nascimento}
                onChange={e => setNascimento(e.target.value)}
                className="rounded-[4px] border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-between glass-card rounded-[4px] p-3">
              <span className="text-sm text-foreground">Autoriza divulgacao no Instagram</span>
              <Switch checked={autorizaInstagram} onCheckedChange={setAutorizaInstagram} />
            </div>
            <div className="flex items-center justify-between glass-card rounded-[4px] p-3">
              <span className="text-sm text-foreground">Autoriza lembretes por mensagem</span>
              <Switch checked={autorizaLembretes} onCheckedChange={setAutorizaLembretes} />
            </div>
          </div>
        )}

        {/* ====== MOTOS TAB ====== */}
        {tab === 'motos' && (
          <div className="flex flex-col gap-4">
            {motos.map((moto, idx) => (
              <div key={moto.id} className="glass-card rounded-[4px] p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Moto {idx + 1}
                  </span>
                  {motos.length > 1 && (
                    <button
                      onClick={() => removeMoto(moto.id)}
                      className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                      Remover
                    </button>
                  )}
                </div>
                <FormField
                  label="Placa *"
                  value={moto.placa}
                  onChange={v => updateMoto(moto.id, 'placa', v)}
                  placeholder="ABC1D23"
                  maxLength={7}
                />
                <FormField
                  label="Modelo"
                  value={moto.modelo}
                  onChange={v => updateMoto(moto.id, 'modelo', v)}
                  placeholder="Ex: Honda CB 500F"
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="Ano"
                    value={moto.ano}
                    onChange={v => updateMoto(moto.id, 'ano', v)}
                    placeholder="2024"
                  />
                  <FormField
                    label="Cor"
                    value={moto.cor}
                    onChange={v => updateMoto(moto.id, 'cor', v)}
                    placeholder="Preta"
                  />
                </div>
                <FormField
                  label="KM"
                  value={moto.km}
                  onChange={v => updateMoto(moto.id, 'km', v)}
                  placeholder="15000"
                />
              </div>
            ))}

            <button
              onClick={addMoto}
              className="flex items-center justify-center gap-2 rounded-[4px] border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Nova Moto
            </button>
          </div>
        )}

        {/* ====== SERVICOS TAB ====== */}
        {tab === 'servicos' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Data de Entrada *
              </label>
              <input
                type="date"
                value={dataEntrada}
                onChange={e => setDataEntrada(e.target.value)}
                className="rounded-[4px] border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Quem retira a moto
              </label>
              <select
                value={quemRetira}
                onChange={e => setQuemRetira(e.target.value as 'cliente' | 'outro')}
                className="rounded-[4px] border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="cliente">O proprio cliente</option>
                <option value="outro">Outra pessoa</option>
              </select>
            </div>

            {quemRetira === 'outro' && (
              <div className="glass-card rounded-[4px] p-4 flex flex-col gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Dados de quem retira
                </span>
                <FormField label="Nome" value={retiradaNome} onChange={setRetiradaNome} placeholder="Nome completo" />
                <FormField label="Telefone" value={retiradaTelefone} onChange={setRetiradaTelefone} placeholder="(00) 00000-0000" />
                <FormField label="CPF" value={retiradaCpf} onChange={setRetiradaCpf} placeholder="000.000.000-00" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Atendente Responsavel
              </label>
              <select
                value={atendente}
                onChange={e => setAtendente(e.target.value)}
                className="rounded-[4px] border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Selecione...</option>
                {ATENDENTES.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              {!atendente && (
                <div className="flex items-center gap-2 rounded-[4px] bg-warning/10 border border-warning/20 px-3 py-2 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" strokeWidth={1.5} />
                  <span className="text-xs text-warning">Selecione o atendente responsavel</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Adesivo da Loja
              </label>
              <select
                value={adesivoLoja}
                onChange={e => setAdesivoLoja(e.target.value as 'sim' | 'nao')}
                className="rounded-[4px] border border-border bg-input px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="sim">Sim</option>
                <option value="nao">Nao</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                O que fazer na moto
              </label>
              <textarea
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="Descreva os servicos a serem realizados..."
                rows={4}
                className="rounded-[4px] border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              {detectedKeywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-[4px] bg-warning/10 border border-warning/20 px-3 py-2 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" strokeWidth={1.5} />
                  <span className="text-xs text-warning">Palavras-chave detectadas:</span>
                  {detectedKeywords.map(kw => (
                    <span key={kw} className="rounded-[4px] bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom action */}
      <div className="border-t border-border p-4 pb-22">
        {tab !== 'servicos' ? (
          <button
            onClick={() => setTab(tab === 'cliente' ? 'motos' : 'servicos')}
            className="w-full rounded-[4px] bg-accent py-2.5 text-xs font-bold uppercase tracking-[0.15em] text-accent-foreground transition-colors hover:bg-accent/80"
          >
            Proximo: {tab === 'cliente' ? 'Motos' : 'Servicos'}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className={cn(
              'w-full rounded-[4px] py-2.5 text-xs font-bold uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2',
              isValid && !loading
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.995]'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading ? 'Criando OS...' : 'Finalizar OS'}
          </button>
        )}
      </div>
    </div>
  )
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="rounded-[4px] border border-border bg-input px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  )
}
