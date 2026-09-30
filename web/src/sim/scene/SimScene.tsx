import { Canvas } from '@react-three/fiber'
import { EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useMemo } from 'react'
import { useSim } from '../store/useSim'
import { Audience } from './Audience'
import { Cast } from './Cast'
import { buildLayout, EYE } from './layout'
import { Lighting } from './Lighting'
import { PlayerBody } from './PlayerBody'
import { Room } from './Room'
import { SeatCamera } from './SeatCamera'

/** A sala 3D. Sem Bloom (sala interna, texto branco perderia legibilidade); só vinheta e tonemapping. */
export function SimScene() {
  const hearing = useSim((s) => s.hearing)
  const layout = useMemo(() => (hearing ? buildLayout(hearing) : null), [hearing])
  if (!hearing || !layout) return null

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 62, near: 0.05, far: 80, position: [layout.player.x, EYE, layout.player.z] }}
      frameloop="always"
    >
      <color attach="background" args={['#2d3238']} />
      <Lighting />
      <Room hearing={hearing} layout={layout} />
      <Cast hearing={hearing} layout={layout} />
      <Audience hearing={hearing} layout={layout} />
      <PlayerBody pose={layout.player} />
      <SeatCamera layout={layout} />
      <EffectComposer multisampling={0}>
        <Vignette eskil={false} offset={0.22} darkness={0.55} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  )
}
