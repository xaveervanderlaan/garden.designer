import { ClipboardCopy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { findBed } from '../../../model/beds'
import { validSelection } from '../../../model/edit'
import { plantName } from '../../../model/plants'
import {
  type PlantingListGroup,
  type PlantingListRow,
  plantingList,
  plantingListByBed,
} from '../../../model/plantingList'
import type { Project } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { PlantSymbol } from '../../library/parts'
import { useBedName } from './bedName'
import { CollapsibleSection } from './CollapsibleSection'
import { plantingListText } from './plantingListText'
import styles from './panels.module.css'

type Grouping = 'total' | 'bed'
type CopyState = 'idle' | 'copied' | 'failed'

/** Copies text to the clipboard; falls back to a hidden text field where the API is missing. */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const field = document.createElement('textarea')
  field.value = text
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  field.select()
  const ok = document.execCommand('copy')
  field.remove()
  if (!ok) throw new Error('Copy failed')
}

/** How many plants of each species the design has, in total or per bed. */
export function PlantingListPanel({ project }: { project: Project }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [grouping, setGrouping] = useState<Grouping>('total')
  const [copy, setCopy] = useState<CopyState>('idle')
  const rows = useMemo(() => plantingList(project), [project])
  const groups = useMemo(() => plantingListByBed(project), [project])
  const bedName = useBedName(project)
  const total = project.plantings.length

  useEffect(() => {
    if (copy === 'idle') return
    const timer = setTimeout(() => setCopy('idle'), 2500)
    return () => clearTimeout(timer)
  }, [copy])

  const groupName = (group: PlantingListGroup) => {
    const bed = group.bedId ? findBed(project, group.bedId) : undefined
    return bed ? bedName(bed) : t('editor.plantingList.noBed')
  }

  /** Selects the plants of a species (in one bed, or anywhere). */
  function select(plantId: string, bedId?: string | null) {
    const ids = project.plantings
      .filter(
        (p) =>
          p.plantId === plantId &&
          (bedId === undefined ||
            (bedId === null ? !p.bedId || !findBed(project, p.bedId) : p.bedId === bedId)),
      )
      .map((p) => p.id)
    const ui = useUiStore.getState()
    ui.setTool('select')
    ui.setSelection(validSelection(project, ids))
  }

  function copyList() {
    const text = plantingListText({
      title: project.name,
      rows,
      groups: grouping === 'bed' ? groups : undefined,
      groupName,
      t,
      lang,
    })
    copyText(text).then(
      () => setCopy('copied'),
      () => setCopy('failed'),
    )
  }

  const renderRows = (list: readonly PlantingListRow[], bedId?: string | null) => (
    <ul className={styles.rowList}>
      {list.map((row) => {
        const name = row.plant ? plantName(row.plant, lang) : t('editor.properties.unknownPlant')
        return (
          <li key={row.plantId}>
            <button
              type="button"
              className={styles.rowButton}
              title={t('editor.plantingList.selectHint')}
              data-testid="planting-row"
              onClick={() => select(row.plantId, bedId)}
            >
              <span className={styles.code}>{row.code}</span>
              {row.plant && <PlantSymbol plant={row.plant} size={18} />}
              <span className={styles.rowText}>{name}</span>
              <span className={styles.rowCount} data-testid="planting-count">
                {row.count}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <CollapsibleSection title={t('editor.plantingList.title')} badge={total || null}>
      {total === 0 ? (
        <p className={styles.hint}>{t('editor.plantingList.empty')}</p>
      ) : (
        <>
          <div
            className={styles.segmented}
            role="group"
            aria-label={t('editor.plantingList.grouping')}
          >
            {(['total', 'bed'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={styles.segment}
                aria-pressed={grouping === value}
                onClick={() => setGrouping(value)}
              >
                {value === 'total'
                  ? t('editor.plantingList.whole')
                  : t('editor.plantingList.perBed')}
              </button>
            ))}
          </div>

          <div data-testid="planting-list">
            {grouping === 'total'
              ? renderRows(rows)
              : groups.map((group) => (
                  <div key={group.bedId ?? 'none'} className={styles.listGroup}>
                    <h3 className={styles.listGroupTitle}>
                      <span className={styles.rowText}>{groupName(group)}</span>
                      <span className={styles.rowCount}>{group.total}</span>
                    </h3>
                    {renderRows(group.rows, group.bedId)}
                  </div>
                ))}
          </div>

          <div className={styles.listFooter}>
            <span data-testid="planting-total">
              {t('editor.plantingList.total', { count: total })}
            </span>
            <button
              type="button"
              className={cx(controls.button, controls.small)}
              onClick={copyList}
            >
              <ClipboardCopy size={16} aria-hidden />
              {t('editor.plantingList.copy')}
            </button>
          </div>
          <p className={styles.smallHint} aria-live="polite">
            {copy === 'copied'
              ? t('editor.plantingList.copied')
              : copy === 'failed'
                ? t('editor.plantingList.copyFailed')
                : ''}
          </p>
        </>
      )}
    </CollapsibleSection>
  )
}
