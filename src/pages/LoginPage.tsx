import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Captura o hash no mount, antes do Supabase SDK limpá-lo
  const [isInvite] = useState(() => {
    const hash = window.location.hash;
    return hash.includes('type=invite') || hash.includes('type=recovery');
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error('Erro ao definir senha', { description: error.message });
      } else {
        toast.success('Senha definida! Bem-vindo ao SpeedSeek OS!');
        // Limpa o hash da URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });
      if (error) {
        toast.error('Erro ao fazer login', {
          description: error.message === 'Invalid login credentials'
            ? 'Email ou senha incorretos'
            : error.message,
        });
      } else {
        toast.success('Login realizado com sucesso!');
      }
    } catch {
      toast.error('Erro ao fazer login', { description: 'Tente novamente mais tarde' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#121212] p-4">
      <Card className="w-full max-w-md glass-card-elevated border-border/50">
        <CardHeader className="text-center items-center space-y-0 p-3 pb-0 pt-2">
          <img src={import.meta.env.VITE_LOGO_PATH || '/bandara-logo.png'} alt="Logo" className="h-56 w-auto mx-auto -mb-8" />
          <CardDescription className="text-muted-foreground text-sm -mt-4">
            {isInvite ? 'Defina sua senha para acessar o sistema' : 'Sistema de Ordem de Serviço'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isInvite ? (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-foreground">Nova senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="!bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground">Confirmar senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="!bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#C1272D] hover:bg-red-700 text-white font-semibold"
                disabled={loading}
              >
                {loading ? 'Salvando...' : 'Definir senha e entrar'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="!bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="!bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-[#C1272D] hover:bg-red-700 text-white font-semibold"
                disabled={loading}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
