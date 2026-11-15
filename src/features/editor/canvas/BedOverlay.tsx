import type { Viewport } from '../../../geometry/viewport'
import type { Bed } from '../../../model/beds'
import { insertBedCorner, moveBedCorner } from '../../../model/beds'
import type { Point, Project } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { OutlineOverlay } from './OutlineOverlay'
import { snapContext } from './snapTargets'

type Props = {
  project: Project
  bed: Bed
  /** The outline to show (a draft while a corner is being dragged). */
  outline: readonly Point[]
  viewport: Viewport
  showLabels: boolean
  altHeld: React.RefObject<boolean>
  onDraft: (outline: Point[] | null) => void
}

/** A selected bed: its edge lengths, and handles to move and add corners (like the plot). */
export function BedOverlay({ project, bed, ...props }: Props) {
  const update = useProjectStore((s) => s.update)
  return (
    <OutlineOverlay
      {...props}
      committed={bed.shape.points}
      editing
      snapContext={(draggedCorner) =>
        snapContext(project, {
          scale: props.viewport.scale,
          snapToGrid: useUiStore.getState().snapToGrid,
          excludeObjectCorner:
            draggedCorner === undefined ? undefined : { id: bed.id, index: draggedCorner },
        })
      }
      onMoveCorner={(i, at) => update((p) => moveBedCorner(p, bed.id, i, at))}
      onInsertCorner={(i, at) => update((p) => insertBedCorner(p, bed.id, i, at))}
    />
  )
}
