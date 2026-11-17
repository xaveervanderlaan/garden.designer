import { useTranslation } from 'react-i18next'
import type { LayerId, Project } from '../../model/schema'
import { BottomSheet } from './BottomSheet'
import { viewerLayers } from './viewerLayers'
import styles from './viewer.module.css'

type Props = {
  project: Project
  /** Which layers are visible now. */
  visible: Readonly<Record<LayerId, boolean>>
  onToggle(layer: LayerId): void
  onClose(): void
}

/** Show or hide layers; view state only. */
export function LayersSheet({ project, visible, onToggle, onClose }: Props) {
  const { t } = useTranslation()
  return (
    <BottomSheet title={t('viewer.layersTitle')} onClose={onClose}>
      <ul className={styles.layerList}>
        {viewerLayers(project).map((id) => (
          <li key={id}>
            <label className={styles.layerRow}>
              <input type="checkbox" checked={visible[id]} onChange={() => onToggle(id)} />
              {t(`editor.layers.names.${id}`)}
            </label>
          </li>
        ))}
      </ul>
    </BottomSheet>
  )
}
