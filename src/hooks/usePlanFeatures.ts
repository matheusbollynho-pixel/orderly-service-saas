import { useStore } from '@/contexts/StoreContext';

// Links de upgrade por plano
export const UPGRADE_LINKS = {
  basic: 'https://www.asaas.com/c/vz4xmubsyo6qjny1',
  pro: 'https://www.asaas.com/c/8swycr4f636vo1za',
  premium: 'https://www.asaas.com/c/qocck5e1633zxrpl',
};

// Funcionalidades por plano
const PLAN_FEATURES: Record<string, string[]> = {
  trial: ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics', 'fluxo-caixa', 'balcao', 'reports', 'boletos', 'fiados', 'estoque', 'pos-venda', 'satisfacao'],
  basic: ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics'],
  pro: ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics', 'fluxo-caixa', 'balcao', 'reports', 'boletos', 'fiados', 'estoque', 'pos-venda', 'satisfacao'],
  premium: ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics', 'fluxo-caixa', 'balcao', 'reports', 'boletos', 'fiados', 'estoque', 'pos-venda', 'satisfacao', 'ia-atendimento'],
  enterprise: ['dashboard', 'new', 'express', 'orders', 'agenda', 'quadro', 'mechanics', 'fluxo-caixa', 'balcao', 'reports', 'boletos', 'fiados', 'estoque', 'pos-venda', 'satisfacao', 'ia-atendimento'],
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
  'ia-atendimento': 'premium',
};

export function usePlanFeatures() {
  const { plan, customFeatures } = useStore();
  const currentPlan = plan || 'basic';
  // custom_features override takes priority when set by super admin
  const allowedFeatures = customFeatures !== null
    ? customFeatures
    : (PLAN_FEATURES[currentPlan] || PLAN_FEATURES.basic);

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
