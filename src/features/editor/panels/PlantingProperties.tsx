import { BookOpen } from 'lucide-react'
import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { formatLength } from '../../../i18n/units'
import { findBed } from '../../../model/beds'
import { updatePlanting } from '../../../model/edit'
import { allPlants, findPlant, plantName } from '../../../model/plants'
import { MAX_PLANTED_YEAR, MIN_PLANTED_YEAR } from '../../../model/plantings'
import { PLANT_CATEGORIES, type Planting, type Project } from '../../../model/schema'
import { designWarnings, warningsByPlanting } from '../../../model/warnings'
import { useProjectStore } from '../../../store/projectStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { useLibraryStore } from '../../library/libraryStore'
import { editorActions } from '../actions'
import { usePlantView } from '../view/plantView'
import { useBedName } from './bedName'
import { NumberField } from './NumberField'
import { useWarningText } from './warningText'
import styles from './panels.module.css'

/** One or more selected plantings: species (swap), planting year, and for one: bed, warnings, notes. */
export function PlantingProperties({
  project,
  plantings,
}: {
  project: Project
  plantings: readonly Planting[]
}) {
  const { t } = useTranslation()
  const update = useProjectStore((s) => s.update)
  const notesId = useId()
  const yearId = useId()
  const bedName = useBedName(project)
  const { year: view } = usePlantView(project)
  const warningText = useWarningText(project, view)
  const ids = plantings.map((p) => p.id)
  const single = plantings.length === 1 ? plantings[0]! : undefined
  const plantIds = new Set(plantings.map((p) => p.plantId))
  const plantId = plantIds.size === 1 ? plantings[0]!.plantId : ''
  const plant = plantId ? findPlant(project, plantId) : undefined
  const years = new Set(plantings.map((p) => p.plantedYear))
  const year = years.size === 1 ? plantings[0]!.plantedYear : undefined
  const bed = single?.bedId ? findBed(project, single.bedId) : undefined
  const warnings = single
    ? (warningsByPlanting(designWarnings(project, view)).get(single.id) ?? [])
    : []

  return (
    <>
      {single && (
        <dl className={styles.facts}>
          <dt>{t('editor.properties.plant')}</dt>
          <dd data-testid="item-kind">
            {plant ? plantName(plant, currentLanguage()) : t('editor.properties.unknownPlant')}
            {plant?.names.latin && <span className={styles.latin}>{plant.names.latin}</span>}
          </dd>
          <dt>{t('editor.properties.position')}</dt>
          <dd data-testid="item-position">
            {t('editor.properties.positionValue', {
              x: formatLength(single.position.x),
              y: formatLength(single.position.y),
            })}
          </dd>
          <dt>{t('editor.planting.bed')}</dt>
          <dd data-testid="planting-bed">{bed ? bedName(bed) : t('editor.planting.noBed')}</dd>
        </dl>
      )}

      {warnings.length > 0 && (
        <ul className={styles.warningList} aria-label={t('editor.warnings.title')}>
          {warnings.map((warning, i) => (
            <li key={i} className={styles.warningItem}>
              {warningText(warning, single!.id)}
            </li>
          ))}
        </ul>
      )}

      <SpeciesSelect
        project={project}
        value={plantId}
        label={
          single
            ? t('editor.planting.species')
            : t('editor.planting.speciesMany', { count: ids.length })
        }
        onChange={(id) => editorActions.swapSpecies(ids, id)}
      />

      <div className={styles.inlineField}>
        <label className={styles.inlineLabel} htmlFor={yearId}>
          {t('editor.properties.plantedYear')}
        </label>
        <NumberField
          id={yearId}
          value={year ?? Number.NaN}
          format={String}
          label={t('editor.properties.plantedYear')}
          accept={(value) =>
            Number.isInteger(value) && value >= MIN_PLANTED_YEAR && value <= MAX_PLANTED_YEAR
          }
          onCommit={(value) => editorActions.setPlantedYear(ids, value)}
        />
      </div>

      {single && (
        <>
          <label className={controls.label} htmlFor={notesId}>
            {t('editor.properties.notes')}
          </label>
          <textarea
            id={notesId}
            className={cx(controls.input, styles.field, styles.notes)}
            value={single.notes ?? ''}
            maxLength={5000}
            rows={3}
            onChange={(e) =>
              update((p) => updatePlanting(p, single.id, { notes: e.target.value }), {
                coalesce: `notes:${single.id}`,
              })
            }
          />
        </>
      )}

      {plant && (
        <div className={styles.buttonColumn}>
          <button
            type="button"
            className={cx(controls.button, controls.small)}
            onClick={() => useLibraryStore.getState().showDetail(plant.id)}
          >
            <BookOpen size={16} aria-hidden />
            {t('editor.planting.showInLibrary')}
          </button>
        </div>
      )}
    </>
  )
}

/** All plants (built-in and own) by category, sorted by name; for swapping a species. */
function SpeciesSelect({
  project,
  value,
  label,
  onChange,
}: {
  project: Project
  /** The current plant id, or '' when the selected plantings are of several species. */
  value: string
  label: string
  onChange: (plantId: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const lang = currentLanguage()
  const customPlants = project.customPlants
  const groups = useMemo(() => {
    const custom = new Set(customPlants.map((p) => p.id))
    const plants = allPlants({ customPlants })
      .map((plant) => ({ plant, name: plantName(plant, lang) }))
      .sort((a, b) => a.name.localeCompare(b.name, lang))
    return [
      {
        key: 'custom',
        label: t('editor.library.tabs.custom'),
        plants: plants.filter((p) => custom.has(p.plant.id)),
      },
      ...PLANT_CATEGORIES.map((category) => ({
        key: category,
        label: t(`editor.library.tabs.${category}`),
        plants: plants.filter((p) => !custom.has(p.plant.id) && p.plant.category === category),
      })),
    ].filter((group) => group.plants.length > 0)
  }, [customPlants, lang, t])

  return (
    <>
      <label className={controls.label} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={cx(controls.input, styles.field)}
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      >
        {!value && <option value="">{t('editor.planting.severalSpecies')}</option>}
        {value && !findPlant(project, value) && (
          <option value={value}>{t('editor.properties.unknownPlant')}</option>
        )}
        {groups.map((group) => (
          <optgroup key={group.key} label={group.label}>
            {group.plants.map(({ plant, name }) => (
              <option key={plant.id} value={plant.id}>
                {name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </>
  )
}
