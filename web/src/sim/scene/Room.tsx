import type { HearingSim } from '../lib/hearing'
import { Label3D } from './Label3D'
import { BANCADA, DEBATEDORES, MESA, PLATEIA, ROOM, TELAO, type Pose, type SceneLayout } from './layout'

const WOOD = '#8a6a4a'
const TOP = '#c9b79c'
const CARPET = '#3f4a52'
const WALL = '#ece5d8'
const PANEL = '#5b4634'
/** a mesma serifa da placa do balão, para fechar a costura entre a sala e a interface */
const DOC_FONT = 'Newsreader, Georgia, serif'
/** o par de cor da placa do balão (redesenho, implementação §12) */
const PLATE_BG = '#1b1814'
const PLATE_INK = '#f6f1e7'

/** A sala: piso, paredes, tarimas, as três mesas, o painel de fundo, o corrimão e os telões (spec v1 §6.1, v2 §19.8). */
export function Room({ hearing, layout }: { hearing: HearingSim; layout: SceneLayout }) {
  const w = ROOM.xMax - ROOM.xMin
  const d = ROOM.zMax - ROOM.zMin
  const cz = (ROOM.zMax + ROOM.zMin) / 2
  const debW = Math.max(6, layout.debatedoresSeats.length * DEBATEDORES.spacing + 0.6)
  const title = hearing.committee ?? 'Câmara dos Deputados'

  return (
    <group>
      {/* piso e teto */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, cz]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={CARPET} roughness={1} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.ceiling, cz]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#f4f0e8" roughness={1} />
      </mesh>
      {/* paredes */}
      <mesh position={[0, ROOM.ceiling / 2, ROOM.zMin]} receiveShadow>
        <planeGeometry args={[w, ROOM.ceiling]} />
        <meshStandardMaterial color={WALL} roughness={1} />
      </mesh>
      <mesh position={[0, ROOM.ceiling / 2, ROOM.zMax]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w, ROOM.ceiling]} />
        <meshStandardMaterial color={WALL} roughness={1} />
      </mesh>
      <mesh position={[ROOM.xMin, ROOM.ceiling / 2, cz]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, ROOM.ceiling]} />
        <meshStandardMaterial color={WALL} roughness={1} />
      </mesh>
      <mesh position={[ROOM.xMax, ROOM.ceiling / 2, cz]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, ROOM.ceiling]} />
        <meshStandardMaterial color={WALL} roughness={1} />
      </mesh>
      {/* lambri de madeira na parede do fundo */}
      <mesh position={[0, 1.1, ROOM.zMin + 0.02]}>
        <boxGeometry args={[w, 2.2, 0.04]} />
        <meshStandardMaterial color={PANEL} roughness={0.85} />
      </mesh>

      {/* painel de fundo com o nome da comissão e o assunto */}
      <mesh position={[0, 3.6, ROOM.zMin + 0.05]}>
        <boxGeometry args={[11, 2.2, 0.06]} />
        <meshStandardMaterial color="#2f3d4a" roughness={0.9} />
      </mesh>
      <Label3D text={title.toUpperCase()} width={10} fontPx={24} letterSpacing={5} position={[0, 4.2, ROOM.zMin + 0.1]} maxLines={2} font={DOC_FONT} color="#cfc6b4" />
      <Label3D text={`Audiência pública${hearing.date ? ` de ${hearing.date}` : ''}\n${hearing.name}`} width={10} fontPx={18} color="#d8cfbf" position={[0, 3.15, ROOM.zMin + 0.1]} maxLines={3} />
      {/* brasão estilizado e bandeiras */}
      <mesh position={[0, 4.95, ROOM.zMin + 0.08]}>
        <circleGeometry args={[0.22, 24]} />
        <meshStandardMaterial color="#c9a227" roughness={0.5} metalness={0.3} />
      </mesh>
      {[-6.2, 6.2].map((x) => (
        <group key={x} position={[x, 0, ROOM.zMin + 0.5]}>
          <mesh position={[0, 1.6, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 3.2, 8]} />
            <meshStandardMaterial color="#c9a227" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0.3, 2.6, 0]} rotation={[0, 0, -0.08]}>
            <boxGeometry args={[0.55, 1.1, 0.02]} />
            <meshStandardMaterial color={x < 0 ? '#1f6f3f' : '#2a4a8a'} roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* tarima e mesa diretora: microfones pendem para quem preside (−z) */}
      <mesh position={[0, MESA.tarima / 2, MESA.z - 0.3]} receiveShadow castShadow>
        <boxGeometry args={[8.5, MESA.tarima, 2.6]} />
        <meshStandardMaterial color={PANEL} roughness={0.9} />
      </mesh>
      <Table x={0} z={MESA.z} y={MESA.tarima} w={Math.max(4.6, layout.mesaSeats.length * MESA.spacing)} depth={0.8} top={MESA.top} front />
      {layout.mesaSeats.map((p, i) => (
        <Mic key={i} x={p.x} y={MESA.tarima + MESA.top} z={MESA.z + 0.12} toward={-1} />
      ))}

      {/* tarima e bancada em arco (segmentos retos entre os assentos) */}
      <ArcDesk />

      {/* mesa de debatedores: microfones pendem para a pessoa (+z), placas apoiadas no tampo */}
      <Table x={0} z={DEBATEDORES.z} y={0} w={debW} depth={0.9} top={DEBATEDORES.top} front />
      {layout.debatedoresSeats.map((p, i) => (
        <group key={i}>
          {/* a cadeira vaga não tem microfone: ele ficaria colado na câmera */}
          {p.x !== layout.player.x && <Mic x={p.x + 0.28} y={DEBATEDORES.top} z={DEBATEDORES.z + 0.08} toward={1} />}
          <mesh position={[p.x - 0.3, DEBATEDORES.top + 0.05, DEBATEDORES.z + 0.2]}>
            <cylinderGeometry args={[0.035, 0.03, 0.1, 10]} />
            <meshStandardMaterial color="#dfe8ee" roughness={0.2} transparent opacity={0.7} />
          </mesh>
        </group>
      ))}
      {hearing.cast.filter((m) => m.seat === 'debatedores').map((m) => {
        const p = layout.poses.get(m.id)
        return p ? <Nameplate key={m.id} pose={p} text={(m.org ?? m.cargo).slice(0, 40)} /> : null
      })}
      <Nameplate pose={layout.player} text="cadeira vaga" />

      {/* corrimão entre o debate e a plateia */}
      <mesh position={[0, 0.95, PLATEIA.rail]}>
        <boxGeometry args={[10, 0.05, 0.05]} />
        <meshStandardMaterial color="#c9a227" metalness={0.4} roughness={0.5} />
      </mesh>
      {[-4.8, -2.4, 0, 2.4, 4.8].map((x) => (
        <mesh key={x} position={[x, 0.47, PLATEIA.rail]}>
          <cylinderGeometry args={[0.02, 0.02, 0.95, 8]} />
          <meshStandardMaterial color="#c9a227" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}

      {/* telões laterais */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * TELAO.x, TELAO.y, TELAO.z]} rotation={[0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <mesh>
            <boxGeometry args={[TELAO.w + 0.16, TELAO.h + 0.16, 0.08]} />
            <meshStandardMaterial color="#1b1b1b" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <planeGeometry args={[TELAO.w, TELAO.h]} />
            <meshStandardMaterial color="#1f2a33" roughness={0.3} emissive="#22303a" emissiveIntensity={0.6} />
          </mesh>
          {layout.remote.length > 0 && side < 0 && (
            <Label3D text="PARTICIPAÇÃO REMOTA" width={2.4} fontPx={44} color="#cfd8de" letterSpacing={6} position={[0, 0.75, 0.07]} maxLines={1} />
          )}
        </group>
      ))}

      {/* luminárias de teto */}
      {[-4.5, 0, 4.5].map((x) =>
        [-6, 0, 6].map((z) => (
          <mesh key={`${x}-${z}`} position={[x, ROOM.ceiling - 0.03, z]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.6, 0.5]} />
            <meshStandardMaterial color="#fffaf0" emissive="#fff4e0" emissiveIntensity={0.9} />
          </mesh>
        )),
      )}
    </group>
  )
}

/**
 * Placa de nome apoiada no tampo (spec §19.8): uma cunha sobre a mesa e a placa encostada nela, com a aresta
 * inferior exatamente em y = tampo, na borda oposta à pessoa, virada para a mesa diretora.
 */
function Nameplate({ pose, text }: { pose: Pose; text: string }) {
  const tilt = -0.2
  return (
    <group position={[pose.x, DEBATEDORES.top, DEBATEDORES.z - 0.4]} rotation={[0, Math.PI, 0]}>
      {/* cunha: prisma baixo atrás da placa */}
      <mesh position={[0, 0.015, -0.035]}>
        <boxGeometry args={[0.34, 0.03, 0.06]} />
        <meshStandardMaterial color="#2b2620" roughness={0.8} />
      </mesh>
      {/* a placa gira em torno da própria aresta inferior, que fica no tampo */}
      <group rotation={[tilt, 0, 0]}>
        <mesh position={[0, 0.045, 0]}>
          <boxGeometry args={[0.34, 0.09, 0.01]} />
          <meshStandardMaterial color={PLATE_BG} roughness={0.7} />
        </mesh>
        <Label3D text={text} width={0.32} fontPx={72} color={PLATE_INK} position={[0, 0.045, 0.006]} maxLines={2} bold font={DOC_FONT} />
      </group>
    </group>
  )
}

function Table({ x, z, y, w, depth, top, front }: { x: number; z: number; y: number; w: number; depth: number; top: number; front?: boolean }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, top - 0.025, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.05, depth]} />
        <meshStandardMaterial color={TOP} roughness={0.7} />
      </mesh>
      {front && (
        <mesh position={[0, top / 2 - 0.025, -depth / 2 + 0.03]} castShadow>
          <boxGeometry args={[w, top - 0.05, 0.06]} />
          <meshStandardMaterial color={WOOD} roughness={0.85} />
        </mesh>
      )}
      {[-w / 2 + 0.1, w / 2 - 0.1].map((lx) => (
        <mesh key={lx} position={[lx, top / 2 - 0.03, depth / 2 - 0.08]}>
          <boxGeometry args={[0.08, top - 0.06, 0.08]} />
          <meshStandardMaterial color={WOOD} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/** Microfone de haste: `toward` diz para que lado do eixo z a cápsula pende (+1 = para a pessoa sentada em +z). */
function Mic({ x, y, z, toward }: { x: number; y: number; z: number; toward: 1 | -1 }) {
  const h = toward > 0 ? 0.55 : 0.36
  const lean = toward > 0 ? 0.7 : 0.35
  const dz = Math.sin(lean) * h
  const dy = Math.cos(lean) * h
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.04, 12]} />
        <meshStandardMaterial color="#222" roughness={0.6} />
      </mesh>
      <mesh position={[0, dy / 2 + 0.02, (toward * dz) / 2]} rotation={[toward * lean, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, h, 6]} />
        <meshStandardMaterial color="#333" roughness={0.5} />
      </mesh>
      <mesh position={[0, dy + 0.03, toward * dz]}>
        <sphereGeometry args={[0.03, 10, 8]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** A bancada em arco: tarima curva e tampo em segmentos, do lado de dentro das cadeiras. */
function ArcDesk() {
  const segs = 14
  const span = (BANCADA.spanDeg * Math.PI) / 180
  const items = []
  for (let i = 0; i < segs; i++) {
    const t0 = -span / 2 + (span * i) / segs
    const t1 = -span / 2 + (span * (i + 1)) / segs
    const tm = (t0 + t1) / 2
    const len = 2 * BANCADA.r * Math.sin((t1 - t0) / 2) + 0.04
    const x = BANCADA.cx + BANCADA.r * Math.sin(tm)
    const z = BANCADA.cz - BANCADA.r * Math.cos(tm)
    items.push(
      <group key={i} position={[x, BANCADA.tarima, z]} rotation={[0, -tm, 0]}>
        <mesh position={[0, BANCADA.top - 0.025, 0]} castShadow receiveShadow>
          <boxGeometry args={[len, 0.05, 0.7]} />
          <meshStandardMaterial color={TOP} roughness={0.7} />
        </mesh>
        <mesh position={[0, BANCADA.top / 2 - 0.03, 0.32]} castShadow>
          <boxGeometry args={[len, BANCADA.top - 0.06, 0.06]} />
          <meshStandardMaterial color={WOOD} roughness={0.85} />
        </mesh>
        <mesh position={[0, -BANCADA.tarima / 2, -0.5]} receiveShadow>
          <boxGeometry args={[len + 0.3, BANCADA.tarima, 2.2]} />
          <meshStandardMaterial color={PANEL} roughness={0.9} />
        </mesh>
      </group>,
    )
  }
  return <group>{items}</group>
}
