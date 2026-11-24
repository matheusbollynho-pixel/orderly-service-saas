import { useStore } from '@/contexts/StoreContext';

// Rótulo do veículo conforme a loja: 'moto', 'carro' ou 'ambos' (loja que atende
// os dois → "veículo"). VEHICLE continua 'moto' | 'carro' | 'veículo'.
export function useVehicleLabel() {
  const { vehicleType } = useStore();
  const raw = vehicleType === 'ambos' ? 'veículo' : (vehicleType || 'moto');
  return {
    vehicle: raw,
    VEHICLE: raw,
    VEHICLE_CAP: raw.charAt(0).toUpperCase() + raw.slice(1),
    VEHICLES_CAP: raw === 'moto' ? 'Motos' : raw === 'carro' ? 'Carros' : 'Veículos',
  };
}
