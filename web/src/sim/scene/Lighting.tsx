import { ROOM } from './layout'

/** Uma luz direcional com sombra (mapa 1024) e preenchimento quente; o resto é emissivo nas luminárias. */
export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.55} color="#fff3e2" />
      <hemisphereLight args={['#fff6ea', '#5a5148', 0.45]} />
      <directionalLight
        position={[3, ROOM.ceiling - 0.2, 2]}
        intensity={1.1}
        color="#fff1dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-bias={-0.0008}
        shadow-normalBias={0.03}
      />
      <pointLight position={[0, 4.6, -8]} intensity={4} color="#ffe6c4" distance={9} decay={2} />
      <pointLight position={[0, 4.6, 6]} intensity={3} color="#ffe6c4" distance={10} decay={2} />
    </>
  )
}
