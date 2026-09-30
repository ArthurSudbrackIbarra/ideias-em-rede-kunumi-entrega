import type { Pose } from './layout'

const NEUTRAL = '#9a9a9a'

/**
 * O corpo do jogador (spec §8, §19.8): cinza neutro, sem braços, sem pernas e sem tom de pele, porque a cadeira
 * vaga é de ninguém. Ao olhar para baixo vê-se o tronco de cima, o caderno, o lápis e o copo.
 */
export function PlayerBody({ pose }: { pose: Pose }) {
  const deskY = pose.deskY - pose.y
  return (
    <group position={[pose.x, pose.y, pose.z]} rotation={[0, pose.rotY, 0]}>
      {/* tronco visto de cima */}
      <mesh position={[0, 0.78, -0.05]}>
        <capsuleGeometry args={[0.16, 0.34, 6, 12]} />
        <meshStandardMaterial color={NEUTRAL} roughness={0.85} />
      </mesh>
      {/* o caderno: papel sobre o tampo */}
      <mesh position={[0, deskY + 0.012, 0.42]} rotation={[-Math.PI / 2, 0, 0.04]} receiveShadow>
        <planeGeometry args={[0.42, 0.3]} />
        <meshStandardMaterial color="#f7f2e8" roughness={0.95} />
      </mesh>
      {/* o lápis: à direita do caderno, com folga, deitado na diagonal */}
      <mesh position={[0.36, deskY + 0.006, 0.36]} rotation={[0, 0.55, Math.PI / 2]}>
        <cylinderGeometry args={[0.005, 0.005, 0.15, 6]} />
        <meshStandardMaterial color="#c9a227" roughness={0.6} />
      </mesh>
      <mesh position={[0.36 + Math.cos(0.55) * 0.08, deskY + 0.006, 0.36 - Math.sin(0.55) * 0.08]} rotation={[0, 0.55, Math.PI / 2]}>
        <coneGeometry args={[0.005, 0.02, 6]} />
        <meshStandardMaterial color="#2b2621" roughness={0.6} />
      </mesh>
      <mesh position={[-0.35, deskY + 0.05, 0.5]}>
        <cylinderGeometry args={[0.035, 0.03, 0.1, 10]} />
        <meshStandardMaterial color="#dfe8ee" roughness={0.2} transparent opacity={0.7} />
      </mesh>
    </group>
  )
}
