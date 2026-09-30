import { useMemo } from 'react'
import { Vector3 } from 'three'
import type { HearingSim } from '../lib/hearing'
import { useSim } from '../store/useSim'
import { Avatar } from './Avatar'
import { EYE, HEAD, type SceneLayout } from './layout'

/** O elenco nomeado: um boneco por orador presente, no assento que o modelo indicou. */
export function Cast({ hearing, layout }: { hearing: HearingSim; layout: SceneLayout }) {
  const current = useSim((s) => s.run.current)
  const speaking = current && (current.kind === 'fala' || current.kind === 'reaction' || current.kind === 'mesa') ? current.speaker : null
  const playerSpeaking = current?.kind === 'player'

  // todos olham para quem fala; quando o jogador fala, olham para a cadeira dele
  const lookAt = useMemo(() => {
    if (playerSpeaking) return new Vector3(layout.player.x, layout.player.y + EYE, layout.player.z)
    if (!speaking) return null
    if (layout.remote.includes(speaking)) return new Vector3(-8.6, 3, -3)
    const p = layout.poses.get(speaking)
    return p ? new Vector3(p.x, p.y + HEAD, p.z) : null
  }, [speaking, playerSpeaking, layout])

  return (
    <group>
      {hearing.cast.map((m, i) => {
        const pose = layout.poses.get(m.id)
        if (!pose) return null
        return (
          <Avatar
            key={m.id}
            id={m.id}
            role={m.role}
            pose={pose}
            speaking={speaking === m.id}
            lookAt={speaking === m.id ? null : lookAt}
            phase={i * 1.7}
            tall={m.seat === 'mesa'}
          />
        )
      })}
    </group>
  )
}
