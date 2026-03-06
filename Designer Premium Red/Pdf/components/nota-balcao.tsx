"use client"

import { Check, Phone, MapPin, Instagram } from "lucide-react"

interface ChecklistItem {
  name: string
  checked: boolean
}

interface ServiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

interface NotaBalcaoData {
  osId: string
  dataEmissao: string
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
  }
  checklist: ChecklistItem[]
  observacoesChecklist: string
  servicosRealizar: string
  itens: ServiceItem[]
  subtotal: number
  desconto: number
  totalPago: number
  observacaoPagamento: string
  status: string
}

interface NotaBalcaoProps {
  data: NotaBalcaoData
}

export function NotaBalcao({ data }: NotaBalcaoProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value)
  }

  return (
    <div className="w-[210mm] min-h-[297mm] bg-white mx-auto p-8 font-sans text-gray-800 print:p-6 print:shadow-none shadow-lg">
      <header className="border-b-2 border-[#C1272D] pb-4 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[#C1272D] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">BM</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#C1272D] tracking-tight">
                BANDARA MOTOS
              </h1>
              <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                <p className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Rodovia BA 210, n.o 913-A, BTN 02, Paulo Afonso-BA
                </p>
                <p className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  (75) 98804-6356
                </p>
                <p className="flex items-center gap-1">
                  <Instagram className="w-3 h-3" />
                  @BandaraMotos
                </p>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="bg-gray-100 px-4 py-2 rounded-lg">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Ordem de Servico</p>
              <p className="text-lg font-bold text-[#C1272D]">No {data.osId}</p>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              <span className="font-medium">Data:</span> {data.dataEmissao}
            </p>
          </div>
        </div>
      </header>

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
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-[#C1272D] uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
            Dados do Veiculo
          </h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p>
              <span className="text-gray-500">Marca:</span>{" "}
              <span className="font-medium">{data.veiculo.marca}</span>
            </p>
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
            <p className="col-span-2">
              <span className="text-gray-500">Placa:</span>{" "}
              <span className="font-bold text-gray-900">{data.veiculo.placa}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-[#C1272D] uppercase tracking-wide mb-3 border-b border-gray-100 pb-2">
              Checklist de Inspecao
            </h2>
            <div className="grid grid-cols-2 gap-1">
              {data.checklist.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                      item.checked
                        ? "bg-[#C1272D] text-white"
                        : "border border-gray-300"
                    }`}
                  >
                    {item.checked && <Check className="w-3 h-3" />}
                  </div>
                  <span className="text-gray-700 truncate">{item.name}</span>
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
          <div className="flex-1">
            {data.observacaoPagamento && (
              <div className="text-sm">
                <span className="text-gray-500">Observacao de Pagamento:</span>{" "}
                <span className="text-gray-700">{data.observacaoPagamento}</span>
              </div>
            )}
          </div>
          <div
            className={`px-4 py-1 rounded-full text-sm font-semibold ${
              data.status === "CONCLUIDA"
                ? "bg-green-100 text-green-700"
                : data.status === "PENDENTE"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {data.status}
          </div>
        </div>
      </section>

      <section className="mt-auto pt-8">
        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 mx-8">
              <p className="text-sm text-gray-600">Assinatura do Checklist</p>
              <p className="text-xs text-gray-400 mt-1">Responsavel pela inspecao</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 mx-8">
              <p className="text-sm text-gray-600">Assinatura do Cliente</p>
              <p className="text-xs text-gray-400 mt-1">Ciente e de acordo</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-8 pt-4 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-400">
          Bandara Motos - Qualidade e confianca em servicos automotivos
        </p>
      </footer>
    </div>
  )
}
