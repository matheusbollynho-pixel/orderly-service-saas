/**
 * Ritmo dos envios em massa pra CLIENTES. O WhatsApp bloqueia número que
 * manda rajada (já aconteceu com a Bandara), então toda função de cron que
 * dispara pra cliente usa isto:
 *   - só seg-sáb em horário comercial (BRT);
 *   - pausa sorteada entre uma mensagem e outra (nunca intervalo redondo);
 *   - poucas mensagens por rodada; o que sobrar continua pendente no banco
 *     e sai na próxima rodada do cron.
 */

const PAUSA_MIN_S = 20
const PAUSA_MAX_S = 60
export const MAX_POR_RODADA = 5 // por loja
// Edge function no plano Pro morre em 400s; para de enviar bem antes.
const ORCAMENTO_MS = 320_000

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export function dentroDoHorarioComercial(horaInicio = 8, horaFim = 19): boolean {
  const brt = new Date(Date.now() - 3 * 3600000)
  const dia = brt.getUTCDay() // 0 = domingo
  const hora = brt.getUTCHours()
  return dia !== 0 && hora >= horaInicio && hora < horaFim
}

/**
 * Um por execução da função (vale pra todas as lojas da rodada).
 * Chamar `podeEnviar()` antes de CADA mensagem pra cliente: ela faz a pausa
 * (a partir da 2ª) e devolve false quando o tempo da rodada acabou.
 */
export function criarRitmo() {
  const inicio = Date.now()
  let jaEnviou = false
  return {
    async podeEnviar(): Promise<boolean> {
      if (jaEnviou) {
        const pausa = (PAUSA_MIN_S + Math.random() * (PAUSA_MAX_S - PAUSA_MIN_S)) * 1000
        if (Date.now() - inicio + pausa > ORCAMENTO_MS) return false
        await sleep(pausa)
      }
      jaEnviou = true
      return true
    },
  }
}

/**
 * Responde na hora e segue o trabalho em segundo plano: com as pausas a
 * rodada leva minutos, e o pg_net do cron desiste da conexão em segundos.
 */
export function emSegundoPlano(nome: string, trabalho: () => Promise<unknown>): Response {
  // @ts-ignore EdgeRuntime existe no runtime do Supabase
  EdgeRuntime.waitUntil(trabalho().catch(e => console.error(`${nome} error:`, e)))
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
}
