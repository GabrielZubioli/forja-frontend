import type { SVGProps } from "react";

/**
 * O treinador: um apito, no traço dos ícones do lucide (que não tem um).
 * Substitui o robô — o treinador é uma pessoa da academia, não "a IA".
 */
export function CoachIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 8h12v4h-6.34" />
      <circle cx="9" cy="14" r="6" />
      <circle cx="9" cy="14" r="1.5" />
      <path d="M5 9.5 3 4" />
    </svg>
  );
}
