// Rótulo do veículo configurável por variável de ambiente
// VITE_VEHICLE_LABEL=carro → "Carro", "Carros", "carro"
// padrão → "Moto", "Motos", "moto"

const raw = (import.meta.env.VITE_VEHICLE_LABEL || 'moto').toLowerCase().trim();

export const VEHICLE = raw;                            // "moto" | "carro"
export const VEHICLE_CAP = raw.charAt(0).toUpperCase() + raw.slice(1); // "Moto" | "Carro"
export const VEHICLES_CAP = VEHICLE_CAP + (raw === 'moto' ? 's' : 's'); // "Motos" | "Carros"
