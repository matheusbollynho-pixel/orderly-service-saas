import jsPDF from 'jspdf';
import { ServiceOrder } from '@/types/service-order';
import LOGO_BASE64 from '@/assets/logo';

// Cores da Bandara Motos
const BANDARA_RED = { r: 193, g: 39, b: 45 }; // #C1272D
const DARK_GRAY = { r: 40, g: 40, b: 40 };
const LIGHT_GRAY = { r: 248, g: 248, b: 248 };
const BORDER_COLOR = { r: 220, g: 220, b: 220 };

// Cria o documento completo (todas as páginas) e devolve o jsPDF pronto + nome do arquivo
function buildOrderPDFDocument(order: ServiceOrder) {
  const doc = new jsPDF();
  const margin = 10;
  const pageWidth = 210;
  const pageHeight = 297;
  let yPosition = margin;

  // ============ CABEÇALHO DESTAQUE - LOGO + NÚMERO DA OS ============
  try {
    const logoWidth = 50;
    const logoHeight = 20;
    const logoX = margin;
    doc.addImage(LOGO_BASE64, 'PNG', logoX, yPosition, logoWidth, logoHeight);
    
    // Número da OS em destaque ao lado da logo
    doc.setTextColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(`No ${order.id.slice(0, 8).toUpperCase()}`, logoX + logoWidth + 8, yPosition + 12);
    
    // Status da OS no topo direito com background colorido
    const statusText = order.status === 'aberta' ? 'EM ABERTO' :
                       order.status === 'em_andamento' ? 'EM ANDAMENTO' :
                       order.status === 'concluida' ? 'CONCLUÍDA' : 'DESCONHECIDO';
    
    const statusColor = order.status === 'aberta' ? { r: 255, g: 152, b: 0 } :
                        order.status === 'em_andamento' ? { r: 33, g: 150, b: 243 } :
                        order.status === 'concluida' ? { r: 76, g: 175, b: 80 } : { r: 158, g: 158, b: 158 };
    
    doc.setFillColor(statusColor.r, statusColor.g, statusColor.b);
    doc.rect(pageWidth - margin - 45, yPosition + 3, 45 - margin, 10, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(statusText, pageWidth - margin - 22.5, yPosition + 8.5, { align: 'center' });
    
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.line(margin, yPosition + 22, pageWidth - margin, yPosition + 22);
    
    yPosition += 24;
  } catch (error) {
    console.error('Erro ao carregar logo:', error);
    doc.setTextColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('BANDARA MOTOS', pageWidth / 2, yPosition + 12, { align: 'center' });
    yPosition += 24;
  }

  // Dados da empresa e data (compacto)
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Rodovia BA 210, 913-A | Paulo Afonso-BA | (75) 98804-6356 | bandaramotos2@hotmail.com | @BandaraMotos', pageWidth / 2, yPosition, { align: 'center' });
  
  const dataFormatada = new Date(order.created_at).toLocaleDateString('pt-BR');
  doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Data: ${dataFormatada}`, pageWidth - margin - 5, yPosition, { align: 'right' });
  
  yPosition += 5;

  // ============ BLOCO: DADOS DO CLIENTE E MOTO (2 COLUNAS COM BORDAS) ============
  // Headers em vermelho
  const colWidth = (pageWidth - 2 * margin - 2) / 2;
  
  doc.setFillColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
  doc.rect(margin, yPosition, colWidth, 5, 'F');
  doc.rect(margin + colWidth + 1, yPosition, colWidth, 5, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('DADOS DO CLIENTE', margin + 2, yPosition + 3.2);
  doc.text('DADOS DO VEÍCULO', margin + colWidth + 3, yPosition + 3.2);
  
  yPosition += 6;

  // Conteúdos em colunas com bordas
  doc.setDrawColor(BORDER_COLOR.r, BORDER_COLOR.g, BORDER_COLOR.b);
  doc.setLineWidth(0.3);
  doc.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
  
  // Coluna 1: Cliente
  doc.rect(margin, yPosition, colWidth, 20, 'FD');
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Nome:', margin + 2, yPosition + 2.5);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
  doc.text(order.client_name, margin + 2, yPosition + 5.5);
  
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Telefone:', margin + 2, yPosition + 10);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
  doc.text(order.client_phone || 'N/A', margin + 2, yPosition + 12.5);
  
  if (order.client_address) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Endereço:', margin + 2, yPosition + 15);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
    const addressLines = doc.splitTextToSize(order.client_address, colWidth - 4);
    doc.text(addressLines[0], margin + 2, yPosition + 17);
  }

  // Coluna 2: Veículo
  const col2X = margin + colWidth + 1;
  doc.rect(col2X, yPosition, colWidth, 20, 'FD');
  
  // Extrair KM do equipment se existir
  const equipmentStr = order.equipment || '';
  const kmMatch = equipmentStr.match(/(\d[\d.,]*)\s*km/i);
  const kmValue = kmMatch ? kmMatch[1] : '';
  
  // Extrair placa do equipment (geralmente entre parênteses no final)
  const plateMatch = equipmentStr.match(/\(([^)]+)\)\s*$/);
  const plateValue = plateMatch ? plateMatch[1] : '';
  
  // Limpar equipment removendo KM e placa para pegar só marca/modelo
  const cleanEquipment = equipmentStr
    .replace(/\d[\d.,]*\s*km/i, '')
    .replace(/\([^)]+\)\s*$/, '')
    .trim();
  const equipParts = cleanEquipment.split(' ');
  
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Marca:', col2X + 2, yPosition + 2.5);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
  doc.text(equipParts[0] || 'N/A', col2X + 2, yPosition + 5.5);
  
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Modelo:', col2X + 2, yPosition + 10);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
  doc.text(equipParts.slice(1).join(' ') || 'N/A', col2X + 2, yPosition + 12.5);
  
  // Placa e KM na mesma linha
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Placa:', col2X + 2, yPosition + 15);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
  doc.text(plateValue || 'N/A', col2X + 2, yPosition + 17);
  
  if (kmValue) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('KM:', col2X + colWidth / 2, yPosition + 15);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
    doc.text(kmValue + ' km', col2X + colWidth / 2, yPosition + 17);
  }
  
  yPosition += 22;

  // ============ BLOCO: DESCRIÇÃO DOS SERVIÇOS ============
  doc.setFillColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
  doc.rect(margin, yPosition, pageWidth - 2 * margin, 7, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('SERVIÇOS A REALIZAR', margin + 3, yPosition + 4.5);
  yPosition += 9;

  doc.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
  const problemText = (order.problem_description || 'Sem descrição').replace(/\n*Retirada:.*$/s, '').trim();
  const problemLines = doc.splitTextToSize(problemText, pageWidth - 2 * margin - 6);
  const problemBoxHeight = problemLines.length * 5 + 4;
  doc.rect(margin, yPosition, pageWidth - 2 * margin, problemBoxHeight, 'F');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
  problemLines.forEach((line: string, index: number) => {
    if (yPosition > 260) {
      doc.addPage();
      yPosition = margin;
    }
    doc.text(line, margin + 3, yPosition + 3 + (index * 5));
  });

  yPosition += problemBoxHeight + 5;

  // ============ BLOCO: CHECKLIST DE INSPEÇÃO (GRID) ============
  if (order.checklist_items && order.checklist_items.length > 0) {
    if (yPosition > 220) {
      doc.addPage();
      yPosition = margin;
    }

    doc.setFillColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 6, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('CHECKLIST DE INSPEÇÃO', margin + 2, yPosition + 3.8);
    yPosition += 8;

    doc.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
    
    const orderMap: Record<string, number> = {
      'Chave da MOTO': 1,
      'Chave da Moto': 1,
      'Funcionamento do Motor': 2,
      'FUNCIONAMENTO': 2,
      'Elétrica': 3,
      'ELETRICA': 3,
      'NIVEL DE GASOLINA': 4,
      'NÍVEL DE GASOLINA': 4,
    };
    
    const normalizeLabel = (label: string) => {
      if (label === 'Chave da Moto') return 'Chave da MOTO';
      if (label === 'FUNCIONAMENTO') return 'Funcionamento do Motor';
      if (label === 'ELETRICA') return 'Elétrica';
      if (label === 'NIVEL DE GASOLINA') return 'NÍVEL DE GASOLINA';
      return label;
    };

    // Grid 2 colunas
    const gridBox = yPosition;
    const itemsPerCol = Math.ceil(order.checklist_items.length / 2);
    let col1Y = gridBox;
    let col2Y = gridBox;
    
    doc.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
    doc.rect(margin, gridBox, pageWidth - 2 * margin, itemsPerCol * 5 + 2, 'F');

    [...order.checklist_items]
      .sort((a, b) => (orderMap[a.label] ?? 999) - (orderMap[b.label] ?? 999))
      .forEach((item, idx) => {
        const isCol1 = idx < itemsPerCol;
        const currentY = isCol1 ? col1Y : col2Y;
        const xPos = isCol1 ? margin + 3 : margin + (pageWidth - 2 * margin) / 2 + 3;
        
        // Checkbox
        doc.setDrawColor(BORDER_COLOR.r, BORDER_COLOR.g, BORDER_COLOR.b);
        doc.setLineWidth(0.2);
        doc.rect(xPos, currentY + 0.5, 3, 3);
        
        if (item.completed) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
          doc.text('✓', xPos + 0.8, currentY + 2.2);
        }
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
        doc.text(normalizeLabel(item.label), xPos + 4.5, currentY + 2);
        
        if (isCol1) col1Y += 5;
        else col2Y += 5;
      });

    yPosition += itemsPerCol * 5 + 4;
  }

  // ============ BLOCO: PEÇAS E SERVIÇOS ============
  if (order.materials && order.materials.length > 0) {
    if (yPosition > 200) {
      doc.addPage();
      yPosition = margin;
    }

    doc.setFillColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 7, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('PEÇAS E SERVIÇOS', margin + 3, yPosition + 4.5);
    yPosition += 9;

    // Cabeçalho da tabela
    doc.setFillColor(BORDER_COLOR.r, BORDER_COLOR.g, BORDER_COLOR.b);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 6, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
    doc.text('Descrição', margin + 2, yPosition + 4);
    doc.text('Qtd', pageWidth - margin - 65, yPosition + 4);
    doc.text('Valor Unit.', pageWidth - margin - 45, yPosition + 4);
    doc.text('Total', pageWidth - margin - 20, yPosition + 4);
    yPosition += 8;

    // Linhas de materiais
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    let totalGeral = 0;
    
    order.materials.forEach((material, index) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = margin + 10;
      }

      // Alternância de fundo
      if (index % 2 === 0) {
        doc.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
        doc.rect(margin, yPosition - 3, pageWidth - 2 * margin, 5, 'F');
      }

      const quantidade = parseFloat(material.quantidade) || 0;
      const total = quantidade * material.valor;
      totalGeral += total;

      doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
      const descLines = doc.splitTextToSize(material.descricao, 90);
      doc.text(descLines[0], margin + 2, yPosition + 1);

      doc.text(material.quantidade, pageWidth - margin - 65, yPosition + 1);
      doc.text(`R$ ${material.valor.toFixed(2)}`, pageWidth - margin - 45, yPosition + 1);
      doc.text(`R$ ${total.toFixed(2)}`, pageWidth - margin - 20, yPosition + 1);
      
      yPosition += 5;
    });

    // Linha separadora e total
    yPosition += 1;
    doc.setDrawColor(BORDER_COLOR.r, BORDER_COLOR.g, BORDER_COLOR.b);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
    doc.text('TOTAL:', pageWidth - margin - 50, yPosition);
    doc.setTextColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
    doc.text(`R$ ${totalGeral.toFixed(2)}`, pageWidth - margin - 20, yPosition);
    yPosition += 8;
  }

  // ============ BLOCO: PAGAMENTOS REALIZADOS ============
  if (order.payments && order.payments.length > 0) {
    if (yPosition > 220) {
      doc.addPage();
      yPosition = margin;
    }

    doc.setFillColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
    doc.rect(margin, yPosition, pageWidth - 2 * margin, 7, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('PAGAMENTOS REALIZADOS', margin + 3, yPosition + 4.5);
    yPosition += 9;

    doc.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);

    let totalPago = 0;
    let totalDesconto = 0;

    order.payments.forEach((payment, index) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = margin + 10;
        doc.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
        doc.rect(margin, yPosition - 3, pageWidth - 2 * margin, 5, 'F');
      }

      // Alternância de fundo
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, yPosition - 2, pageWidth - 2 * margin, 4, 'F');
      }

      const metodoPagamento = payment.method === 'dinheiro' ? 'Dinheiro' :
                              payment.method === 'pix' ? 'PIX' :
                              payment.method === 'debito' ? 'Débito' :
                              payment.method === 'credito' ? 'Crédito' :
                              payment.method === 'cartao' ? 'Cartão' : payment.method;

      doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
      doc.setFont('helvetica', 'normal');
      doc.text(metodoPagamento, margin + 2, yPosition + 1);
      
      if (payment.discount_amount && payment.discount_amount > 0) {
        doc.setTextColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
        doc.setFont('helvetica', 'bold');
        doc.text(`-R$ ${payment.discount_amount.toFixed(2)}`, margin + 50, yPosition + 1);
        totalDesconto += payment.discount_amount;
      }
      
      doc.setTextColor(0, 100, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`R$ ${payment.amount.toFixed(2)}`, pageWidth - margin - 20, yPosition + 1);
      
      totalPago += payment.amount;
      yPosition += 4;

      if (payment.notes) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        const notesLines = doc.splitTextToSize(`Obs: ${payment.notes}`, pageWidth - 2 * margin - 10);
        notesLines.forEach((line: string) => {
          doc.text(line, margin + 5, yPosition);
          yPosition += 3;
        });
        yPosition += 1;
      }
    });

    // Linha separadora
    yPosition += 1;
    doc.setDrawColor(BORDER_COLOR.r, BORDER_COLOR.g, BORDER_COLOR.b);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 5;

    // Total Desconto
    if (totalDesconto > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
      doc.text('Desconto Total:', margin, yPosition);
      doc.setTextColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
      doc.text(`-R$ ${totalDesconto.toFixed(2)}`, pageWidth - margin - 20, yPosition);
      yPosition += 5;
    }

    // Total Pago com fórmula clara
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
    doc.text('Total Pago:', margin, yPosition);
    doc.setTextColor(0, 150, 0);
    doc.text(`R$ ${totalPago.toFixed(2)}`, pageWidth - margin - 20, yPosition);
    
    // Nota de fórmula financeira
    if (totalDesconto > 0) {
      doc.setFontSize(6);
      doc.setTextColor(150, 150, 150);
      doc.setFont('helvetica', 'normal');
      yPosition += 4;
      doc.text(`(Subtotal: R$ ${(totalPago + totalDesconto).toFixed(2)} - Desconto: R$ ${totalDesconto.toFixed(2)} = Total: R$ ${totalPago.toFixed(2)})`, margin, yPosition);
    }
  }

  // ============ BLOCO: ASSINATURAS ============
  if (yPosition > 180) {
    doc.addPage();
    yPosition = margin;
  }

  yPosition += 5;

  doc.setFillColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
  doc.rect(margin, yPosition, pageWidth - 2 * margin, 7, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('ASSINATURAS', margin + 3, yPosition + 4.5);
  yPosition += 9;

  doc.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
  doc.rect(margin, yPosition, pageWidth - 2 * margin, 65, 'F');

  // Assinatura do Checklist
  if (order.signature_data) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
    doc.text('Assinatura do Checklist:', margin + 3, yPosition + 3);
    
    try {
      const sigWidth = 40;
      const sigHeight = 20;
      doc.addImage(order.signature_data, 'PNG', margin + 3, yPosition + 5, sigWidth, sigHeight);
    } catch (error) {
      doc.setTextColor(150);
      doc.setFontSize(7);
      doc.text('[Assinatura do Checklist]', margin + 3, yPosition + 12);
    }
  }

  // Assinatura do Termo de Entrega
  if (order.delivery_signature_data) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
    doc.text('Assinatura do Termo de Entrega:', pageWidth / 2, yPosition + 3);
    
    try {
      const sigWidth = 40;
      const sigHeight = 20;
      doc.addImage(order.delivery_signature_data, 'PNG', pageWidth / 2, yPosition + 5, sigWidth, sigHeight);
    } catch (error) {
      doc.setTextColor(150);
      doc.setFontSize(7);
      doc.text('[Assinatura do Termo de Entrega]', pageWidth / 2, yPosition + 12);
    }
  }

  yPosition += 70;

  // ============ BLOCO: STATUS ============
  if (yPosition > 200) {
    doc.addPage();
    yPosition = margin;
  }

  yPosition += 3;

  doc.setFillColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
  doc.rect(margin, yPosition, pageWidth - 2 * margin, 7, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('STATUS E ASSINATURA', margin + 3, yPosition + 4.5);
  yPosition += 9;

  doc.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
  const statusBoxHeight = 35;
  doc.rect(margin, yPosition, pageWidth - 2 * margin, statusBoxHeight, 'F');

  // Status
  const statusText = order.status === 'aberta' ? 'ABERTA' :
                     order.status === 'em_andamento' ? 'EM ANDAMENTO' :
                     order.status === 'concluida' ? 'CONCLUÍDA' : 'DESCONHECIDO';

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BANDARA_RED.r, BANDARA_RED.g, BANDARA_RED.b);
  doc.text(`Status: ${statusText}`, margin + 3, yPosition + 5);

  // Linha para assinatura
  doc.setDrawColor(BORDER_COLOR.r, BORDER_COLOR.g, BORDER_COLOR.b);
  doc.setLineWidth(0.5);
  doc.line(margin + 3, yPosition + 20, margin + 60, yPosition + 20);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(DARK_GRAY.r, DARK_GRAY.g, DARK_GRAY.b);
  doc.text('Assinatura do Cliente', margin + 3, yPosition + 23);
  doc.setFontSize(7);
  doc.text(order.client_name, margin + 3, yPosition + 26);

  // Data
  doc.line(margin + 75, yPosition + 20, margin + 132, yPosition + 20);
  doc.setFontSize(8);
  doc.text('Data', margin + 75, yPosition + 23);
  doc.setFontSize(7);
  doc.text(dataFormatada, margin + 75, yPosition + 26);

  yPosition += statusBoxHeight;

  // ============ RODAPÉ ============
  yPosition += 5;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  
  // Rodapé customizado conforme solicitado
  const customFooter = 'Agradecemos a preferência! Sua moto foi cuidada por especialistas. Em caso de dúvidas, entre em contato: (75) 98804-6356. Este documento é válido como comprovante de serviço prestado.';
  const footerLines = doc.splitTextToSize(customFooter, pageWidth - (margin * 2) - 4);
  doc.text(footerLines, pageWidth / 2, yPosition + 2, { align: 'center' });
  
  // Aviso legal bem pequeno
  doc.setFontSize(5);
  doc.setTextColor(150, 150, 150);
  const abandonoNotice = 'Após 90 dias sem retirada e sem contato do proprietário, o veículo poderá ser considerado abandonado.';
  const abandonoLines = doc.splitTextToSize(abandonoNotice, pageWidth - (margin * 2) - 4);
  doc.text(abandonoLines, pageWidth / 2, yPosition + 12, { align: 'center' });

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
