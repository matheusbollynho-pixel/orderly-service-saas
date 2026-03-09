import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"

export function DebugOrderPage() {
  const { id } = useParams<{ id: string }>()
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const test = async () => {
      console.log("ID recebido:", id)
      console.log("ID type:", typeof id)
      console.log("ID length:", id?.length)

      try {
        // Teste 1: Query simples sem filtro
        const { data: allData, error: allError } = await supabase
          .from("service_orders")
          .select("id, client_name")
          .limit(1)

        console.log("All data:", allData)
        console.log("All error:", allError)

        if (id) {
          const cleanId = id.split(":")[0]
          console.log("Clean ID:", cleanId)

          // Teste 2: Query com filtro
          const { data, error: err } = await supabase
            .from("service_orders")
            .select("*")
            .eq("id", cleanId)
            .single()

          console.log("Filtered data:", data)
          console.log("Filtered error:", err)

          setResult({ allData, data, cleanId })
          setError(err)
        }
      } catch (e) {
        console.error("Exception:", e)
        setError(e)
      }
    }

    test()
  }, [id])

  return (
    <div className="p-8 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Debug Page</h1>
      <div className="bg-gray-100 p-4 rounded mb-4">
        <p className="font-bold">ID Param: {id}</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 p-4 rounded mb-4">
          <p className="font-bold text-red-700">Erro:</p>
          <pre className="text-sm text-red-600">{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      {result && (
        <div className="bg-blue-100 border border-blue-400 p-4 rounded">
          <p className="font-bold text-blue-700">Resultado:</p>
          <pre className="text-sm">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
