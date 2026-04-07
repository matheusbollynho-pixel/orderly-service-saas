"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, MapPin, Phone, Instagram, Star } from "lucide-react"
import LOGO_BASE64 from "@/assets/logo"
import { useStoreSettings } from "@/hooks/useStoreSettings"
import { VEHICLE_CAP } from "@/lib/vehicleLabel"

interface ChecklistItem {
  name: string
  checked: boolean
  rating?: number
}

interface ServiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

interface NotaBalcaoData {
  osId: string
  dataEntrada: string
  dataConclusao: string
  cliente: {
    nome: string
    telefone: string
    endereco: string
  }
  veiculo: {
    marca: string
    modelo: string
    ano: string
    cor: string
    placa: string
    km?: string
  }
  checklist: ChecklistItem[]
  observacoesChecklist: string
  servicosRealizar: string
  retiradaInfo: string
  itens: ServiceItem[]
  subtotal: number
  desconto: number
  totalPago: number
  observacaoPagamento: string
  status: string
  signatureChecklist?: string | null
  signatureCliente?: string | null
}

interface NotaBalcaoProps {
  data: NotaBalcaoData
  editable?: boolean
  saveToken?: number
  resetToken?: number
  layoutStorageKey?: string
  onLayoutSaved?: () => void
}

type LayoutPosition = { x: number; y: number }
type LayoutPositions = Record<string, LayoutPosition>
type LayoutSizes = Record<string, number>
type PersistedLayout = {
  positions: LayoutPositions
  sizes: LayoutSizes
}

const EMPTY_POSITION: LayoutPosition = { x: 0, y: 0 }

// Layout padrão otimizado
const DEFAULT_POSITIONS: LayoutPositions = {
  "header-logo": { x: -208.75, y: -48.75 },
  "header-contacts": { x: -215, y: -81.25 },
  "header-status": { x: 298.75, y: -197.5 },
  "header-os-box": { x: 87.5, y: -195 },
  "header-divider": { x: 1.25, y: -221.25 },
  "section-client-vehicle": { x: 2.5, y: -235 },
  "section-checklist-services": { x: 2.5, y: -233.75 },
  "section-items": { x: 2.5, y: -233.75 },
  "section-totals": { x: 1.25, y: -232.5 },
}

const DEFAULT_SIZES: LayoutSizes = {
  "header-logo": 1.1,
  "header-status": 0.75,
  "header-os-box": 0.75,
}

export function NotaBalcao({
  data,
  editable = false,
  saveToken,
  resetToken,
  layoutStorageKey = "nota-balcao-layout-v1",
  onLayoutSaved,
}: NotaBalcaoProps) {
  // Guard clause: se dados essenciais estão faltando, renderizar placeholder
  const hasEssentialData = !!data?.cliente && !!data?.veiculo;
  if (!hasEssentialData) {
    console.warn('⚠️ NotaBalcao: dados incompletos', { cliente: data?.cliente, veiculo: data?.veiculo });
  }

  const { settings: storeSettings } = useStoreSettings()
  const [logoBase64, setLogoBase64] = useState<string>('')
  useEffect(() => {
    const path = import.meta.env.VITE_LOGO_PATH || '/client-logo.png'
    const url = path.startsWith('http') ? path : `${window.location.origin}${path}`
    fetch(url)
      .then(res => res.blob())
      .then(blob => new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      }))
      .then(b64 => setLogoBase64(b64))
      .catch(() => {})
  }, [])

  const [positions, setPositions] = useState<LayoutPositions>({})
  const [sizes, setSizes] = useState<LayoutSizes>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<{
    id: string
    startX: number
    startY: number
    baseX: number
    baseY: number
  } | null>(null)

  const sectionIds = useMemo(
    () => [
      "header-logo",
      "header-contacts",
      "header-status",
      "header-os-box",
      "header-divider",
      "section-client-vehicle",
      "section-checklist-services",
      "section-items",
      "section-totals",
      "section-signatures",
      "section-footer",
    ],
    []
  )

  const sectionLabels = useMemo<Record<string, string>>(
    () => ({
      "header-logo": "Cabeçalho - Logo",
      "header-contacts": "Cabeçalho - Contatos",
      "header-status": "Cabeçalho - Status",
      "header-os-box": "Cabeçalho - Box OS",
      "header-divider": "Cabeçalho - Linha vermelha",
      "section-client-vehicle": "Cliente + Veículo",
      "section-checklist-services": "Checklist + Serviços",
      "section-items": "Tabela de Itens",
      "section-totals": "Totais/Pagamento",
      "section-signatures": "Assinaturas",
      "section-footer": "Rodapé",
    }),
    []
  )

  const defaultLayoutStorageKey = `${layoutStorageKey}-default`

  useEffect(() => {
    try {
      const raw =
        window.localStorage.getItem(layoutStorageKey) ||
        window.localStorage.getItem(defaultLayoutStorageKey)
      
      if (!raw) {
        // Usa layout padrão quando não há nada salvo
        setPositions(DEFAULT_POSITIONS)
        setSizes(DEFAULT_SIZES)
        return
      }
      
      const parsed = JSON.parse(raw) as PersistedLayout | LayoutPositions

      if (
        parsed &&
        typeof parsed === "object" &&
        "positions" in parsed &&
        "sizes" in parsed
      ) {
        const newLayout = parsed as PersistedLayout
        setPositions(newLayout.positions || {})
        setSizes(newLayout.sizes || {})
        return
      }

      if (parsed && typeof parsed === "object") {
        setPositions(parsed as LayoutPositions)
      }
    } catch {
      // Em caso de erro, usa layout padrão
      setPositions(DEFAULT_POSITIONS)
      setSizes(DEFAULT_SIZES)
    }
  }, [layoutStorageKey, defaultLayoutStorageKey])

  useEffect(() => {
    if (!saveToken) return
    try {
      const serialized = JSON.stringify({ positions, sizes } satisfies PersistedLayout)
      window.localStorage.setItem(layoutStorageKey, serialized)
      window.localStorage.setItem(defaultLayoutStorageKey, serialized)
      onLayoutSaved?.()
    } catch {
      // Ignora erro de storage
    }
  }, [saveToken, layoutStorageKey, defaultLayoutStorageKey, positions, sizes, onLayoutSaved])

  useEffect(() => {
    if (!resetToken) return

    try {
      const defaultRaw = window.localStorage.getItem(defaultLayoutStorageKey)
      if (defaultRaw) {
        const parsed = JSON.parse(defaultRaw) as PersistedLayout | LayoutPositions
        if (
          parsed &&
          typeof parsed === "object" &&
          "positions" in parsed &&
          "sizes" in parsed
        ) {
          const newLayout = parsed as PersistedLayout
          setPositions(newLayout.positions || {})
          setSizes(newLayout.sizes || {})
          window.localStorage.setItem(layoutStorageKey, defaultRaw)
          return
        }
      }

      setPositions({})
      setSizes({})
      window.localStorage.removeItem(layoutStorageKey)
    } catch {
      // Ignora erro de storage
    }
  }, [resetToken, layoutStorageKey, defaultLayoutStorageKey, sectionIds])

  useEffect(() => {
    if (!dragState) return

    const handleMove = (event: PointerEvent) => {
      const dx = event.clientX - dragState.startX
      const dy = event.clientY - dragState.startY

      setPositions((prev) => ({
        ...prev,
        [dragState.id]: {
          x: dragState.baseX + dx,
          y: dragState.baseY + dy,
        },
      }))
    }

    const handleUp = () => {
      setDragState(null)
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)

    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
    }
  }, [dragState])

  const startDrag = (id: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return
    event.preventDefault()
    setSelectedId(id)
    const current = positions[id] || EMPTY_POSITION
    setDragState({
      id,
      startX: event.clientX,
      startY: event.clientY,
      baseX: current.x,
      baseY: current.y,
    })
  }

  const getPositionStyle = (id: string): React.CSSProperties => {
    const pos = positions[id]
    const size = sizes[id] ?? 1
    const hasMove = !!pos && (pos.x !== 0 || pos.y !== 0)
    const hasScale = size !== 1

    if (!hasMove && !hasScale) {
      return {
        position: "relative",
        zIndex: editable ? 20 : "auto",
      }
    }

    const finalPos = pos || EMPTY_POSITION
    return {
      transform: `translate(${finalPos.x}px, ${finalPos.y}px) scale(${size})`,
      transformOrigin: "top center",
      position: "relative",
      zIndex: editable ? 20 : "auto",
    }
  }

  const clampSize = (value: number) => Math.max(0.5, Math.min(2, value))

  const updateSize = (id: string, delta: number) => {
    setSizes((prev) => ({
      ...prev,
      [id]: clampSize((prev[id] || 1) + delta),
    }))
  }

  const setExactSize = (id: string, size: number) => {
    setSizes((prev) => ({
      ...prev,
      [id]: clampSize(size),
    }))
  }

  const handleWheelResize = (id: string, event: React.WheelEvent<HTMLDivElement>) => {
    if (!editable || !event.ctrlKey) return
    event.preventDefault()
    setSelectedId(id)
    updateSize(id, event.deltaY < 0 ? 0.03 : -0.03)
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value)
  }

  const embeddedLogoSrc = LOGO_BASE64?.startsWith("data:")
    ? LOGO_BASE64
    : `data:image/png;base64,${LOGO_BASE64}`

  const logoSrc = import.meta.env.VITE_LOGO_PATH || "/client-logo.png"

  const dragClass = editable
    ? "cursor-move border border-dashed border-[#C1272D]/50 rounded-md"
    : ""

  const selectedClass = (id: string) =>
    editable && selectedId === id ? "ring-2 ring-[#C1272D]" : ""

  const selectedSize = selectedId ? sizes[selectedId] || 1 : 1

  const normalizeLabel = (value: string) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()

  return (
    <div className="w-[210mm] min-h-[297mm] bg-white mx-auto p-8 font-sans text-gray-800 print:p-6 print:shadow-none shadow-lg">
      <header className="relative w-full pb-4">
        {/* Itens do cabeçalho separados */}
        <div
          className={`${editable ? "cursor-move" : ""} ${selectedClass("header-logo")}`}
          style={getPositionStyle("header-logo")}
          onPointerDown={(e) => startDrag("header-logo", e)}
          onWheel={(e) => handleWheelResize("header-logo", e)}
        >
          <img
            src={logoBase64 || logoSrc}
            data-pdf-src={logoSrc}
            alt="Logo"
            className="h-40 w-auto object-contain mx-auto"
          />
        </div>

        <div
          className={`${editable ? "cursor-move" : ""} ${selectedClass("header-contacts")} text-center text-[12px] text-gray-600 leading-tight`}
          style={getPositionStyle("header-contacts")}
          onPointerDown={(e) => startDrag("header-contacts", e)}
          onWheel={(e) => handleWheelResize("header-contacts", e)}
        >
          {storeSettings?.store_address && (
            <p className="flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3" />
              <span>{storeSettings.store_address}</span>
            </p>
          )}
          <p className="flex items-center justify-center gap-1">
            {storeSettings?.store_phone && (
              <>
                <Phone className="w-3 h-3" />
                <span>{storeSettings.store_phone}</span>
              </>
            )}
            {storeSettings?.store_instagram && (
              <>
                <span>|</span>
                <Instagram className="w-3 h-3" />
                <span>{storeSettings.store_instagram}</span>
              </>
            )}
          </p>
        </div>

        <div
          className={`${editable ? "cursor-move" : ""} ${selectedClass("header-status")}`}
          style={getPositionStyle("header-status")}
          onPointerDown={(e) => startDrag("header-status", e)}
          onWheel={(e) => handleWheelResize("header-status", e)}
        >
          <div className="mt-2 flex items-center justify-center gap-2">
            <p className="text-xs text-gray-600 font-semibold">STATUS:</p>
            <div
              className={`px-4 py-1 rounded-full text-sm font-semibold w-fit ${
              data.status === "CONCLUIDA"
                ? "bg-green-100 text-green-700"
                : data.status === "PENDENTE"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-blue-100 text-blue-700"
            }`}
            >
              {data.status}
            </div>
          </div>
        </div>

        {/* Box da OS fixado no canto direito */}
        <div
          className={`absolute top-0 right-0 text-right min-w-[170px] ${editable ? "cursor-move" : ""} ${selectedClass("header-os-box")}`}
          style={getPositionStyle("header-os-box")}
          onPointerDown={(e) => startDrag("header-os-box", e)}
          onWheel={(e) => handleWheelResize("header-os-box", e)}
        >
          <div className="bg-gray-100 px-5 py-2 rounded-md border border-gray-200 inline-block">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Ordem de Servico</p>
            <p className="text-xl leading-none font-bold text-[#C1272D]">No {data.osId}</p>
          </div>
          <p className="text-sm text-gray-600 mt-2 leading-tight">
            <span className="font-medium">Data de Entrada:</span> {data.dataEntrada}
          </p>
          <p className="text-sm text-gray-600 mt-1 leading-tight">
            <span className="font-medium">Data de Conclusao:</span> {data.dataConclusao}
          </p>
        </div>
      </header>

      <div
        className={`${editable ? "cursor-move" : ""} ${selectedClass("header-divider")}`}
        style={getPositionStyle("header-divider")}
        onPointerDown={(e) => startDrag("header-divider", e)}
        onWheel={(e) => handleWheelResize("header-divider", e)}
      >
        <div className="w-full h-[2px] bg-[#C1272D] mb-8" />
      </div>

      <div
        className={`${dragClass} ${selectedClass("section-client-vehicle")}`}
        style={getPositionStyle("section-client-vehicle")}
        onPointerDown={(e) => startDrag("section-client-vehicle", e)}
        onWheel={(e) => handleWheelResize("section-client-vehicle", e)}
      >
      <section className="grid grid-cols-2 gap-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-[#C1272D] uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
            Dados do Cliente
          </h2>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-gray-500">Nome:</span>{" "}
              <span className="font-medium">{data.cliente.nome}</span>
            </p>
            <p>
              <span className="text-gray-500">Telefone:</span>{" "}
              <span className="font-medium">{data.cliente.telefone}</span>
            </p>
            <p>
              <span className="text-gray-500">Endereco:</span>{" "}
              <span className="font-medium">{data.cliente.endereco}</span>
            </p>
            <p>
              <span className="text-gray-500">Retirada:</span>{" "}
              <span className="font-medium">{data.retiradaInfo || "Cliente"}</span>
            </p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-[#C1272D] uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
            Dados do Veiculo
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <p>
              <span className="text-gray-500">Modelo:</span>{" "}
              <span className="font-medium">{data.veiculo.modelo}</span>
            </p>
            <p>
              <span className="text-gray-500">Ano:</span>{" "}
              <span className="font-medium">{data.veiculo.ano}</span>
            </p>
            <p>
              <span className="text-gray-500">Cor:</span>{" "}
              <span className="font-medium">{data.veiculo.cor}</span>
            </p>
            <p>
              <span className="text-gray-500">Placa:</span>{" "}
              <span className="font-medium">{data.veiculo.placa}</span>
            </p>
            <p className="col-span-2">
              <span className="text-gray-500">Km:</span>{" "}
              <span className="font-medium">{data.veiculo.km || "---"}</span>
            </p>
          </div>
        </div>
      </section>
      </div>

      <div
        className={`${dragClass} ${selectedClass("section-checklist-services")}`}
        style={getPositionStyle("section-checklist-services")}
        onPointerDown={(e) => startDrag("section-checklist-services", e)}
        onWheel={(e) => handleWheelResize("section-checklist-services", e)}
      >
      <section className="mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-[#C1272D] uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
              Checklist de Inspecao
            </h2>
            <div className="grid grid-cols-1 gap-1.5">
              {data.checklist.map((item, index) => (
                <div key={index} className="flex items-start justify-between gap-2 text-xs leading-tight min-h-5">
                  {normalizeLabel(item.name).includes("NIVEL DE GASOLINA") ? (
                    <>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-[1px] ${
                          item.checked
                            ? "bg-[#C1272D] text-white"
                            : "border border-gray-300"
                        }`}
                      >
                        {item.checked && <Check className="w-3 h-3" />}
                      </div>
                      <span className="text-gray-700 flex-1 break-words">{item.name}</span>
                      <div className="flex items-center gap-[2px] flex-shrink-0 border border-gray-300 rounded px-1 py-[2px] bg-gray-50">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const active = (item.rating || 0) >= star
                          return (
                            <Star
                              key={`fuel-star-${index}-${star}`}
                              className={`w-3 h-3 ${active ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`}
                            />
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-[1px] ${
                          item.checked
                            ? "bg-[#C1272D] text-white"
                            : "border border-gray-300"
                        }`}
                      >
                        {item.checked && <Check className="w-3 h-3" />}
                      </div>
                      <span className="text-gray-700 flex-1 break-words">{item.name}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            {data.observacoesChecklist && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">Observacoes:</p>
                <p className="text-xs text-gray-700 mt-1">{data.observacoesChecklist}</p>
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-[#C1272D] uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
              Servicos a Realizar
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              {data.servicosRealizar}
            </p>
          </div>
        </div>
      </section>
      </div>

      <div
        className={`${dragClass} ${selectedClass("section-items")}`}
        style={getPositionStyle("section-items")}
        onPointerDown={(e) => startDrag("section-items", e)}
        onWheel={(e) => handleWheelResize("section-items", e)}
      >
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-[#C1272D] uppercase tracking-wide mb-3">
          Pecas e Servicos
        </h2>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th className="text-left py-2 px-3 font-semibold">Descricao</th>
                <th className="text-center py-2 px-3 font-semibold w-16">Qtd</th>
                <th className="text-right py-2 px-3 font-semibold w-28">Valor Unit.</th>
                <th className="text-right py-2 px-3 font-semibold w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.itens.map((item, index) => (
                <tr
                  key={index}
                  className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <td className="py-2 px-3 text-gray-700">{item.description}</td>
                  <td className="py-2 px-3 text-center text-gray-700">{item.quantity}</td>
                  <td className="py-2 px-3 text-right text-gray-700">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-gray-800">
                    {formatCurrency(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </div>

      <div
        className={`${dragClass} ${selectedClass("section-totals")}`}
        style={getPositionStyle("section-totals")}
        onPointerDown={(e) => startDrag("section-totals", e)}
        onWheel={(e) => handleWheelResize("section-totals", e)}
      >
      <section className="mb-6">
        <div className="flex justify-end">
          <div className="w-72 border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">{formatCurrency(data.subtotal)}</span>
            </div>
            <div className="bg-white px-4 py-2 flex justify-between text-sm border-t border-gray-100">
              <span className="text-gray-600">Desconto:</span>
              <span className="font-medium text-green-600">- {formatCurrency(data.desconto)}</span>
            </div>
            <div className="bg-[#C1272D] px-4 py-3 flex justify-between items-center">
              <span className="text-white font-semibold">TOTAL PAGO:</span>
              <span className="text-white text-xl font-bold">{formatCurrency(data.totalPago)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex-1" />
        </div>
      </section>
      </div>

      <div
        className={`${dragClass} ${selectedClass("section-signatures")}`}
        style={getPositionStyle("section-signatures")}
        onPointerDown={(e) => startDrag("section-signatures", e)}
        onWheel={(e) => handleWheelResize("section-signatures", e)}
      >
      <section className="mt-auto pt-8 signature-section">
        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="pt-2 mx-8">
              {data.signatureChecklist ? (
                <div className="h-16 mb-2 flex items-end justify-center">
                  <img
                    src={data.signatureChecklist}
                    alt="Assinatura do Checklist"
                    className="max-h-16 max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="h-16 mb-2" />
              )}
              <div className="border-t border-gray-400" />
              <p className="text-sm text-gray-600">Assinatura do Checklist</p>
              <p className="text-xs text-gray-400 mt-1">Responsavel pela inspecao</p>
            </div>
          </div>
          <div className="text-center">
            <div className="pt-2 mx-8">
              {data.signatureCliente ? (
                <div className="h-16 mb-2 flex items-end justify-center">
                  <img
                    src={data.signatureCliente}
                    alt="Assinatura do Cliente"
                    className="max-h-16 max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="h-16 mb-2" />
              )}
              <div className="border-t border-gray-400" />
              <p className="text-sm text-gray-600">Assinatura do Cliente</p>
              <p className="text-xs text-gray-400 mt-1">Ciente e de acordo.</p>
            </div>
          </div>
        </div>
      </section>
      </div>

      <div
        className={`${dragClass} ${selectedClass("section-footer")}`}
        style={getPositionStyle("section-footer")}
        onPointerDown={(e) => startDrag("section-footer", e)}
        onWheel={(e) => handleWheelResize("section-footer", e)}
      >
      <footer className="mt-8 pt-4 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-700">
          {VEHICLE_CAP === 'Carro'
            ? `Agradecemos a preferência! Seu ${VEHICLE_CAP.toLowerCase()} foi cuidado por especialistas apaixonados por motores.`
            : 'Agradecemos a preferência! Sua moto foi cuidada por especialistas apaixonados por duas rodas.'
          }
        </p>
      </footer>
      </div>

      {editable && (
        <div className="print:hidden mt-4 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-600">Item:</span>
            <select
              className="border rounded-md px-2 py-1 bg-white"
              value={selectedId || ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
            >
              <option value="">Selecione…</option>
              {sectionIds.map((id) => (
                <option key={id} value={id}>
                  {sectionLabels[id] || id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              className="px-2 py-1 border rounded-md bg-white disabled:opacity-50"
              disabled={!selectedId}
              onClick={() => selectedId && updateSize(selectedId, -0.05)}
            >
              A-
            </button>
            <span className="text-gray-600 min-w-[170px] text-center">
              {selectedId
                ? `Item: ${selectedId} | Escala: ${selectedSize.toFixed(2)}x`
                : "Selecione um item para ajustar tamanho"}
            </span>
            <button
              type="button"
              className="px-2 py-1 border rounded-md bg-white disabled:opacity-50"
              disabled={!selectedId}
              onClick={() => selectedId && updateSize(selectedId, 0.05)}
            >
              A+
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs w-full max-w-[360px]">
            <span className="text-gray-600">Tamanho</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.01}
              value={selectedId ? sizes[selectedId] || 1 : 1}
              disabled={!selectedId}
              className="flex-1"
              onChange={(e) => {
                if (!selectedId) return
                const value = Number(e.target.value)
                setExactSize(selectedId, value)
              }}
            />
            <span className="text-gray-600 w-10 text-right">
              {selectedId ? `${(sizes[selectedId] || 1).toFixed(2)}x` : "-"}
            </span>
          </div>

          <div className="text-xs text-gray-500 text-center">
            Modo arrastar ativo: clique e arraste os blocos. Para redimensionar, selecione o item e use A-/A+ (ou Ctrl + roda do mouse).
          </div>
        </div>
      )}
    </div>
  )
}
