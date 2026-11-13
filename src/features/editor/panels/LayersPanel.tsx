import { Eye, EyeOff, Lock, LockOpen } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { LAYER_IDS, type LayerId, type Project } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { cx } from '../../../styles/cx'
import { pruneSelection } from '../actions'
import styles from './panels.module.css'

export function LayersPanel({ project }: { project: Project }) {
  const { t } = useTranslation()
  const titleId = useId()
  const update = useProjectStore((s) => s.update)

  // Layer visibility is view state: saved with the design, but not undoable.
  function toggle(layer: LayerId, field: 'visible' | 'locked') {
    update(
      (p) => ({
        ...p,
        layers: { ...p.layers, [layer]: { ...p.layers[layer], [field]: !p.layers[layer][field] } },
      }),
      { history: false },
    )
    pruneSelection()
  }

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t('editor.layers.title')}
      </h2>
      <ul className={styles.layerList}>
        {LAYER_IDS.map((layer) => {
          const { visible, locked } = project.layers[layer]
          const name = t(`editor.layers.names.${layer}`)
          return (
            <li key={layer} className={cx(styles.layerRow, !visible && styles.layerHidden)}>
              <span className={styles.layerName} title={name}>
                {name}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t(visible ? 'editor.layers.hide' : 'editor.layers.show', {
                  layer: name,
                })}
                title={t(visible ? 'editor.layers.hide' : 'editor.layers.show', { layer: name })}
                onClick={() => toggle(layer, 'visible')}
              >
                {visible ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}
              </button>
              <button
                type="button"
                className={cx(styles.iconButton, locked && styles.iconActive)}
                aria-label={t(locked ? 'editor.layers.unlock' : 'editor.layers.lock', {
                  layer: name,
                })}
                title={t(locked ? 'editor.layers.unlock' : 'editor.layers.lock', { layer: name })}
                onClick={() => toggle(layer, 'locked')}
              >
                {locked ? <Lock size={16} aria-hidden /> : <LockOpen size={16} aria-hidden />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
