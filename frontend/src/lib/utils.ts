import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// fusionne les classes Tailwind en résolvant les conflits (convention shadcn)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
