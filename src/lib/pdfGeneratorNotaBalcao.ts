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
    console.log(`[pdfGenerator] Procurando elemento com ID: ${elementId}`);
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`[pdfGenerator] Elemento não encontrado: ${elementId}`);
      throw new Error(`Elemento com ID "${elementId}" não encontrado`);
    }

    console.log('[pdfGenerator] Elemento encontrado, iniciando html2canvas...');
    // Capturar elemento como canvas
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    console.log('[pdfGenerator] html2canvas concluído com sucesso');

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
    console.log(`[pdfGenerator] PDF gerado com sucesso. Base64 length: ${base64.length}`);

    return {
      fileName,
      base64,
    };
  } catch (error) {
    console.error('[pdfGenerator] Erro ao gerar PDF do NotaBalcao:', error);
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
    console.log('[pdfGenerator] Iniciando download de PDF');
    const { fileName: finalName, base64 } = await generateOrderPDFFromNotaBalcao(
      elementId,
      fileName
    );

    console.log('[pdfGenerator] Criando link de download');
    // Criar link de download
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${base64}`;
    link.download = finalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log('[pdfGenerator] Download iniciado com sucesso');
  } catch (error) {
    console.error('[pdfGenerator] Erro ao fazer download:', error);
    throw error;
  }
}
