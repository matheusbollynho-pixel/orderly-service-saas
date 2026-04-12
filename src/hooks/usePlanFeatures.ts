import { useStore } from '@/contexts/StoreContext';

// Links de upgrade por plano
export const UPGRADE_LINKS = {
  pro: 'https://www.asaas.com/c/8swycr4f636vo1za',
  premium: 'https://www.asaas.com/c/qocck5e1633zxrpl',
};

// Funcionalidades por plano
const PLAN_FEATURES: Record<string, string[]> = {
  trial: ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics'],
  basic: ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics'],
  pro: ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics', 'fluxo-caixa', 'balcao', 'reports', 'boletos', 'fiados', 'estoque', 'pos-venda', 'satisfacao'],
  premium: ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics', 'fluxo-caixa', 'balcao', 'reports', 'boletos', 'fiados', 'estoque', 'pos-venda', 'satisfacao'],
  enterprise: ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics', 'fluxo-caixa', 'balcao', 'reports', 'boletos', 'fiados', 'estoque', 'pos-venda', 'satisfacao'],
};

// Qual plano é necessário para cada feature
export const REQUIRED_PLAN: Record<string, 'pro' | 'premium'> = {
  'fluxo-caixa': 'pro',
  'balcao': 'pro',
  'reports': 'pro',
  'boletos': 'pro',
  'fiados': 'pro',
  'estoque': 'pro',
  'pos-venda': 'pro',
  'satisfacao': 'pro',
};

export function usePlanFeatures() {
  const { plan } = useStore();
  const currentPlan = plan || 'basic';
  const allowedFeatures = PLAN_FEATURES[currentPlan] || PLAN_FEATURES.basic;

  function canAccess(feature: string): boolean {
    return allowedFeatures.includes(feature);
  }

  function getUpgradeLink(feature: string): string {
    const required = REQUIRED_PLAN[feature];
    return required ? UPGRADE_LINKS[required] : UPGRADE_LINKS.pro;
  }

  function getRequiredPlan(feature: string): string {
    const required = REQUIRED_PLAN[feature];
    return required === 'pro' ? 'Profissional' : required === 'premium' ? 'Premium' : 'Pro';
  }

  return { canAccess, getUpgradeLink, getRequiredPlan, currentPlan };
}
