import { Instance, Instances } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { ROLE_COLOR, type HearingSim, type Role } from '../lib/hearing'
import { useSim } from '../store/useSim'
import { HEAD, type Pose, type SceneLayout } from './layout'
import { skinFor } from './skin'

const BENCH = '#5a4a3f'

interface Member {
  pose: Pose
  role: Role
  phase: number
  skin: string
}

/**
 * A plateia, instanciada por papel (um InstancedMesh por parte do corpo e por papel), para até 60 pessoas
 * custarem poucas chamadas de desenho. A cabeça e as mãos levam a cor por instância, para os tons de pele
 * variarem sem multiplicar materiais. Como os bonecos da mesa, são só tronco e cabeça sobre o banco
 * (simplificação pedida em 2026-09-15). Palmas: as mãos aparecem e sobem em loop.
 */
export function Audience({ hearing, layout }: { hearing: HearingSim; layout: SceneLayout }) {
  const current = useSim((s) => s.run.current)
  const applauding = (current?.applause ?? 0) > 0
  const hands = useRef<Group>(null)
  const bodies = useRef<Group>(null)

  const members = useMemo<Member[]>(() => {
    // distribui os papéis pela plateia de forma embaralhada mas determinística
    const roles: Role[] = []
    for (const c of hearing.audience.composition) for (let i = 0; i < c.count; i++) roles.push(c.role)
    while (roles.length < layout.audience.length) roles.push('sociedade_civil')
    let seed = 7
    for (let i = roles.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280
      const j = Math.floor((seed / 233280) * (i + 1))
      ;[roles[i], roles[j]] = [roles[j], roles[i]]
    }
    return layout.audience.map((pose, i) => ({ pose, role: roles[i], phase: i * 0.9, skin: skinFor(`plateia-${hearing.id}-${i}`) }))
  }, [hearing, layout])

  const byRole = useMemo(() => {
    const m = new Map<Role, Member[]>()
    for (const mem of members) m.set(mem.role, [...(m.get(mem.role) ?? []), mem])
    return [...m.entries()]
  }, [members])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (hands.current) {
      hands.current.visible = applauding
      hands.current.position.y = applauding ? Math.abs(Math.sin(t * 7)) * 0.08 : 0
    }
    if (bodies.current) bodies.current.position.y = Math.sin(t * 1.3) * 0.003
  })

  const rows = Math.max(1, layout.audience.length ? Math.ceil(layout.audience.length / 12) : 0)

  return (
    <group>
      {/* bancos por fileira */}
      {Array.from({ length: rows }, (_, r) => (
        <group key={r} position={[0, r * 0.12, 2.6 + r * 0.85]}>
          <mesh position={[0, 0.42, 0]} receiveShadow castShadow>
            <boxGeometry args={[8.2, 0.08, 0.5]} />
            <meshStandardMaterial color={BENCH} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.7, -0.24]} castShadow>
            <boxGeometry args={[8.2, 0.5, 0.05]} />
            <meshStandardMaterial color={BENCH} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.06, 0]} receiveShadow>
            <boxGeometry args={[9.4, 0.12, 0.85]} />
            <meshStandardMaterial color="#4b555c" roughness={1} />
          </mesh>
        </group>
      ))}

      <group ref={bodies}>
        {byRole.map(([role, list]) => (
          <group key={role}>
            <Instances limit={list.length} castShadow>
              <capsuleGeometry args={[0.16, 0.36, 4, 10]} />
              <meshStandardMaterial color={ROLE_COLOR[role]} roughness={0.9} />
              {list.map((m, i) => (
                <Instance key={i} position={[m.pose.x, m.pose.y + 0.78, m.pose.z]} rotation={[0, m.pose.rotY, 0]} />
              ))}
            </Instances>
            <Instances limit={list.length} castShadow>
              <sphereGeometry args={[0.11, 12, 10]} />
              <meshStandardMaterial color="#ffffff" roughness={0.7} />
              {list.map((m, i) => (
                <Instance key={i} position={[m.pose.x, m.pose.y + HEAD - 0.08, m.pose.z]} color={m.skin} />
              ))}
            </Instances>
          </group>
        ))}
      </group>

      {/* mãos: só durante as palmas, no tom de pele de cada pessoa */}
      <group ref={hands} visible={false}>
        <Instances limit={members.length * 2}>
          <sphereGeometry args={[0.045, 8, 6]} />
          <meshStandardMaterial color="#ffffff" roughness={0.7} />
          {members.map((m, i) => (
            <group key={i}>
              <Instance position={[m.pose.x - 0.09, m.pose.y + 1.02, m.pose.z - 0.18]} color={m.skin} />
              <Instance position={[m.pose.x + 0.09, m.pose.y + 1.02, m.pose.z - 0.18]} color={m.skin} />
            </group>
          ))}
        </Instances>
      </group>
    </group>
  )
}
