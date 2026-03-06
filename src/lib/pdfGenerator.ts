import jsPDF from 'jspdf';
import { ServiceOrder } from '@/types/service-order';
import LOGO_BASE64 from '@/assets/logo';

// Cria o documento completo (todas as páginas) e devolve o jsPDF pronto + nome do arquivo
function buildOrderPDFDocument(order: ServiceOrder) {
  const doc = new jsPDF();
  const margin = 15;
  const pageWidth = 210;
  const pageHeight = 297;
  let yPosition = margin;

  // ============ CABEÇALHO BANDARA MOTOS ============
  try {
    const logoWidth = 50;
    const logoHeight = 22;
    const logoX = (pageWidth - logoWidth) / 2;
    doc.addImage(LOGO_BASE64, 'PNG', logoX, yPosition, logoWidth, logoHeight);
    yPosition += logoHeight + 3;
  } catch (error) {
    console.error('Erro ao carregar logo:', error);
    doc.setTextColor(185, 28, 46);
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text('BANDARA MOTOS', pageWidth / 2, yPosition + 15, { align: 'center' });
    yPosition += 30;
  }

  // Dados da empresa
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('Rodovia BA 210, n.º 913-A, BTN 02 (ao lado da pista)', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 4;
  doc.text('Paulo Afonso-BA – Cel.: (75) 98804-6356 / bandaramotos2@hotmail.com', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 4;
  doc.text('Instagram: @BandaraMotos', pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 6;

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 8;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ORDEM DE SERVICO', margin, yPosition);

  doc.setFontSize(12);
  doc.text(`Nº ${order.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, yPosition, { align: 'right' });

  const dataFormatada = new Date(order.created_at).toLocaleDateString('pt-BR');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  yPosition += 6;
  doc.text(`Data: ${dataFormatada}`, pageWidth - margin, yPosition, { align: 'right' });

  yPosition += 20;

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
      doc.text(line, margin + 20, yPosition + i * 5);
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
  const equipmentLines = doc.splitTextToSize(order.equipment || 'N/A', pageWidth - 2 * margin - 5);
  equipmentLines.forEach((line: string) => {
    doc.text(line, margin, yPosition);
    yPosition += 5;
  });

  yPosition += 10;

  // ============ DESCRICAO DOS SERVICOS ============
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('SERVICOS A REALIZAR', margin + 2, yPosition + 5.5);
  yPosition += 12;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const problemText = (order.problem_description || 'Sem descricao').replace(/\n*Retirada:.*$/s, '').trim();
  const problemLines = doc.splitTextToSize(problemText, pageWidth - 2 * margin - 5);
  problemLines.forEach((line: string) => {
    if (yPosition > 260) {
      doc.addPage();
      yPosition = margin;
    }
    doc.text(line, margin, yPosition);
    yPosition += 5;
  });

  yPosition += 10;

  // ============ CHECKLIST DE INSPEÇÃO ============
  if (order.checklist_items && order.checklist_items.length > 0) {
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 8, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('CHECKLIST DE INSPEÇÃO', margin + 2, yPosition + 5.5);
    yPosition += 12;

    const orderMap: Record<string, number> = {
      'Chave da MOTO': 1,
      'Chave da Moto': 1,
      'Funcionamento do Motor': 2,
      'FUNCIONAMENTO': 2,
      'Elétrica': 3,
      'ELETRICA': 3,
      'NIVEL DE GASOLINA': 4,
      'NÍVEL DE GASOLINA': 4,
      'Observações': 5,
    };
    const normalizeLabel = (label: string) => {
      if (label === 'Chave da Moto') return 'Chave da MOTO';
      if (label === 'FUNCIONAMENTO') return 'Funcionamento do Motor';
      if (label === 'ELETRICA') return 'Elétrica';
      if (label === 'NIVEL DE GASOLINA') return 'NÍVEL DE GASOLINA';
      return label;
    };

    doc.setFontSize(9);
    [...order.checklist_items]
      .sort((a, b) => (orderMap[a.label] ?? 999) - (orderMap[b.label] ?? 999))
      .forEach((item) => {
        if (yPosition > 260) {
          doc.addPage();
          yPosition = margin;
        }

        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.rect(margin, yPosition - 3, 4, 4);

        if (item.completed) {
          doc.setFont('helvetica', 'bold');
          doc.text('X', margin + 1.2, yPosition + 0.5);
        }

        doc.setFont('helvetica', 'normal');
        doc.text(normalizeLabel(item.label), margin + 7, yPosition);

        if (item.rating) {
          doc.setFont('helvetica', 'bold');
          doc.text(`(${item.rating}/5)`, margin + 70, yPosition);
        }

        yPosition += 6;

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

  // ============ PECAS E SERVICOS (ORCAMENTO) ============
  if (order.materials && order.materials.length > 0) {
    if (yPosition > 200) {
      doc.addPage();
      yPosition = margin;
    }

    doc.setFillColor(255, 220, 0);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 10, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('*** PECAS E SERVICOS ***', margin + 2, yPosition + 6.5);
    yPosition += 12;

    doc.setFillColor(220, 220, 220);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 7, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Descricao', margin + 2, yPosition + 5);
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

      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, yPosition - 4, pageWidth - 2 * margin, 6, 'F');
      }

      const quantidade = parseFloat(material.quantidade) || 0;
      const total = quantidade * material.valor;
      totalGeral += total;

      const descLines = doc.splitTextToSize(material.descricao, 100);
      doc.text(descLines[0], margin + 2, yPosition);

      doc.text(material.quantidade, pageWidth - margin - 70, yPosition);
      doc.text(`R$ ${material.valor.toFixed(2)}`, pageWidth - margin - 50, yPosition);
      doc.text(`R$ ${total.toFixed(2)}`, pageWidth - margin - 25, yPosition);
      yPosition += 6;
    });

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
  if (yPosition > 200) {
    doc.addPage();
    yPosition = margin;
  }

  yPosition += 10;

  const statusText = order.status === 'aberta' ? 'ABERTA' :
                     order.status === 'em_andamento' ? 'EM ANDAMENTO' :
                     order.status === 'concluida' ? 'CONCLUIDA' : 'DESCONHECIDO';

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Status: ${statusText}`, margin, yPosition);

  yPosition += 10;

  doc.setLineWidth(0.3);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;

  // ============ ASSINATURA ============
  const assinaturaY = 260;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const clienteX = pageWidth / 2 - 40;
  doc.line(clienteX, assinaturaY, clienteX + 80, assinaturaY);
  doc.text('Assinatura do Cliente', clienteX, assinaturaY + 5);
  doc.setFontSize(8);
  doc.text(`Nome: ${order.client_name}`, clienteX, assinaturaY + 10);
  doc.text('Data: ____/____/______', clienteX, assinaturaY + 15);

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Este documento é válido como comprovante de serviço prestado.', pageWidth / 2, 285, { align: 'center' });
  doc.text('Bandara Motos - Manutenção e Reparos Especializados', pageWidth / 2, 290, { align: 'center' });

  const fileName = `OS_Bandara_${order.id.slice(0, 8).toUpperCase()}_${order.client_name.replace(/\s+/g, '_')}.pdf`;
  return { doc, fileName };
}

export function generateOrderPDF(order: ServiceOrder) {
  const { doc, fileName } = buildOrderPDFDocument(order);
  doc.save(fileName);
}

// Gera o PDF completo e devolve em base64 para envio (ex.: WhatsApp documento)
export function generateOrderPDFBase64(order: ServiceOrder) {
  const { doc, fileName } = buildOrderPDFDocument(order);
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split(',')[1];
  return { fileName, base64 };
}
