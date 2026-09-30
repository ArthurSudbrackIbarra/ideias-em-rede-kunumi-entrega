import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { MathUtils, Vector3 } from 'three'
import { useSim } from '../store/useSim'
import { anchor } from './anchor'
import { EYE, headOf, type SceneLayout } from './layout'

const YAW_LIMIT = (135 * Math.PI) / 180
const PITCH_MIN = (-72 * Math.PI) / 180
const PITCH_MAX = (32 * Math.PI) / 180
const DESK_PITCH = (-62 * Math.PI) / 180
const DESK_THRESHOLD = (-50 * Math.PI) / 180
const LOOK_CONE = (80 * Math.PI) / 180 // visão periférica conta: da ponta da mesa, os colegas ficam quase a 90°
const DRAG = 0.0032

/**
 * A câmera na cadeira do jogador: posição fixa, guinada e inclinação livres dentro dos limites,
 * leve balanço de respiração. Arrastar o mouse arrasta a cena; Q/E viram para quem fala; Tab abaixa
 * a cabeça para a mesa de anotações. Também projeta a cabeça do orador para o balão (anchor).
 */
export function SeatCamera({ layout }: { layout: SceneLayout }) {
  const { camera, gl, size } = useThree()
  const base = useMemo(() => {
    const p = layout.player
    // câmera olha para -z quando yaw = 0; a frente do assento é (sin rotY, cos rotY)
    return { pos: new Vector3(p.x, p.y + EYE, p.z), yaw: Math.atan2(-Math.sin(p.rotY), -Math.cos(p.rotY)) }
  }, [layout])
  const yaw = useRef(base.yaw)
  const pitch = useRef(0)
  const target = useRef<{ yaw: number; pitch: number } | null>(null)
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })
  const tmp = useMemo(() => new Vector3(), [])
  const fwd = useMemo(() => new Vector3(), [])
  const lookRequest = useSim((s) => s.lookRequest)
  const deskRequest = useSim((s) => s.deskRequest)
  const current = useSim((s) => s.run.current)
  const setDeskView = useSim((s) => s.setDeskView)
  const setLooking = useSim((s) => s.setLooking)
  const setSceneReady = useSim((s) => s.setSceneReady)
  const ready = useRef(false)

  useEffect(() => {
    yaw.current = base.yaw
    pitch.current = 0
    camera.position.copy(base.pos)
  }, [base, camera])

  // arrastar para olhar
  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return
      dragging.current = true
      last.current = { x: e.clientX, y: e.clientY }
      target.current = null
    }
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - last.current.x
      const dy = e.clientY - last.current.y
      last.current = { x: e.clientX, y: e.clientY }
      // arrastar a cena (spec §19.1): arrastar para a direita gira a visão para a esquerda; para baixo, a visão sobe
      yaw.current = MathUtils.clamp(yaw.current + dx * DRAG, base.yaw - YAW_LIMIT, base.yaw + YAW_LIMIT)
      pitch.current = MathUtils.clamp(pitch.current + dy * DRAG, PITCH_MIN, PITCH_MAX)
    }
    const up = () => {
      dragging.current = false
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gl, base])

  // Q/E: virar para quem fala
  useEffect(() => {
    if (!lookRequest) return
    const speaker = current?.kind === 'fala' || current?.kind === 'reaction' || current?.kind === 'mesa' ? current.speaker : null
    const head = speaker ? headOf(layout, speaker) : null
    if (!head) return
    const dx = head[0] - base.pos.x
    const dz = head[2] - base.pos.z
    const dy = head[1] - base.pos.y
    const y = MathUtils.clamp(Math.atan2(-dx, -dz), base.yaw - YAW_LIMIT, base.yaw + YAW_LIMIT)
    // atan2 devolve em (-π, π]; aproxima do yaw atual para não dar a volta
    const wrapped = y + Math.round((yaw.current - y) / (2 * Math.PI)) * 2 * Math.PI
    target.current = { yaw: MathUtils.clamp(wrapped, base.yaw - YAW_LIMIT, base.yaw + YAW_LIMIT), pitch: MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), PITCH_MIN, PITCH_MAX) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookRequest])

  // Tab: mesa de anotações
  useEffect(() => {
    if (!deskRequest.nonce) return
    target.current = { yaw: yaw.current, pitch: deskRequest.open ? DESK_PITCH : 0 }
  }, [deskRequest])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    if (target.current) {
      yaw.current = MathUtils.damp(yaw.current, target.current.yaw, 7, dt)
      pitch.current = MathUtils.damp(pitch.current, target.current.pitch, 7, dt)
      if (Math.abs(yaw.current - target.current.yaw) < 0.004 && Math.abs(pitch.current - target.current.pitch) < 0.004) target.current = null
    }
    const swayY = Math.sin(t * 0.6) * 0.0026
    const swayP = Math.sin(t * 0.9 + 1) * 0.002
    camera.position.copy(base.pos)
    camera.rotation.set(pitch.current + swayP, yaw.current + swayY, 0, 'YXZ')

    setDeskView(pitch.current < DESK_THRESHOLD)

    // projeta a cabeça de quem fala para o balão em DOM
    const speaker = current?.kind === 'fala' || current?.kind === 'reaction' || current?.kind === 'mesa' ? current.speaker : null
    const head = speaker ? headOf(layout, speaker) : null
    anchor.width = size.width
    anchor.height = size.height
    if (head) {
      tmp.set(head[0], head[1], head[2])
      const dir = tmp.clone().sub(camera.position).normalize()
      camera.getWorldDirection(fwd)
      const ang = fwd.angleTo(dir)
      setLooking(ang < LOOK_CONE)
      tmp.project(camera)
      const inFront = tmp.z < 1
      const x = (tmp.x * 0.5 + 0.5) * size.width
      const y = (-tmp.y * 0.5 + 0.5) * size.height
      anchor.active = true
      anchor.onScreen = inFront && x > 0 && x < size.width && y > 0 && y < size.height
      anchor.x = x
      anchor.y = y
      // direção na tela para a seta: usa o vetor no referencial da câmera
      const local = dir.clone().applyQuaternion(camera.quaternion.clone().invert())
      anchor.angle = Math.atan2(-local.y, local.x)
    } else {
      anchor.active = false
      setLooking(true)
    }
    if (!ready.current) {
      ready.current = true
      setSceneReady(true)
    }
  })

  return null
}
