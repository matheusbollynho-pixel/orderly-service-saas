import { useParams, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"
import { NotaBalcao } from "@/components/NotaBalcao"
import { Button } from "@/components/ui/button"
import { Printer, Download, MessageCircle, Loader2 } from "lucide-react"
import { generateOrderPDFFromNotaBalcao, downloadOrderPDFFromNotaBalcao } from "@/lib/pdfGeneratorNotaBalcao"
import { sendWhatsAppDocument } from "@/services/whatsappService"

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

export function PrintOrderPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [notaData, setNotaData] = useState<NotaBalcaoData | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [saveToken, setSaveToken] = useState(0)
  const [resetToken, setResetToken] = useState(0)
  const [saveMessage, setSaveMessage] = useState("")
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false)
  const [orderData, setOrderData] = useState<any>(null)
  const [autoAction, setAutoAction] = useState<'download' | 'whatsapp' | null>(null)

  useEffect(() => {
    const loadOrder = async () => {
      if (!id) return

      try {
        // Remover sufixos acidentais (ex.: ":1")
        const cleanId = id.split(":")[0].trim()
        console.log("Carregando OS:", cleanId)

        // A rota usa os 8 primeiros caracteres da OS; resolver para o UUID real
        let resolvedId = cleanId
        const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)

        if (!looksLikeUuid) {
          const { data: recentOrders, error: recentErr } = await supabase
            .from("service_orders")
            .select("id")
            .order("created_at", { ascending: false })
            .limit(300)

          if (recentErr) throw recentErr

          const found = (recentOrders || []).find((o: any) =>
            String(o.id || "").slice(0, 8).toUpperCase() === cleanId.toUpperCase()
          )

          if (!found?.id) {
            throw new Error("OS não encontrada")
          }

          resolvedId = found.id
        }

        const { data, error } = await supabase
          .from("service_orders")
          .select("*, checklist_items(*), materials(*), payments(*), motorcycles(*)")
          .eq("id", resolvedId)
          .single()

        if (error) throw error
        if (!data) {
          throw new Error('OS não encontrada')
        }

        const order = data

        // Formatar dados para NotaBalcao
        const formatCurrency = (value: any) => parseFloat(value) || 0

        const normalizeLabel = (value: string) =>
          String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()

        const checklistRaw = (order?.checklist_items || []) as any[]

        const observacaoChecklistItem = checklistRaw.find((item: any) =>
          normalizeLabel(item?.label || "").includes("OBSERVAC")
        )

        const observacoesChecklist = String(observacaoChecklistItem?.observations || "").trim()

        const checklistItems: ChecklistItem[] = checklistRaw
          .filter((item: any) => !normalizeLabel(item?.label || "").includes("OBSERVAC"))
          .map((item: any) => {
            const label = item?.label || "Item"
            const rating = Number(item?.rating || 0) || 0
            const isFuelLevel = normalizeLabel(label).includes("NIVEL DE GASOLINA")

            return {
              name: label,
              checked: isFuelLevel ? rating > 0 || !!item?.completed : !!item?.completed,
              rating,
            }
          })

        const serviceItems: ServiceItem[] = (order?.materials || []).map((item: any) => {
          const quantity = Number(item?.quantidade || 1)
          const unitPrice = formatCurrency(item?.valor)
          return {
            description: item?.descricao || "",
            quantity,
            unitPrice,
            total: unitPrice * quantity,
          }
        })

        const subtotalCalc = serviceItems.reduce((acc, item) => acc + item.total, 0)
        const descontoCalc = (order?.payments || []).reduce(
          (acc: number, p: any) => acc + formatCurrency(p?.discount_amount),
          0
        )
        const totalPagoCalc = (order?.payments || []).reduce(
          (acc: number, p: any) => acc + formatCurrency(p?.amount),
          0
        )

        const statusMap: Record<string, string> = {
          aberta: "PENDENTE",
          em_andamento: "EM_ANDAMENTO",
          concluida: "CONCLUIDA",
          cancelada: "CANCELADA",
        }

        const motorcycle = (order as any)?.motorcycles
        const equipment = String(order?.equipment || "")
        const rawProblemDescription = String(order?.problem_description || "")
        
        // Parse equipment string (ex: "Honda CG 125 1981 Vermelha (SEM) km")
        let parsedData = {
          marca: "---",
          modelo: "---",
          ano: "---",
          cor: "---",
          placa: "---",
          km: undefined as string | undefined
        }
        
        if (equipment) {
          // Extrair KM se existir
          const kmMatch = equipment.match(/(\d[\d.,]*)\s*km/i)
          if (kmMatch) {
            parsedData.km = kmMatch[1]
          }
          
          // Extrair placa entre parênteses
          const placaMatch = equipment.match(/\(([^)]+)\)/)
          if (placaMatch) {
            parsedData.placa = placaMatch[1]
          }
          
          // Remover km e placa para processar o resto
          let cleanEquipment = equipment
            .replace(/\d[\d.,]*\s*km/i, "")
            .replace(/\([^)]+\)/, "")
            .trim()
          
          // Separar por espaços
          const parts = cleanEquipment.split(/\s+/)
          
          if (parts.length > 0) {
            parsedData.marca = parts[0]
          }
          
          // Procurar ano (4 dígitos)
          const anoIndex = parts.findIndex(p => /^\d{4}$/.test(p))
          if (anoIndex !== -1) {
            parsedData.ano = parts[anoIndex]
            // Modelo é tudo entre marca e ano
            if (anoIndex > 1) {
              parsedData.modelo = parts.slice(1, anoIndex).join(" ")
            }
            // Cor é tudo depois do ano
            if (anoIndex < parts.length - 1) {
              parsedData.cor = parts.slice(anoIndex + 1).join(" ")
            }
          } else {
            // Sem ano identificado, modelo é tudo depois da marca
            parsedData.modelo = parts.slice(1).join(" ")
          }
        }

        // Fallback: tenta extrair KM da descrição do problema
        if (!parsedData.km) {
          const kmFromProblem = rawProblemDescription.match(/\bkm\s*[:\-]?\s*(\d[\d.,]*)|\b(\d[\d.,]*)\s*km\b/i)
          if (kmFromProblem) {
            parsedData.km = kmFromProblem[1] || kmFromProblem[2]
          }
        }
        
        const marca = motorcycle?.brand || parsedData.marca
        const modelo = motorcycle?.model || parsedData.modelo
        const ano = motorcycle?.year || parsedData.ano
        const cor = motorcycle?.color || parsedData.cor
        const placa = motorcycle?.license_plate || parsedData.placa
        const km = parsedData.km

        const retiradaMatch = rawProblemDescription.match(/Retirada:\s*([\s\S]*)$/i)
        const retiradaInfo = (retiradaMatch?.[1] || "Cliente").trim() || "Cliente"
        const servicosRealizar = rawProblemDescription
          .replace(/\n*\s*Retirada:\s*[\s\S]*$/i, "")
          .trim()

        const completedAt = (order as any)?.completed_at ||
          (order?.status === "concluida" ? order?.updated_at : null)

        setNotaData({
          osId: (order?.id || "").slice(0, 8).toUpperCase(),
          dataEntrada: new Date(order?.created_at || Date.now()).toLocaleDateString("pt-BR"),
          dataConclusao: completedAt
            ? new Date(completedAt).toLocaleDateString("pt-BR")
            : "---",
          cliente: {
            nome: order?.client_name || "---",
            telefone: order?.client_phone || "---",
            endereco: order?.client_address || "---",
          },
          veiculo: {
            marca,
            modelo,
            ano,
            cor,
            placa,
            km,
          },
          checklist: checklistItems,
          observacoesChecklist,
          servicosRealizar: servicosRealizar || rawProblemDescription,
          retiradaInfo,
          itens: serviceItems,
          subtotal: subtotalCalc,
          desconto: descontoCalc,
          totalPago: totalPagoCalc || Math.max(subtotalCalc - descontoCalc, 0),
          observacaoPagamento: (order?.payments || []).map((p: any) => p?.method).filter(Boolean).join(", "),
          status: statusMap[order?.status] || order?.status || "PENDENTE",
          signatureChecklist: (order as any)?.signature_data || null,
          signatureCliente: (order as any)?.delivery_signature_data || null,
        })
        
        // Salvar dados da order para download/WhatsApp
        setOrderData({
          id: order.id,
          client_name: order.client_name,
          client_phone: order.client_phone,
        })
      } catch (error) {
        console.error("Erro ao carregar OS:", error)
      } finally {
        setLoading(false)
      }
    }

    loadOrder()
  }, [id])

  // Detectar se veio de redirect e auto-executar ação
  useEffect(() => {
    if (!loading && notaData && location.state?.sendWhatsApp && !isSendingWhatsApp && autoAction !== 'whatsapp') {
      setAutoAction('whatsapp')
      setTimeout(() => {
        handleSendWhatsApp()
      }, 500)
    } else if (!loading && notaData && location.state?.autoDownload && !isDownloading && autoAction !== 'download') {
      setAutoAction('download')
      setTimeout(() => {
        handleDownloadPDF()
      }, 500)
    }
  }, [loading, notaData, location.state?.sendWhatsApp, location.state?.autoDownload, isSendingWhatsApp, isDownloading, autoAction])

  const handlePrint = () => {
    window.print()
  }

  const handleSaveLayout = () => {
    setSaveToken((prev) => prev + 1)
    setSaveMessage("Layout salvo com sucesso.")
    window.setTimeout(() => setSaveMessage(""), 2500)
  }

  const handleResetLayout = () => {
    setResetToken((prev) => prev + 1)
    setSaveMessage("Layout resetado.")
    window.setTimeout(() => setSaveMessage(""), 2500)
  }

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true)
      const fileName = `OS-${orderData?.id?.slice(0, 8)?.toUpperCase() || 'DOCUMENTO'}.pdf`
      await downloadOrderPDFFromNotaBalcao('nota-balcao-print-container', fileName)
      setSaveMessage("PDF baixado com sucesso!")
      window.setTimeout(() => setSaveMessage(""), 2500)
    } catch (error: any) {
      console.error('Erro ao baixar PDF:', error)
      alert('Erro ao gerar PDF. Tente novamente.')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleSendWhatsApp = async () => {
    try {
      if (!orderData?.client_phone) {
        alert('Telefone do cliente não encontrado.')
        return
      }

      setIsSendingWhatsApp(true)
      const fileName = `OS-${orderData?.id?.slice(0, 8)?.toUpperCase() || 'DOCUMENTO'}.pdf`
      const { base64 } = await generateOrderPDFFromNotaBalcao('nota-balcao-print-container', fileName)
      
      const cleanPhone = orderData.client_phone.replace(/\D/g, '')
      if (cleanPhone.length < 10 || cleanPhone.length > 11) {
        alert('Telefone do cliente inválido para WhatsApp.')
        return
      }

      await sendWhatsAppDocument({
        phone: cleanPhone,
        base64,
        fileName,
        caption: `Olá, ${orderData.client_name}! Sua Ordem de Serviço está pronta. Segue em anexo. Obrigado pela preferência!`,
      })

      setSaveMessage("PDF enviado via WhatsApp com sucesso!")
      window.setTimeout(() => setSaveMessage(""), 2500)
    } catch (error: any) {
      console.error('Erro ao enviar WhatsApp:', error)
      alert(error.message || 'Erro ao enviar PDF. Tente novamente.')
    } finally {
      setIsSendingWhatsApp(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">Carregando Ordem de Serviço...</div>
      </div>
    )
  }

  if (!notaData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">OS não encontrada</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Barra de ações - escondida na impressão */}
      <div className="print:hidden bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[210mm] mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-800">
            Pré-visualização da Nota de Balcão
          </h1>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setEditMode((prev) => !prev)}
              variant={editMode ? "destructive" : "outline"}
            >
              {editMode ? "Sair do arrastar" : "Modo arrastar"}
            </Button>

            <Button
              onClick={handleSaveLayout}
              variant="outline"
              disabled={!editMode}
            >
              Salvar layout
            </Button>

            <Button
              onClick={handleResetLayout}
              variant="outline"
            >
              Resetar layout
            </Button>

            <Button
              onClick={handleDownloadPDF}
              variant="outline"
              disabled={isDownloading}
              className="gap-2"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Baixar PDF
            </Button>

            <Button
              onClick={handleSendWhatsApp}
              variant="outline"
              disabled={isSendingWhatsApp}
              className="gap-2"
            >
              {isSendingWhatsApp ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
              WhatsApp
            </Button>

            <Button
              onClick={handlePrint}
              className="gap-2 bg-[#C1272D] hover:bg-[#a02024] text-white"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </Button>
          </div>
        </div>
        {saveMessage && (
          <div className="max-w-[210mm] mx-auto px-4 pb-2 text-xs text-green-700">
            {saveMessage}
          </div>
        )}
      </div>

      {/* Área de pré-visualização */}
      <div className="py-8 print:py-0">
        <div id="nota-balcao-print-container">
          <NotaBalcao
            data={notaData}
            editable={editMode}
            saveToken={saveToken}
            resetToken={resetToken}
            layoutStorageKey="nota-balcao-layout-v1"
          />
        </div>
      </div>

      {/* Estilos de impressão */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }

          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print\\:hidden {
            display: none !important;
          }

          .print\\:py-0 {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }

          .print\\:p-6 {
            padding: 1.5rem !important;
          }

          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .signature-section {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }        }
      `}</style>
    </div>
  )
}
