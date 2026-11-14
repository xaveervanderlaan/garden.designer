import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasVegCalendar } from '../../model/plants'
import {
  AUTUMN_COLORS,
  FLOWER_COLORS,
  FOLIAGE_COLORS,
  PLANT_CATEGORIES,
  PLANT_NAME_MAX_LENGTH,
  type PlantCategory,
  SOIL_TYPES,
  SUN_LEVELS,
  WILDLIFE,
} from '../../model/schema'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import panels from '../editor/panels/panels.module.css'
import { libraryActions } from './actions'
import styles from './library.module.css'
import { type PlantForm, useLibraryStore } from './libraryStore'
import { CheckboxGroup, ColorToggles, MonthToggles } from './parts'
import { type PlantDraft, type PlantFormField, fromDraft, toDraft } from './plantForm'

/** Create or edit a custom plant. */
export function PlantFormDialog() {
  const form = useLibraryStore((s) => s.form)
  // A new key per plant, so the form starts fresh each time it opens.
  return form ? <PlantFormContent key={form.plant.id} form={form} /> : null
}

function PlantFormContent({ form }: { form: PlantForm }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<PlantDraft>(() => toDraft(form.plant))
  const [errors, setErrors] = useState<Set<PlantFormField>>(new Set())
  const titleId = useId()
  const ids = {
    nl: useId(),
    en: useId(),
    latin: useId(),
    category: useId(),
    height: useId(),
    spread: useId(),
    years: useId(),
    rowSpacing: useId(),
    inRowSpacing: useId(),
    family: useId(),
  }
  const firstInput = useRef<HTMLInputElement>(null)
  const close = () => useLibraryStore.getState().closeForm()

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    firstInput.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        useLibraryStore.getState().closeForm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [])

  function set<K extends keyof PlantDraft>(key: K, value: PlantDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const result = fromDraft(draft, form.plant)
    if (result.errors) {
      setErrors(result.errors)
      return
    }
    libraryActions.saveCustomPlant(result.plant)
  }

  const invalid = (field: PlantFormField) => errors.has(field)
  const error = (field: PlantFormField) =>
    errors.has(field) ? (
      <p className={controls.fieldError} role="alert">
        {t(`editor.library.form.errors.${field}`)}
      </p>
    ) : null
  const edible = hasVegCalendar(draft.category)

  return (
    <div className={panels.backdrop}>
      <form
        className={cx(panels.dialog, styles.formDialog)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        noValidate
        onSubmit={submit}
      >
        <div className={panels.dialogHeader}>
          <h2 id={titleId} className={panels.dialogTitle}>
            {form.isNew ? t('editor.library.form.titleNew') : t('editor.library.form.titleEdit')}
          </h2>
          <button
            type="button"
            className={panels.iconButton}
            aria-label={t('common.cancel')}
            onClick={close}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <h3 className={styles.formSection}>{t('editor.library.form.names')}</h3>
        <div className={styles.formGrid}>
          <TextField
            id={ids.nl}
            inputRef={firstInput}
            label={t('editor.library.form.nameNl')}
            value={draft.nl}
            invalid={invalid('name')}
            onChange={(v) => set('nl', v)}
          />
          <TextField
            id={ids.en}
            label={t('editor.library.form.nameEn')}
            value={draft.en}
            invalid={invalid('name')}
            onChange={(v) => set('en', v)}
          />
          <TextField
            id={ids.latin}
            label={t('editor.library.form.nameLatin')}
            value={draft.latin}
            invalid={invalid('name')}
            italic
            onChange={(v) => set('latin', v)}
          />
          <div>
            <label className={controls.label} htmlFor={ids.category}>
              {t('editor.library.form.category')}
            </label>
            <select
              id={ids.category}
              className={cx(controls.input, styles.formInput)}
              value={draft.category}
              onChange={(e) => set('category', e.target.value as PlantCategory)}
            >
              {PLANT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`plants.categories.${c}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error('name') ?? <p className={styles.formHint}>{t('editor.library.form.namesHint')}</p>}

        <h3 className={styles.formSection}>{t('editor.library.form.size')}</h3>
        <div className={styles.formGrid3}>
          <TextField
            id={ids.height}
            label={t('editor.library.form.height')}
            value={draft.height}
            invalid={invalid('height')}
            decimal
            onChange={(v) => set('height', v)}
          />
          <TextField
            id={ids.spread}
            label={t('editor.library.form.spread')}
            value={draft.spread}
            invalid={invalid('spread')}
            decimal
            onChange={(v) => set('spread', v)}
          />
          <TextField
            id={ids.years}
            label={t('editor.library.form.yearsToMature')}
            value={draft.years}
            invalid={invalid('years')}
            decimal
            onChange={(v) => set('years', v)}
          />
        </div>
        {error('height')}
        {error('spread')}
        {error('years')}
        <p className={styles.formHint}>{t('editor.library.form.spreadHint')}</p>

        <h3 className={styles.formSection}>{t('editor.library.form.growing')}</h3>
        <div className={styles.formGrid}>
          <div>
            <CheckboxGroup
              label={t('editor.library.form.light')}
              options={SUN_LEVELS.map((s) => ({ value: s, label: t(`plants.sun.${s}`) }))}
              value={draft.sun}
              invalid={invalid('light')}
              onChange={(v) => set('sun', v)}
            />
            {error('light')}
          </div>
          <div>
            <CheckboxGroup
              label={t('editor.library.form.soil')}
              options={SOIL_TYPES.map((s) => ({ value: s, label: t(`plants.soil.${s}`) }))}
              value={draft.soil}
              invalid={invalid('soil')}
              onChange={(v) => set('soil', v)}
            />
            {error('soil')}
          </div>
        </div>
        <div className={styles.checks}>
          <Checkbox
            label={t('editor.library.form.drought')}
            checked={draft.droughtTolerant}
            onChange={(v) => set('droughtTolerant', v)}
          />
          <Checkbox
            label={t('editor.library.form.evergreen')}
            checked={draft.evergreen}
            onChange={(v) => set('evergreen', v)}
          />
        </div>

        <h3 className={styles.formSection}>{t('editor.library.form.flowering')}</h3>
        <p className={styles.formLabel}>{t('editor.library.form.bloomMonths')}</p>
        <MonthToggles
          value={draft.bloomMonths}
          label={t('editor.library.form.bloomMonths')}
          onChange={(v) => set('bloomMonths', v)}
        />
        <p className={styles.formLabel}>{t('editor.library.form.flowerColors')}</p>
        <ColorToggles
          colors={FLOWER_COLORS}
          value={draft.flowerColors}
          label={t('editor.library.form.flowerColors')}
          onChange={(v) => set('flowerColors', v)}
        />
        <p className={styles.formHint}>{t('editor.library.form.flowerColorsHint')}</p>
        <p className={styles.formLabel}>{t('editor.library.form.foliageColor')}</p>
        <ColorToggles
          colors={FOLIAGE_COLORS}
          value={[draft.foliageColor]}
          label={t('editor.library.form.foliageColor')}
          multiple={false}
          onChange={([v]) => v && set('foliageColor', v)}
        />
        <p className={styles.formLabel}>{t('editor.library.form.autumnColor')}</p>
        <div className={styles.autumnRow}>
          <button
            type="button"
            className={cx(styles.tab, styles.noneButton)}
            aria-pressed={draft.autumnColor === null}
            onClick={() => set('autumnColor', null)}
          >
            {t('editor.library.form.noAutumnColor')}
          </button>
          <ColorToggles
            colors={AUTUMN_COLORS}
            value={draft.autumnColor ? [draft.autumnColor] : []}
            label={t('editor.library.form.autumnColor')}
            multiple={false}
            onChange={([v]) => set('autumnColor', v ?? null)}
          />
        </div>

        <h3 className={styles.formSection}>{t('editor.library.form.wildlifeTitle')}</h3>
        <CheckboxGroup
          label={t('editor.library.detail.wildlife')}
          options={WILDLIFE.map((w) => ({ value: w, label: t(`plants.wildlife.${w}`) }))}
          value={draft.wildlife}
          onChange={(v) => set('wildlife', v)}
        />
        <div className={styles.checks}>
          <Checkbox
            label={t('editor.library.form.native')}
            checked={draft.nativeNL}
            onChange={(v) => set('nativeNL', v)}
          />
          <Checkbox
            label={t('editor.library.form.toxic')}
            checked={draft.toxic}
            onChange={(v) => set('toxic', v)}
          />
        </div>

        {edible && (
          <>
            <h3 className={styles.formSection}>{t('editor.library.form.calendar')}</h3>
            {(['sowIndoors', 'sowOutdoors', 'plantOut', 'harvest'] as const).map((key) => (
              <div key={key}>
                <p className={styles.formLabel}>{t(`editor.library.detail.${key}`)}</p>
                <MonthToggles
                  value={draft[key]}
                  label={t(`editor.library.detail.${key}`)}
                  onChange={(v) => set(key, v)}
                />
              </div>
            ))}
            <div className={styles.formGrid3}>
              <TextField
                id={ids.rowSpacing}
                label={t('editor.library.form.rowSpacing')}
                value={draft.rowSpacing}
                invalid={invalid('spacing')}
                decimal
                onChange={(v) => set('rowSpacing', v)}
              />
              <TextField
                id={ids.inRowSpacing}
                label={t('editor.library.form.inRowSpacing')}
                value={draft.inRowSpacing}
                invalid={invalid('spacing')}
                decimal
                onChange={(v) => set('inRowSpacing', v)}
              />
              <TextField
                id={ids.family}
                label={t('editor.library.form.family')}
                value={draft.family}
                italic
                onChange={(v) => set('family', v)}
              />
            </div>
            {error('spacing')}
          </>
        )}

        {errors.size > 0 && (
          <p className={controls.fieldError}>{t('editor.library.form.errors.summary')}</p>
        )}
        <div className={panels.dialogActions}>
          <button type="button" className={cx(controls.button, controls.quiet)} onClick={close}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={cx(controls.button, controls.primary)}>
            {form.isNew ? t('editor.library.form.create') : t('editor.library.form.save')}
          </button>
        </div>
      </form>
    </div>
  )
}

function TextField({
  id,
  label,
  value,
  invalid,
  decimal,
  italic,
  inputRef,
  onChange,
}: {
  id: string
  label: string
  value: string
  invalid?: boolean
  decimal?: boolean
  italic?: boolean
  inputRef?: React.Ref<HTMLInputElement>
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className={controls.label} htmlFor={id}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        className={cx(controls.input, styles.formInput, italic && styles.italic)}
        value={value}
        maxLength={PLANT_NAME_MAX_LENGTH}
        inputMode={decimal ? 'decimal' : undefined}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
