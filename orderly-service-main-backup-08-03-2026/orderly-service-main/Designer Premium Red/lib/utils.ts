import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Deterministic date formatting to avoid hydration mismatch */
export function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split('T')[0].split('-')
  return `${day}/${month}/${year}`
}

export function formatDateShort(dateStr: string): string {
  const [, month, day] = dateStr.split('T')[0].split('-')
  return `${day}/${month}`
}
