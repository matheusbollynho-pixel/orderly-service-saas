import { useStore } from '@/contexts/StoreContext';

export function useVehicleLabel() {
  const { vehicleType } = useStore();
  const raw = vehicleType || 'moto';
  return {
    vehicle: raw,
    VEHICLE: raw,
    VEHICLE_CAP: raw.charAt(0).toUpperCase() + raw.slice(1),
    VEHICLES_CAP: raw === 'moto' ? 'Motos' : 'Carros',
  };
}
