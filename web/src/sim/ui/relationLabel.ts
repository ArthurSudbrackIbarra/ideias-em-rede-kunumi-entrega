import { copy } from '../copy'
import type { RelationTag } from '../engine/rules'
import { displayName, ROLE_LABEL, type HearingSim, type Role } from '../lib/hearing'

/** A frase da relação: "Contradiz você", "Apoia Rodrigo Agostinho", "Cobra governo", "Consenso". */
export function relationLabel(tag: RelationTag, hearing: HearingSim): string {
  let who = copy.rel[tag.kind] ?? tag.kind
  if (tag.kind === 'consenso') return copy.rel.consenso
  if (tag.kind === 'concorda') return copy.rel.concorda
  if (tag.byPlayer) {
    const target = tag.target ? displayName(hearing, tag.target) : ''
    who = tag.kind === 'cobra' && tag.target ? `${copy.rel.cobra} ${ROLE_LABEL[roleOf(hearing, tag.target)].toLowerCase()}` : `${who} ${target}`
  } else if (tag.kind === 'defende') who = `${copy.rel.defende} ${tag.target ? displayName(hearing, tag.target) : ''}`
  else who = `${who} ${copy.rel.you}`
  return who.trim()
}

function roleOf(h: HearingSim, speaker: string): Role {
  return h.cast.find((m) => m.id === speaker)?.role ?? 'convidado'
}
