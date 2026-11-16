import type { Viewport } from '../../../geometry/viewport'
import { insertObjectCorner, moveObjectCorner } from '../../../model/objects'
import type { GardenObject, Point, Project } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { OutlineOverlay } from './OutlineOverlay'
import { snapContext } from './snapTargets'

type Props = {
  project: Project
  /** A bed, or an outline or line object whose corners are being edited. */
  object: GardenObject & { shape: { type: 'polygon' | 'polyline' } }
  /** The outline to show (a draft while a corner is being dragged). */
  outline: readonly Point[]
  viewport: Viewport
  showLabels: boolean
  altHeld: React.RefObject<boolean>
  onDraft: (outline: Point[] | null) => void
}

/** An object's edge lengths, and handles to move and add corners (like the plot). */
export function CornerOverlay({ project, object, ...props }: Props) {
  const update = useProjectStore((s) => s.update)
  return (
    <OutlineOverlay
      {...props}
      committed={object.shape.points}
      closed={object.shape.type === 'polygon'}
      editing
      snapContext={(draggedCorner) =>
        snapContext(project, {
          scale: props.viewport.scale,
          snapToGrid: useUiStore.getState().snapToGrid,
          excludeObjectCorner:
            draggedCorner === undefined ? undefined : { id: object.id, index: draggedCorner },
        })
      }
      onMoveCorner={(i, at) => update((p) => moveObjectCorner(p, object.id, i, at))}
      onInsertCorner={(i, at) => update((p) => insertObjectCorner(p, object.id, i, at))}
    />
  )
}
