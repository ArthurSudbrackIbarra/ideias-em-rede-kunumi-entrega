import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Group, MathUtils, Vector3 } from 'three'
import { ROLE_COLOR, type Role } from '../lib/hearing'
import { HEAD, type Pose } from './layout'
import { skinFor } from './skin'

const CHAIR = '#4a3f38'

export interface AvatarProps {
  /** chave estável da pessoa (id do elenco): decide o tom de pele */
  id: string
  role: Role
  pose: Pose
  speaking: boolean
  /** para onde o corpo se vira um pouco (null = em frente) */
  lookAt: Vector3 | null
  /** fase da respiração, para ninguém respirar em uníssono */
  phase: number
  /** cadeira com respaldo alto (mesa diretora) */
  tall?: boolean
}

/**
 * Um boneco sentado, igual aos da plateia: um tronco arredondado em cápsula e uma esfera como cabeça, e nada
 * mais. Sem rosto, sem ombros, sem braços, sem gravata e sem pernas (o autor simplificou o boneco em
 * 2026-09-15: o tronco fica direto sobre a cadeira). O papel muda a cor do tronco e o tom de pele varia por
 * pessoa. Quem fala se inclina para o microfone; os demais viram um pouco o corpo para quem fala. A frente é
 * +z local; `pose.rotY` gira o conjunto.
 */
export function Avatar({ id, role, pose, speaking, lookAt, phase, tall = false }: AvatarProps) {
  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const color = ROLE_COLOR[role]
  const skin = skinFor(id)
  const tmp = useMemo(() => new Vector3(), [])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    if (!body.current || !root.current) return
    body.current.position.y = Math.sin(t * 1.1 + phase) * 0.004
    // quem fala se inclina para o microfone
    const lean = speaking ? -0.16 : 0
    body.current.rotation.x = MathUtils.damp(body.current.rotation.x, lean, 4, dt)
    // os demais viram um pouco o corpo para quem fala
    let targetYaw = 0
    if (lookAt) {
      tmp.copy(lookAt)
      root.current.worldToLocal(tmp)
      if (Math.hypot(tmp.x, tmp.z) > 0.3) targetYaw = MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -0.7, 0.7)
    }
    body.current.rotation.y = MathUtils.damp(body.current.rotation.y, targetYaw, 3, dt)
  })

  return (
    <group ref={root} position={[pose.x, pose.y, pose.z]} rotation={[0, pose.rotY, 0]}>
      {/* cadeira */}
      <mesh position={[0, 0.45, -0.05]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.06, 0.5]} />
        <meshStandardMaterial color={CHAIR} roughness={0.9} />
      </mesh>
      <mesh position={[0, tall ? 0.95 : 0.8, -0.28]} castShadow>
        <boxGeometry args={[0.5, tall ? 1.0 : 0.7, 0.06]} />
        <meshStandardMaterial color={CHAIR} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.22, -0.05]}>
        <boxGeometry args={[0.08, 0.44, 0.08]} />
        <meshStandardMaterial color="#2f2823" roughness={0.9} />
      </mesh>

      <group ref={body}>
        {/* tronco arredondado: a mesma cápsula da plateia, apoiada no assento */}
        <mesh position={[0, 0.78, -0.02]} castShadow>
          <capsuleGeometry args={[0.16, 0.36, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
        {/* cabeça: uma esfera, sem feições, no tom de pele da pessoa */}
        <mesh position={[0, HEAD - 0.06, 0]} castShadow>
          <sphereGeometry args={[0.115, 20, 16]} />
          <meshStandardMaterial color={skin} roughness={0.7} />
        </mesh>
      </group>

      {/* objetos: martelo da presidência, maleta ao lado da cadeira do setor privado */}
      {role === 'mesa' && (
        <group position={[0.42, pose.deskY - pose.y + 0.02, 0.32]}>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.12, 10]} />
            <meshStandardMaterial color="#5a4030" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.02, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.2, 6]} />
            <meshStandardMaterial color="#5a4030" roughness={0.7} />
          </mesh>
        </group>
      )}
      {role === 'setor_privado' && (
        <mesh position={[0.45, 0.18, -0.1]} castShadow>
          <boxGeometry args={[0.14, 0.36, 0.42]} />
          <meshStandardMaterial color="#3b2f22" roughness={0.75} />
        </mesh>
      )}
    </group>
  )
}
