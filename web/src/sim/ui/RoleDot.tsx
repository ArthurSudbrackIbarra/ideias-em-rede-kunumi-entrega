import type { ReactElement } from 'react'
import { ROLE_COLOR, ROLE_LABEL, type Role } from '../lib/hearing'

/**
 * A marca do papel institucional. Cada papel tem cor e forma próprias (círculo, quadrado, triângulo, losango,
 * hexágono, anel), para a informação não depender só da cor (WCAG 1.4.1). O contorno escuro mantém a marca visível
 * no papel claro. `label` escreve o papel para o leitor de tela.
 */
const SHAPES: Record<Role, ReactElement> = {
  parlamentar: <circle cx="5" cy="5" r="4.2" />,
  governo: <rect x="1" y="1" width="8" height="8" rx="0.8" />,
  sociedade_civil: <path d="M5 0.8 9.4 9H0.6z" />,
  setor_privado: <path d="M5 0.4 9.6 5 5 9.6 0.4 5z" />,
  mesa: <path d="M5 0.6 9 2.8v4.4L5 9.4 1 7.2V2.8z" />,
  convidado: <circle cx="5" cy="5" r="3.6" fill="none" strokeWidth="1.8" />,
}

export function RoleDot({ role, size = 10, label = false }: { role: Role; size?: number; label?: boolean }) {
  return (
    <>
      <svg
        className="role-dot"
        viewBox="0 0 10 10"
        width={size}
        height={size}
        aria-hidden="true"
        fill={ROLE_COLOR[role]}
        stroke={role === 'convidado' ? '#6f6f6f' : 'rgba(18, 16, 9, 0.65)'}
        strokeWidth="0.9"
      >
        {SHAPES[role]}
      </svg>
      {label && <span className="sr-only">{ROLE_LABEL[role]}, </span>}
    </>
  )
}
