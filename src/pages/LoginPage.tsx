import { useState } from 'react';
import { supabase, INITIAL_URL_HASH, INITIAL_URL_SEARCH } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInvite] = useState(() =>
    INITIAL_URL_HASH.includes('type=invite') || INITIAL_URL_HASH.includes('type=recovery') ||
    INITIAL_URL_SEARCH.includes('type=invite') || INITIAL_URL_SEARCH.includes('type=recovery') ||
    (INITIAL_URL_HASH.includes('access_token') && !INITIAL_URL_HASH.includes('type=magiclink'))
  );
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showForgot, setShowForgot] = useState(false);

  // Cadastro
  const [showCadastro, setShowCadastro] = useState(() => window.location.search.includes('cadastro=1'));
  const [cadNomeOficina, setCadNomeOficina] = useState('');
  const [cadNomeDono, setCadNomeDono] = useState('');
  const [cadEmail, setCadEmail] = useState('');
  const [cadSenha, setCadSenha] = useState('');
  const [cadTipo, setCadTipo] = useState('moto');
  const [cadLoading, setCadLoading] = useState(false);

  const handleCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cadSenha.length < 6) { toast.error('Senha deve ter pelo menos 6 caracteres'); return; }
    setCadLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provision-client', {
        body: {
          company_name: cadNomeOficina.trim(),
          owner_name: cadNomeDono.trim(),
          owner_email: cadEmail.trim().toLowerCase(),
          owner_password: cadSenha,
          vehicle_type: cadTipo,
          is_trial: true,
          plan: 'basic',
        },
      });
      if (error || !data?.success) {
        const msg = data?.error || error?.message || 'Erro ao criar conta';
        if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
          toast.error('Este e-mail já tem uma conta. Use "Esqueci minha senha" para recuperar o acesso.');
        } else {
          toast.error(msg);
        }
        return;
      }
      toast.success('Conta criada! Entrando...');
      await supabase.auth.signInWithPassword({ email: cadEmail.trim().toLowerCase(), password: cadSenha });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCadLoading(false);
    }
  };

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
        // Redireciona para o app (reload limpa o INITIAL_URL_HASH)
        window.location.replace('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Digite seu email primeiro');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) {
        toast.error('Erro ao enviar email', { description: error.message });
      } else {
        toast.success('Email enviado! Verifique sua caixa de entrada.');
        setShowForgot(false);
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
          {!isInvite && !showForgot && (
            <div className="flex rounded-lg overflow-hidden border border-border/50 mb-4">
              <button
                type="button"
                onClick={() => setShowCadastro(false)}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${!showCadastro ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setShowCadastro(true)}
                className={`flex-1 py-2 text-sm font-semibold transition-colors ${showCadastro ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Criar conta grátis
              </button>
            </div>
          )}

          {showCadastro && !isInvite ? (
            <form onSubmit={handleCadastro} className="space-y-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-3 text-xs text-emerald-400 text-center">
                🎉 7 dias grátis · Sem cartão de crédito
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground text-xs">Nome da oficina</Label>
                <Input placeholder="Ex: Bandara Motos" value={cadNomeOficina} onChange={e => setCadNomeOficina(e.target.value)} required disabled={cadLoading} className="!bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground text-xs">Seu nome</Label>
                <Input placeholder="Ex: João Silva" value={cadNomeDono} onChange={e => setCadNomeDono(e.target.value)} required disabled={cadLoading} className="!bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground text-xs">E-mail</Label>
                <Input type="email" placeholder="seu@email.com" value={cadEmail} onChange={e => setCadEmail(e.target.value)} required disabled={cadLoading} className="!bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground text-xs">Senha (mínimo 6 caracteres)</Label>
                <Input type="password" placeholder="••••••••" value={cadSenha} onChange={e => setCadSenha(e.target.value)} required disabled={cadLoading} className="!bg-muted/50 border-border/50 text-foreground placeholder:text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground text-xs">Tipo de veículo</Label>
                <select title="Tipo de veículo" value={cadTipo} onChange={e => setCadTipo(e.target.value)} disabled={cadLoading} className="w-full rounded-md border border-border/50 bg-muted/50 text-foreground text-sm px-3 py-2">
                  <option value="moto">Motos</option>
                  <option value="carro">Carros</option>
                </select>
              </div>
              <Button type="submit" className="w-full bg-[#C1272D] hover:bg-red-700 text-white font-semibold" disabled={cadLoading}>
                {cadLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Criando conta...</> : 'Criar conta e entrar'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Ao criar, você concorda com os{' '}
                <a href="https://speedseekos.com.br/termos" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Termos de Uso</a>
              </p>
            </form>
          ) : isInvite ? (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 text-xs text-yellow-400 text-center">
                Caso este email tenha chegado na pasta de spam, marque como <strong>"Não é spam"</strong> para receber próximas notificações normalmente.
              </div>
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
          ) : showForgot ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Seu email</Label>
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
              <Button
                type="submit"
                className="w-full bg-[#C1272D] hover:bg-red-700 text-white font-semibold"
                disabled={loading}
              >
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </Button>
              <button
                type="button"
                onClick={() => setShowForgot(false)}
                className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
              >
                Voltar ao login
              </button>
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
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
              >
                Esqueci minha senha
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
