import { Trash2, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { polygonArea } from '../../../geometry/polygon'
import { currentLanguage } from '../../../i18n'
import { formatArea, formatDecimal, parseNumber } from '../../../i18n/units'
import { MUST_HAVE_UNITS, baseRefs, setBriefArea } from '../../../model/brief'
import { newId } from '../../../model/ids'
import { allPlants, findPlant, plantName } from '../../../model/plants'
import { hasPlot } from '../../../model/plot'
import {
  BRIEF_PRIORITIES,
  BRIEF_STYLES,
  type Brief,
  FLOWER_COLORS,
  MAINTENANCE_LEVELS,
  MUST_HAVE_KINDS,
  type MustHave,
  type Project,
} from '../../../model/schema'
import { edgeName } from '../../../proposals/prompt'
import { useProjectStore } from '../../../store/projectStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { matchesQuery, searchRank } from '../../library/search'
import { editorActions } from '../actions'
import panels from '../panels/panels.module.css'
import styles from './ideas.module.css'

type Props = {
  project: Project
  draft: Brief
  dirty: boolean
  onChange: (brief: Brief) => void
  onSave: () => void
  onNext: () => void
}

const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

/** What the proposals should be: style, must-haves, plants, the area and what may change. */
export function BriefForm({ project, draft, dirty, onChange, onSave, onNext }: Props) {
  const { t } = useTranslation()
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) =>
    onChange({ ...draft, [key]: value })
  const outline = project.plot.outline
  const area = project.brief?.area
  const notesId = useId()
  const countId = useId()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      <p className={styles.intro}>{t('proposals.intro')}</p>

      <fieldset className={styles.group}>
        <legend>{t('proposals.brief.styles.label')}</legend>
        <div className={styles.choices}>
          {BRIEF_STYLES.map((style) => (
            <label key={style}>
              <input
                type="checkbox"
                checked={draft.styles.includes(style)}
                onChange={() => set('styles', toggle(draft.styles, style))}
              />
              {t(`proposals.brief.styles.${style}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <MustHaves value={draft.mustHaves} onChange={(v) => set('mustHaves', v)} />

      <fieldset className={styles.group}>
        <legend>{t('proposals.brief.maintenance.label')}</legend>
        <div className={styles.choices}>
          {MAINTENANCE_LEVELS.map((level) => (
            <label key={level}>
              <input
                type="radio"
                name="brief-maintenance"
                checked={draft.maintenance === level}
                onChange={() => set('maintenance', level)}
              />
              {t(`proposals.brief.maintenance.${level}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t('proposals.brief.priorities.label')}</legend>
        <div className={styles.choices}>
          {BRIEF_PRIORITIES.map((priority) => (
            <label key={priority}>
              <input
                type="checkbox"
                checked={draft.priorities.includes(priority)}
                onChange={() => set('priorities', toggle(draft.priorities, priority))}
              />
              {t(`proposals.brief.priorities.${priority}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t('proposals.brief.colours')}</legend>
        <div className={styles.choices}>
          {FLOWER_COLORS.map((colour) => (
            <label key={colour}>
              <input
                type="checkbox"
                checked={draft.colours.includes(colour)}
                onChange={() => set('colours', toggle(draft.colours, colour))}
              />
              {t(`plants.colors.${colour}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <PlantPicker
        project={project}
        label={t('proposals.brief.include')}
        value={draft.includePlants}
        onChange={(v) => set('includePlants', v)}
      />
      <PlantPicker
        project={project}
        label={t('proposals.brief.avoid')}
        value={draft.avoidPlants}
        onChange={(v) => set('avoidPlants', v)}
      />
      <label className={cx(styles.check, styles.group)}>
        <input
          type="checkbox"
          checked={draft.avoidToxic}
          onChange={(e) => set('avoidToxic', e.target.checked)}
        />
        {t('proposals.brief.avoidToxic')}
      </label>

      {hasPlot(project) && (
        <fieldset className={styles.group}>
          <legend>{t('proposals.brief.screening')}</legend>
          <div className={styles.choices}>
            {outline.map((_, i) => (
              <label key={i}>
                <input
                  type="checkbox"
                  checked={draft.screening.includes(i)}
                  onChange={() =>
                    set(
                      'screening',
                      toggle(draft.screening, i).sort((a, b) => a - b),
                    )
                  }
                />
                {t('proposals.brief.edge', { edge: edgeName(outline.length, i) })}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className={styles.group}>
        <div className={styles.groupTitle}>{t('proposals.brief.area.label')}</div>
        <div className={styles.row}>
          <span className={styles.grow} data-testid="brief-area">
            {area
              ? t('proposals.brief.area.drawn', { area: formatArea(polygonArea(area), 1) })
              : t('proposals.brief.area.whole')}
          </span>
          <button
            type="button"
            className={cx(controls.button, controls.small)}
            disabled={!hasPlot(project)}
            onClick={() => {
              onSave()
              editorActions.startDesignArea()
            }}
          >
            {area ? t('proposals.brief.area.redraw') : t('proposals.brief.area.draw')}
          </button>
          {area && (
            <button
              type="button"
              className={cx(controls.button, controls.small, controls.quiet)}
              onClick={() => useProjectStore.getState().update((p) => setBriefArea(p, null))}
            >
              {t('proposals.brief.area.clear')}
            </button>
          )}
        </div>
      </div>

      <MayChange project={project} value={draft.mayChange} onChange={(v) => set('mayChange', v)} />

      <label className={controls.label} htmlFor={notesId}>
        {t('proposals.brief.notes')}
      </label>
      <textarea
        id={notesId}
        className={cx(controls.input, styles.textarea)}
        maxLength={5000}
        value={draft.notes}
        onChange={(e) => set('notes', e.target.value)}
      />

      <div className={cx(styles.row, styles.group)}>
        <label htmlFor={countId}>{t('proposals.brief.count')}</label>
        <input
          id={countId}
          type="number"
          className={cx(controls.input, styles.sizeInput)}
          min={1}
          max={20}
          value={draft.count}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value))
            if (n >= 1 && n <= 20) set('count', n)
          }}
        />
      </div>
      <fieldset className={styles.group}>
        <legend>{t('proposals.brief.variety.label')}</legend>
        <div className={styles.choices}>
          {(['varied', 'variations'] as const).map((variety) => (
            <label key={variety}>
              <input
                type="radio"
                name="brief-variety"
                checked={draft.variety === variety}
                onChange={() => set('variety', variety)}
              />
              {t(`proposals.brief.variety.${variety}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={panels.dialogActions}>
        <span className={styles.status} role="status">
          {dirty ? '' : t('proposals.brief.saved')}
        </span>
        <button type="submit" className={cx(controls.button, controls.quiet)} disabled={!dirty}>
          {t('proposals.brief.save')}
        </button>
        <button type="button" className={cx(controls.button, controls.primary)} onClick={onNext}>
          {t('proposals.brief.next')}
        </button>
      </div>
    </form>
  )
}

/** Must-have rows: what, an optional size (m² or a number) and an optional place. */
function MustHaves({ value, onChange }: { value: MustHave[]; onChange: (v: MustHave[]) => void }) {
  const { t } = useTranslation()
  const replace = (id: string, next: MustHave) =>
    onChange(value.map((m) => (m.id === id ? next : m)))
  return (
    <fieldset className={styles.group}>
      <legend>{t('proposals.brief.mustHaves.label')}</legend>
      {value.map((item) => (
        <div key={item.id} className={styles.row}>
          <select
            className={controls.input}
            aria-label={t('proposals.brief.mustHaves.kind')}
            value={item.kind}
            onChange={(e) =>
              replace(item.id, { ...item, kind: e.target.value as MustHave['kind'] })
            }
          >
            {MUST_HAVE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`proposals.brief.mustHaves.kinds.${kind}`)}
              </option>
            ))}
          </select>
          <SizeField item={item} onChange={(next) => replace(item.id, next)} />
          <span>{t(`proposals.brief.mustHaves.${MUST_HAVE_UNITS[item.kind]}`)}</span>
          <input
            className={cx(controls.input, styles.grow)}
            aria-label={t('proposals.brief.mustHaves.place')}
            placeholder={t('proposals.brief.mustHaves.place')}
            maxLength={200}
            value={item.place ?? ''}
            onChange={(e) => {
              const { place: _, ...rest } = item
              replace(item.id, e.target.value ? { ...rest, place: e.target.value } : rest)
            }}
          />
          <button
            type="button"
            className={panels.iconButton}
            aria-label={t('proposals.brief.mustHaves.remove')}
            onClick={() => onChange(value.filter((m) => m.id !== item.id))}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className={cx(controls.button, controls.small)}
        disabled={value.length >= 30}
        onClick={() => onChange([...value, { id: newId(), kind: 'terrace' }])}
      >
        {t('proposals.brief.mustHaves.add')}
      </button>
    </fieldset>
  )
}

function SizeField({ item, onChange }: { item: MustHave; onChange: (next: MustHave) => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(() => (item.size ? formatDecimal(item.size) : ''))
  return (
    <input
      className={cx(controls.input, styles.sizeInput)}
      inputMode="decimal"
      aria-label={t('proposals.brief.mustHaves.size')}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const size = parseNumber(e.target.value)
        const { size: _, ...rest } = item
        onChange(size !== undefined && size > 0 ? { ...rest, size } : rest)
      }}
    />
  )
}

/** Picks plants by name: a search field with matches below, and the chosen ones as chips. */
function PlantPicker({
  project,
  label,
  value,
  onChange,
}: {
  project: Project
  label: string
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [query, setQuery] = useState('')
  const plants = useMemo(() => allPlants(project), [project])
  const matches = useMemo(() => {
    if (!query.trim()) return []
    return plants
      .filter((p) => !value.includes(p.id) && matchesQuery(p, query))
      .sort((a, b) => searchRank(a, query, lang) - searchRank(b, query, lang))
      .slice(0, 6)
  }, [plants, query, value, lang])
  const name = (id: string) => {
    const plant = findPlant(project, id)
    return plant ? plantName(plant, lang) : id
  }
  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>{label}</div>
      {value.length > 0 && (
        <ul className={styles.chips}>
          {value.map((id) => (
            <li key={id} className={styles.chip}>
              {name(id)}
              <button
                type="button"
                aria-label={t('proposals.brief.removePlant', { name: name(id) })}
                onClick={() => onChange(value.filter((v) => v !== id))}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        type="search"
        className={controls.input}
        aria-label={t('proposals.brief.search', { list: label })}
        placeholder={t('proposals.brief.searchPlaceholder')}
        value={query}
        disabled={value.length >= 50}
        onChange={(e) => setQuery(e.target.value)}
      />
      {matches.length > 0 && (
        <ul className={styles.results}>
          {matches.map((plant) => (
            <li key={plant.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...value, plant.id])
                  setQuery('')
                }}
              >
                {t('proposals.brief.addPlant', { name: plantName(plant, lang) })}{' '}
                <span className={styles.latin}>{plant.names.latin}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The design's items with their short refs; ticked ones may be changed or removed. */
function MayChange({
  project,
  value,
  onChange,
}: {
  project: Project
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const items = useMemo(() => {
    const { refOf } = baseRefs(project)
    const objects = project.objects
      .filter((o) => refOf.has(o.id))
      .map((o) => ({
        id: o.id,
        ref: refOf.get(o.id)!,
        name: o.label || t(`editor.objectKinds.${o.kind}`),
      }))
    const plantings = project.plantings
      .filter((p) => refOf.has(p.id))
      .map((p) => {
        const plant = findPlant(project, p.plantId)
        return { id: p.id, ref: refOf.get(p.id)!, name: plant ? plantName(plant, lang) : p.plantId }
      })
    return [...objects, ...plantings]
  }, [project, lang, t])
  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>{t('proposals.brief.mayChange')}</div>
      {items.length === 0 ? (
        <p className={panels.smallHint}>{t('proposals.brief.noItems')}</p>
      ) : (
        <>
          <p className={panels.smallHint}>{t('proposals.brief.mayChangeHint')}</p>
          <ul className={styles.itemList}>
            {items.map((item) => (
              <li key={item.id}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={value.includes(item.id)}
                    onChange={() => onChange(toggle(value, item.id))}
                  />
                  {t('proposals.brief.item', { ref: item.ref, name: item.name })}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
