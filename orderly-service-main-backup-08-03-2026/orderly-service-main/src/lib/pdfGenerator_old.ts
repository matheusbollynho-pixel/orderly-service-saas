import jsPDF from 'jspdf';
import { ServiceOrder } from '@/types/service-order';

export function generateOrderPDF(order: ServiceOrder) {
  const doc = new jsPDF();
  
  // Configurações
  const margin = 15;
  const pageWidth = 210;
  const pageHeight = 297;
  let yPosition = margin;
  
  // ============ CABEÇALHO BANDARA MOTOS ============
  // Logo e nome da empresa (espaço reservado para logo)
  doc.setFillColor(230, 230, 230);
  doc.rect(margin, yPosition, 50, 25, 'F');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('LOGO', margin + 20, yPosition + 13, { align: 'center' });
  
  // Nome e dados da empresa
  doc.setTextColor(0);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('BANDARA MOTOS', pageWidth - margin, yPosition + 8, { align: 'right' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Manutenção e Reparos', pageWidth - margin, yPosition + 15, { align: 'right' });
  doc.text('Tel: (XX) XXXX-XXXX', pageWidth - margin, yPosition + 20, { align: 'right' });
  
  yPosition += 30;
  
  // Linha divisória
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 8;
  
  // Título e número da OS
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ORDEM DE SERVIÇO', margin, yPosition);
  
  doc.setFontSize(12);
  doc.text(`Nº ${order.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, yPosition, { align: 'right' });
  
  const dataFormatada = new Date(order.created_at).toLocaleDateString('pt-BR');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  yPosition += 6;
  doc.text(`Data: ${dataFormatada}`, pageWidth - margin, yPosition, { align: 'right' });
  
  yPosition += 10;
  yPosition += 10;
  
  // ============ DADOS DO CLIENTE ============
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO CLIENTE', margin + 2, yPosition + 5.5);
  yPosition += 12;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Nome:', margin, yPosition);
  doc.setFont('helvetica', 'bold');
  doc.text(order.client_name, margin + 20, yPosition);
  yPosition += 6;
  
  if (order.client_phone) {
    doc.setFont('helvetica', 'normal');
    doc.text('Telefone:', margin, yPosition);
    doc.setFont('helvetica', 'bold');
    doc.text(order.client_phone, margin + 20, yPosition);
    yPosition += 6;
  }
  
  if (order.client_address) {
    doc.setFont('helvetica', 'normal');
    doc.text('Endereço:', margin, yPosition);
    doc.setFont('helvetica', 'bold');
    const addressLines = doc.splitTextToSize(order.client_address, pageWidth - margin - 30);
    addressLines.forEach((line: string, i: number) => {
      doc.text(line, margin + 20, yPosition + (i * 5));
    });
    yPosition += 6 + (addressLines.length - 1) * 5;
  }
  
  yPosition += 5;
  
  // ============ DADOS DO VEÍCULO/MOTO ============
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO VEÍCULO', margin + 2, yPosition + 5.5);
  yPosition += 12;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  // Extrair informações do equipment (que contém placa, modelo, etc)
  const equipmentLines = doc.splitTextToSize(order.equipment || 'N/A', pageWidth - 2 * margin - 5);
  equipmentLines.forEach((line: string) => {
    doc.text(line, margin, yPosition);
    yPosition += 5;
  });
  
  yPosition += 5;
  yPosition += 5;
  
  // ============ DESCRIÇÃO DOS SERVIÇOS ============
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('SERVIÇOS A REALIZAR', margin + 2, yPosition + 5.5);
  yPosition += 12;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const problemLines = doc.splitTextToSize(order.problem_description || 'Sem descrição', pageWidth - 2 * margin - 5);
  problemLines.forEach((line: string) => {
    if (yPosition > 260) {
      doc.addPage();
      yPosition = margin;
    }
    doc.text(line, margin, yPosition);
    yPosition += 5;
  });
  
  yPosition += 5;
  yPosition += 5;
  
  // ============ CHECKLIST DE INSPEÇÃO ============
  if (order.checklist_items && order.checklist_items.length > 0) {
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('CHECKLIST DE INSPEÇÃO', margin + 2, yPosition + 5.5);
    yPosition += 12;
    
    doc.setFontSize(9);
    order.checklist_items.forEach((item) => {
      if (yPosition > 260) {
        doc.addPage();
        yPosition = margin;
      }
      
      // Checkbox
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.rect(margin, yPosition - 3, 4, 4);
      
      if (item.completed) {
        doc.setFont('helvetica', 'bold');
        doc.text('✓', margin + 0.5, yPosition + 0.5);
      }
      
      // Label
      doc.setFont('helvetica', 'normal');
      doc.text(item.label, margin + 7, yPosition);
      
      // Rating (se houver)
      if (item.rating) {
        doc.setFont('helvetica', 'bold');
        doc.text(`(${item.rating}/5)`, margin + 70, yPosition);
      }
      
      yPosition += 6;
      
      // Observações (se houver)
      if (item.observations) {
        doc.setFontSize(8);
        doc.setTextColor(80);
        const obsLines = doc.splitTextToSize(`Obs: ${item.observations}`, pageWidth - 2 * margin - 10);
        obsLines.forEach((line: string) => {
          doc.text(line, margin + 7, yPosition);
          yPosition += 4;
        });
        doc.setTextColor(0);
        doc.setFontSize(9);
        yPosition += 2;
      }
    });
    
    yPosition += 5;
  }
  
  // ============ MATERIAIS E VALORES (ORÇAMENTO) ============
  if (order.materials && order.materials.length > 0) {
    if (yPosition > 200) {
      doc.addPage();
      yPosition = margin;
    }
    
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('MATERIAIS E SERVIÇOS EXECUTADOS', margin + 2, yPosition + 5.5);
    yPosition += 12;
    
    // Cabeçalho da tabela
    doc.setFillColor(220, 220, 220);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 7, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Descrição', margin + 2, yPosition + 5);
    doc.text('Qtd', pageWidth - margin - 70, yPosition + 5);
    doc.text('Valor Unit.', pageWidth - margin - 50, yPosition + 5);
    doc.text('Total', pageWidth - margin - 25, yPosition + 5);
    yPosition += 9;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    let totalGeral = 0;
    order.materials.forEach((material, index) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = margin + 10;
      }
      
      // Linha zebrada
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, yPosition - 4, pageWidth - 2 * margin, 6, 'F');
      }
      
      const quantidade = parseFloat(material.quantidade) || 0;
      const total = quantidade * material.valor;
      totalGeral += total;
      
      // Descrição com quebra se necessário
      const descLines = doc.splitTextToSize(material.descricao, 100);
      doc.text(descLines[0], margin + 2, yPosition);
      
      doc.text(material.quantidade, pageWidth - margin - 70, yPosition);
      doc.text(`R$ ${material.valor.toFixed(2)}`, pageWidth - margin - 50, yPosition);
      doc.text(`R$ ${total.toFixed(2)}`, pageWidth - margin - 25, yPosition);
      yPosition += 6;
    });
    
    // Linha de total
    yPosition += 2;
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 6;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL:', pageWidth - margin - 50, yPosition);
    doc.text(`R$ ${totalGeral.toFixed(2)}`, pageWidth - margin - 25, yPosition);
    yPosition += 10;
  }
  
  // ============ STATUS E RODAPÉ ============
  // Garantir espaço no final da página para assinaturas
  if (yPosition > 240) {
    doc.addPage();
    yPosition = margin;
  }
  
  yPosition += 5;
  
  // Status
  const statusText = order.status === 'aberta' ? 'ABERTA' : 
                     order.status === 'em_andamento' ? 'EM ANDAMENTO' :
                     order.status === 'concluida' ? 'CONCLUÍDA' : order.status.toUpperCase();
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Status: ${statusText}`, margin, yPosition);
  
  yPosition += 10;
  doc.setLineWidth(0.3);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;
  
  // ============ ASSINATURAS ============
  const assinaturaY = 260;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  // Cliente
  const clienteX = margin;
  doc.line(clienteX, assinaturaY, clienteX + 80, assinaturaY);
  doc.text('Assinatura do Cliente', clienteX, assinaturaY + 5);
  doc.setFontSize(8);
  doc.text(`Nome: ${order.client_name}`, clienteX, assinaturaY + 10);
  doc.text(`Data: ____/____/______`, clienteX, assinaturaY + 15);
  
  // Técnico
  const tecnicoX = pageWidth - margin - 80;
  doc.line(tecnicoX, assinaturaY, tecnicoX + 80, assinaturaY);
  doc.setFontSize(10);
  doc.text('Assinatura do Técnico', tecnicoX, assinaturaY + 5);
  doc.setFontSize(8);
  doc.text('Nome: ________________________', tecnicoX, assinaturaY + 10);
  doc.text(`Data: ____/____/______`, tecnicoX, assinaturaY + 15);
  
  // Rodapé
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Este documento é válido como comprovante de serviço prestado.', pageWidth / 2, 285, { align: 'center' });
  doc.text('Bandara Motos - Manutenção e Reparos Especializados', pageWidth / 2, 290, { align: 'center' });
  
  // Download
  const fileName = `OS_Bandara_${order.id.slice(0, 8).toUpperCase()}_${order.client_name.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}
