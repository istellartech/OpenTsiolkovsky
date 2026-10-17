import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Join class names, letting later Tailwind utilities override earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
