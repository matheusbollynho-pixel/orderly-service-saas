import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { ServiceOrder } from '@/types/service-order';

/**
 * Gera PDF a partir do componente NotaBalcao renderizado
 * Captura o HTML e converte em imagem, depois em PDF
 */
export async function generateOrderPDFFromNotaBalcao(
  elementId: string,
  fileName: string = 'ordem-servico.pdf'
): Promise<{ fileName: string; base64: string }> {
  try {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Elemento com ID "${elementId}" não encontrado`);
    }

    // Capturar elemento como canvas
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // Criar PDF a partir do canvas
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    // Adicionar imagem ao PDF, criando múltiplas páginas se necessário
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Gerar base64
    const base64 = pdf.output('datauristring').split(',')[1];

    return {
      fileName,
      base64,
    };
  } catch (error) {
    console.error('Erro ao gerar PDF do NotaBalcao:', error);
    throw new Error('Falha ao gerar PDF. Tente novamente.');
  }
}

/**
 * Faz download do PDF gerado a partir do NotaBalcao
 */
export async function downloadOrderPDFFromNotaBalcao(
  elementId: string,
  fileName: string = 'ordem-servico.pdf'
): Promise<void> {
  try {
    const { fileName: finalName, base64 } = await generateOrderPDFFromNotaBalcao(
      elementId,
      fileName
    );

    // Criar link de download
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${base64}`;
    link.download = finalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Erro ao fazer download:', error);
    throw error;
  }
}
