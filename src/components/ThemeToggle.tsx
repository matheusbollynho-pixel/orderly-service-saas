import { Moon, Sun } from 'lucide-react';
import { useAppTheme } from '@/hooks/useTheme';

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useAppTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg bg-foreground/10 hover:bg-foreground/20 transition-colors"
      aria-label="Alternar tema"
      title={`Mudar para tema ${theme === 'dark' ? 'claro' : 'escuro'}`}
    >
      {theme === 'dark' ? (
        <Sun className="h-5 w-5 text-yellow-400" />
      ) : (
        <Moon className="h-5 w-5 text-slate-600" />
      )}
    </button>
  );
};
