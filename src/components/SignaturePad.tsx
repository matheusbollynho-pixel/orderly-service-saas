import { useRef, useEffect, useState } from 'react';
import SignaturePadLib from 'signature_pad';
import { Button } from '@/components/ui/button';
import { Eraser, Check } from 'lucide-react';

interface SignaturePadProps {
  onSave: (signature: string) => void;
  initialValue?: string | null;
}

export function SignaturePad({ onSave, initialValue }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePadLib | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;
      
      canvas.width = container.offsetWidth * ratio;
      canvas.height = 200 * ratio;
      canvas.style.width = `${container.offsetWidth}px`;
      canvas.style.height = '200px';
      
      const context = canvas.getContext('2d');
      if (context) {
        context.scale(ratio, ratio);
      }
      
      signaturePadRef.current?.clear();
      
      if (initialValue) {
        signaturePadRef.current?.fromDataURL(initialValue, { ratio });
        setIsEmpty(false);
      }
    };

    signaturePadRef.current = new SignaturePadLib(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
    });

    signaturePadRef.current.addEventListener('endStroke', () => {
      setIsEmpty(signaturePadRef.current?.isEmpty() ?? true);
    });

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      signaturePadRef.current?.off();
    };
  }, [initialValue]);

  const handleClear = () => {
    signaturePadRef.current?.clear();
    setIsEmpty(true);
  };

  const handleSave = () => {
    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
      const dataUrl = signaturePadRef.current.toDataURL();
      onSave(dataUrl);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          Assinatura do Cliente
        </label>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleClear}
          className="h-8 px-2 text-muted-foreground"
        >
          <Eraser className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      </div>
      
      <div className="w-full rounded-lg overflow-hidden border-2 border-dashed border-muted-foreground/30">
        <canvas
          ref={canvasRef}
          className="signature-canvas w-full cursor-crosshair"
        />
      </div>
      
      <p className="text-xs text-muted-foreground text-center">
        Assine acima com o dedo ou caneta
      </p>
      
      <Button 
        onClick={handleSave} 
        disabled={isEmpty}
        className="w-full"
      >
        <Check className="h-4 w-4 mr-2" />
        Confirmar Assinatura
      </Button>
    </div>
  );
}
