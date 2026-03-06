"use client"

import { NotaBalcao } from "@/components/nota-balcao"
import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

const mockData = {
  osId: "302DABF9",
  dataEmissao: "06/03/2026",
  cliente: {
    nome: "Joao Carlos Silva Santos",
    telefone: "(75) 99123-4567",
    endereco: "Rua das Flores, 123 - Centro, Paulo Afonso-BA",
  },
  veiculo: {
    marca: "Honda",
    modelo: "CG 160 Fan",
    ano: "2023",
    cor: "Vermelho",
    placa: "ABC-1D23",
  },
  checklist: [
    { name: "Freio Dianteiro", checked: true },
    { name: "Freio Traseiro", checked: true },
    { name: "Pneu Dianteiro", checked: true },
    { name: "Pneu Traseiro", checked: false },
    { name: "Farol", checked: true },
    { name: "Lanterna", checked: true },
    { name: "Seta Dianteira", checked: true },
    { name: "Seta Traseira", checked: true },
    { name: "Buzina", checked: true },
    { name: "Retrovisor Dir.", checked: true },
    { name: "Retrovisor Esq.", checked: true },
    { name: "Embreagem", checked: false },
    { name: "Acelerador", checked: true },
    { name: "Cavalete", checked: true },
    { name: "Nivel de Oleo", checked: true },
    { name: "Corrente", checked: false },
  ],
  observacoesChecklist: "TESTANDO OBSERVACAO DE CHECKLIST",
  servicosRealizar:
    "Troca de oleo do motor, regulagem de embreagem, limpeza do carburador e revisao geral dos freios.",
  itens: [
    {
      description: "Oleo Motor 10W30 1L",
      quantity: 1,
      unitPrice: 35.0,
      total: 35.0,
    },
    {
      description: "Filtro de Oleo",
      quantity: 1,
      unitPrice: 18.0,
      total: 18.0,
    },
    {
      description: "Mao de Obra - Troca de Oleo",
      quantity: 1,
      unitPrice: 25.0,
      total: 25.0,
    },
    {
      description: "Regulagem de Embreagem",
      quantity: 1,
      unitPrice: 15.0,
      total: 15.0,
    },
    {
      description: "Limpeza do Carburador",
      quantity: 1,
      unitPrice: 40.0,
      total: 40.0,
    },
    {
      description: "Revisao de Freios",
      quantity: 1,
      unitPrice: 30.0,
      total: 30.0,
    },
  ],
  subtotal: 163.0,
  desconto: 0.46,
  totalPago: 162.54,
  observacaoPagamento: "Pagamento via PIX",
  status: "CONCLUIDA",
}

export default function Page() {
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Barra de acoes - escondida na impressao */}
      <div className="print:hidden bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[210mm] mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-800">
            Pre-visualizacao da Nota de Balcao
          </h1>
          <Button onClick={handlePrint} className="gap-2 bg-[#C1272D] hover:bg-[#a02024] text-white">
            <Printer className="w-4 h-4" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Area de pre-visualizacao */}
      <div className="py-8 print:py-0">
        <NotaBalcao data={mockData} />
      </div>

      {/* Estilos de impressao */}
      <style jsx global>{`
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
        }
      `}</style>
    </div>
  )
}
