import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { User, MapPin, Phone, Wrench, FileText, Loader2, ArrowLeft } from 'lucide-react';

interface OrderFormData {
  client_name: string;
  client_phone: string;
  client_address: string;
  equipment: string;
  problem_description: string;
}

interface OrderFormProps {
  onSubmit: (data: OrderFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function OrderForm({ onSubmit, onCancel, isSubmitting }: OrderFormProps) {
  const [formData, setFormData] = useState<OrderFormData>({
    client_name: '',
    client_phone: '',
    client_address: '',
    equipment: '',
    problem_description: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (field: keyof OrderFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const isValid = Object.values(formData).every(v => v.trim() !== '');

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center gap-3 pb-2">
        <Button 
          type="button" 
          variant="ghost" 
          size="icon" 
          onClick={onCancel}
          className="h-9 w-9"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold text-foreground">Nova Ordem de Serviço</h2>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="client_name" className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Nome do Cliente
          </Label>
          <Input
            id="client_name"
            placeholder="Digite o nome do cliente"
            value={formData.client_name}
            onChange={handleChange('client_name')}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="client_phone" className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            Telefone (WhatsApp)
          </Label>
          <Input
            id="client_phone"
            type="tel"
            placeholder="(00) 00000-0000"
            value={formData.client_phone}
            onChange={handleChange('client_phone')}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="client_address" className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Endereço
          </Label>
          <Input
            id="client_address"
            placeholder="Rua, número, bairro, cidade"
            value={formData.client_address}
            onChange={handleChange('client_address')}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="equipment" className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            Equipamento
          </Label>
          <Input
            id="equipment"
            placeholder="Ex: Ar-condicionado Split 12000 BTUs"
            value={formData.equipment}
            onChange={handleChange('equipment')}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="problem_description" className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Descrição do Problema
          </Label>
          <Textarea
            id="problem_description"
            placeholder="Descreva o problema relatado pelo cliente..."
            value={formData.problem_description}
            onChange={handleChange('problem_description')}
            rows={4}
            className="resize-none"
          />
        </div>
      </div>

      <Button 
        type="submit" 
        className="w-full h-12 text-base font-medium"
        disabled={!isValid || isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Criando...
          </>
        ) : (
          'Criar Ordem de Serviço'
        )}
      </Button>
    </form>
  );
}
