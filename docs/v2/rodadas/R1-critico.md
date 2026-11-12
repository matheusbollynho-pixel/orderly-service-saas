# Rodada 1: Crítico-cliente

**Nota 6,5/10, veredito AJUSTAR**

## Toques nos fluxos, hoje × proposta
- **Abrir OS de cliente que já veio:** hoje uns 7 toques pelo Express, que ainda obriga marca, ano e cor (`ExpressCadastroPage.tsx` l.174-186). Na proposta, uns 6: Mecânico e Atendente são 2 listas que o "4 a 5" do designer não conta. A busca única por placa está aprovada.
- **Receber na OS:** cai de uns 5 toques para 2. Aprovado. Faltam três ajustes:
  - "Receber" no Início não diz de quem é o pagamento. Precisa abrir uma lista de OS prontas, notas abertas e fiados.
  - No pagamento dividido, o painel tem que continuar aberto mostrando "Falta R$ 180".
  - Trocar "Metade" por "Dividir".
- **Vender peça:** a proposta tira o atalho do Caixa e não põe nada no lugar. Precisa de **venda rápida** no Balcão: cliente opcional, com "Consumidor" como padrão.
- **Fiado:** manter a palavra **Fiado**, não "A receber".
- **Caixa do dia no Início:** a loja usa um login só, então "só o dono" não protege nada. Precisa de um **olho para esconder valores**. Pelo mesmo motivo, "Reabrir OS só o dono" vira enfeite.
- **OS antiga pela placa:** custa 1 toque a mais. A busca tem que achar placa **com e sem hífen**.
- **Avisar moto pronta:** a proposta não cobre isso. Ao passar para "Pronta", a tela deve mostrar "Cliente será avisado às 14h" e um botão [Avisar agora].

## O que se perdeu ou ficou mais difícil
- **KM sumiu.** Hoje vai no PDF (`OrderForm.tsx`, `PrintOrderPage.tsx`). Tem que ficar perto da placa.
- **O mecânico cai no Início.** Para ele, deveria abrir direto no Quadro, com um botão grande "Próxima etapa" (sem arrastar).
- **Encomendas a 3 toques:** a Carla usa no balcão, com o cliente na frente.
- A barra fixa de 5 botões está aprovada.

## Decisões do dono
- **Modo claro:** padrão em loja nova e no celular. Na Bandara, perguntar uma vez em cada aparelho e guardar a escolha. O PC do balcão provavelmente continua no escuro.
- **CPF não obrigatório:** aprovado. Pedir só ao lançar fiado ou gerar link de cobrança.

## Vale a troca?
Sim, se antes de mexer na Bandara entrarem: KM, aviso de moto pronta, venda rápida, a palavra "Fiado", o olho no caixa e o "Receber" com lista.
