# Parte 10: Oficina, avaliação do Crítico-cliente

**Nota 7/10. Veredito: AJUSTAR.**

## Toques
| Ação | Hoje | Na proposta |
|---|---|---|
| Ver a oficina | ~ | 1 |
| Começar sem mecânico | ~7 | 2 |
| Marcar pronta e avisar | 3 | 2 |
| Pagar à vista | >10 | ~4 (com o valor preenchido e "quem recebe" já marcado) |
| Desfazer | ~ | 1 nos 5 segundos, 3 depois |
| Achar OS antiga | ~ | busca |

## Ajustes
1. **Os mesmos botões grandes também DENTRO da OS.** A loja vive dentro da OS: sem isso, não usa a tela "Na oficina" e ainda fica mais lenta.
2. **Aviso de pronta:** só manda mensagem pelo botão da janela, nunca sozinho. O automático pula OS já avisada ou desfeita.
3. **"Quem está recebendo":** já vem marcado com o último que recebeu, porque a loja usa um login só.
4. **Desfazer de 5 segundos NÃO vale para Entregar.** Corrigir pagamento é feito dentro da OS; reabrir continua protegido.
5. **Express:** definir se assina na entrega. Hoje não assina, e a marca fica no texto da OS.
6. **asaas-webhook:497:** entra no escopo da decisão 3.
7. **Fiado:** hoje marca Entregue sem assinatura (~629). A proposta corrige. Aprovado.

## Decisões do dono
1. **Juntar Ordens e Quadro:** sim.
2. **Entregar só quitado ou como fiado:** sim.
3. **Pago antes de Pronta não vira Entregue:** sim, e o webhook do Asaas muda junto.

**Vale a troca?** Sim, mas só se o botão de 1 toque também estiver dentro da OS.
