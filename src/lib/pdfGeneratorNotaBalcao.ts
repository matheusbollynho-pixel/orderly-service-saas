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
    console.log(`[pdfGenerator v2] Procurando elemento com ID: ${elementId}`);
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`[pdfGenerator v2] Elemento não encontrado: ${elementId}`);
      throw new Error(`Elemento com ID "${elementId}" não encontrado`);
    }

    console.log('[pdfGenerator v2] Elemento encontrado, convertendo imagens para base64...');
    // Converter todas as imagens para base64 para evitar problemas de CORS no html2canvas
    const images = element.querySelectorAll('img');
    await Promise.all(Array.from(images).map(async (img) => {
      // Usar data-pdf-src se disponível (URL original, ignorando qualquer base64 em cache)
      const fetchUrl = img.dataset.pdfSrc
        ? (img.dataset.pdfSrc.startsWith('http') ? img.dataset.pdfSrc : `${window.location.origin}${img.dataset.pdfSrc}`)
        : (!img.src.startsWith('data:') ? img.src : null);

      if (!fetchUrl) return; // já é base64 e sem data-pdf-src, manter como está

      // Converter URL para base64
      try {
        const response = await fetch(fetchUrl);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        img.src = base64;
        console.log(`[pdfGenerator v2] Imagem convertida: ${fetchUrl}`);
      } catch (e) {
        console.warn('[pdfGenerator v2] Falha ao converter imagem para base64:', fetchUrl, e);
      }
    }));
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log('[pdfGenerator v2] Iniciando html2canvas...');
    // Capturar elemento como canvas
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: true,
      backgroundColor: '#ffffff',
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });
    console.log('[pdfGenerator v2] html2canvas concluído com sucesso');

    // Validar dimensões do canvas
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      console.error('[pdfGenerator v2] Canvas inválido:', { width: canvas?.width, height: canvas?.height });
      throw new Error('Elemento não possui dimensões válidas para gerar PDF');
    }

    console.log('[pdfGenerator v2] Canvas válido:', { width: canvas.width, height: canvas.height });

    // Converter canvas para JPEG (mais compatível que PNG com jsPDF)
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
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
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Gerar base64
    const base64 = pdf.output('datauristring').split(',')[1];
    console.log(`[pdfGenerator v2] PDF gerado com sucesso. Base64 length: ${base64.length}`);

    return {
      fileName,
      base64,
    };
  } catch (error) {
    console.error('[pdfGenerator v2] Erro ao gerar PDF do NotaBalcao:', error);
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
    console.log('[pdfGenerator v2] Iniciando download de PDF');
    const { fileName: finalName, base64 } = await generateOrderPDFFromNotaBalcao(
      elementId,
      fileName
    );

    console.log('[pdfGenerator v2] Criando link de download');
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
