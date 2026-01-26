import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useClients, Client, Motorcycle } from '@/hooks/useClients';
import { useToast } from '@/hooks/use-toast';

interface ClientSearchProps {
  onClientFound: (client: Client, motorcycles: Motorcycle[]) => void;
}

export function ClientSearch({ onClientFound }: ClientSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<'cpf' | 'phone' | 'name'>('cpf');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<boolean | null>(null);
  
  const { searchClientByCPF, searchClientByPhone, searchClientByName, getClientMotorcycles } = useClients();
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast({
        title: "Campo vazio",
        description: "Digite algo para buscar",
        variant: "destructive"
      });
      return;
    }

    setSearching(true);
    setFound(null);

    try {
      let client: Client | null = null;

      if (searchType === 'cpf') {
        client = await searchClientByCPF(searchTerm);
      } else if (searchType === 'phone') {
        client = await searchClientByPhone(searchTerm);
      } else if (searchType === 'name') {
        const clients = await searchClientByName(searchTerm);
        if (clients.length > 0) {
          client = clients[0]; // Pega o primeiro resultado
          if (clients.length > 1) {
            toast({
              title: "Múltiplos resultados",
              description: `Encontrados ${clients.length} clientes. Mostrando o primeiro.`,
            });
          }
        }
      }

      if (client) {
        // Buscar motos do cliente
        const motorcycles = await getClientMotorcycles(client.id);
        
        setFound(true);
        toast({
          title: "✅ Cliente encontrado!",
          description: `${client.name} - ${motorcycles.length} moto(s) cadastrada(s)`,
        });
        
        onClientFound(client, motorcycles);
      } else {
        setFound(false);
        toast({
          title: "❌ Cliente não encontrado",
          description: "Nenhum cliente encontrado com esses dados. Preencha manualmente.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Erro na busca:', error);
      setFound(false);
      toast({
        title: "Erro na busca",
        description: "Ocorreu um erro ao buscar o cliente",
        variant: "destructive"
      });
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl space-y-3">
      <div className="flex items-center gap-2">
        <Search className="h-5 w-5 text-blue-600" />
        <Label className="text-lg font-bold text-blue-900">🔍 Buscar Cliente Cadastrado</Label>
      </div>
      
      <div className="flex gap-2">
        <Button
          type="button"
          variant={searchType === 'cpf' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSearchType('cpf')}
          className="flex-1"
        >
          CPF
        </Button>
        <Button
          type="button"
          variant={searchType === 'phone' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSearchType('phone')}
          className="flex-1"
        >
          Telefone
        </Button>
        <Button
          type="button"
          variant={searchType === 'name' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSearchType('name')}
          className="flex-1"
        >
          Nome
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            placeholder={
              searchType === 'cpf' ? 'Digite o CPF...' :
              searchType === 'phone' ? 'Digite o telefone...' :
              'Digite o nome...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={handleKeyPress}
            className="h-12 pr-10"
          />
          {found !== null && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {found ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
          )}
        </div>
        <Button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="h-12 px-6"
        >
          {searching ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Buscando...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Buscar
            </>
          )}
        </Button>
      </div>

      <p className="text-sm text-blue-700">
        💡 Se o cliente já foi cadastrado, busque para preencher automaticamente
      </p>
    </div>
  );
}
