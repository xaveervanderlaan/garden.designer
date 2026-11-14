import { ArrowLeft, Copy, Pencil, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../i18n'
import { formatDecimal, formatLength } from '../../i18n/units'
import { isCustomPlant, plantName, plantingCount, soilSuitability } from '../../model/plants'
import type { Plant, Project } from '../../model/schema'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import { PLANT_COLOR_HEX } from '../../styles/plantColors'
import { symbolColor } from '../../styles/plantSymbols'
import { libraryActions } from './actions'
import styles from './library.module.css'
import { useLibraryStore } from './libraryStore'
import { ColorChip, MonthStrip, PlantSymbol } from './parts'

/** Everything about one plant, with how well it suits the design's soil. */
export function PlantDetail({ project, plant }: { project: Project; plant: Plant }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const titleId = useId()
  const custom = isCustomPlant(project, plant.id)
  const name = plantName(plant, lang)
  const otherName = plant.names[lang === 'en' ? 'nl' : 'en']
  const soil = project.settings.soil
  const suitability = soilSuitability(plant, soil)
  const soilLabel = t(`plants.soil.${soil}`).toLowerCase()
  const yesNo = (value: boolean) =>
    value ? t('editor.library.detail.yes') : t('editor.library.detail.no')
  const flowerColor = plant.flowerColors[0]
  const back = () => useLibraryStore.getState().showDetail(null)

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.detailScroll}>
        <button type="button" className={styles.back} onClick={back}>
          <ArrowLeft size={16} aria-hidden />
          {t('editor.library.back')}
        </button>

        <div className={styles.detailHeader}>
          <figure className={styles.symbolFigure}>
            <PlantSymbol plant={plant} size={64} />
            <figcaption className={styles.visuallyHidden}>{t('editor.library.symbol')}</figcaption>
          </figure>
          <div className={styles.detailNames}>
            <h2 id={titleId} className={styles.plantTitle}>
              {name}
            </h2>
            {otherName && otherName !== name && <p className={styles.otherName}>{otherName}</p>}
            {plant.names.latin && plant.names.latin !== name && (
              <p className={styles.latin}>{plant.names.latin}</p>
            )}
          </div>
        </div>

        <ul className={styles.badges}>
          <li className={styles.badge}>{t(`plants.categories.${plant.category}`)}</li>
          {custom && <li className={styles.badge}>{t('editor.library.ownPlant')}</li>}
          {!custom && !plant.verified && (
            <li
              className={cx(styles.badge, styles.badgeWarning)}
              title={t('editor.library.unverifiedHint')}
            >
              {t('editor.library.unverified')}
            </li>
          )}
        </ul>

        <p
          className={suitability === 'suited' ? styles.soilGood : styles.soilWarning}
          data-testid="soil-suitability"
        >
          {suitability === 'suited'
            ? t('editor.library.detail.soilSuited', { soil: soilLabel })
            : suitability === 'dry'
              ? t('editor.library.detail.soilDry')
              : t('editor.library.detail.soilUnsuited', { soil: soilLabel })}
        </p>

        <dl className={styles.facts}>
          <dt>{t('editor.library.detail.size')}</dt>
          <dd>
            {t('editor.library.detail.sizeValue', {
              height: formatLength(plant.heightM),
              spread: formatLength(plant.spreadM),
            })}
          </dd>
          <dt>{t('editor.library.detail.mature')}</dt>
          <dd>
            {t('editor.library.detail.years', {
              count: plant.yearsToMature,
              years: formatDecimal(plant.yearsToMature, 1),
            })}
          </dd>
          <dt>{t('editor.library.detail.leaves')}</dt>
          <dd>
            {plant.evergreen
              ? t('editor.library.detail.evergreen')
              : t('editor.library.detail.deciduous')}
          </dd>
          <dt>{t('editor.library.detail.light')}</dt>
          <dd>
            <Chips items={plant.sun.map((s) => t(`plants.sun.${s}`))} />
          </dd>
          <dt>{t('editor.library.detail.soil')}</dt>
          <dd>
            <Chips items={plant.soil.map((s) => t(`plants.soil.${s}`))} />
          </dd>
          <dt>{t('editor.library.detail.drought')}</dt>
          <dd>{yesNo(plant.droughtTolerant)}</dd>
          <dt>{t('editor.library.detail.flowers')}</dt>
          <dd>
            {plant.bloomMonths.length ? (
              <>
                <MonthStrip
                  months={plant.bloomMonths}
                  label={t('editor.library.detail.flowers')}
                  color={flowerColor ? PLANT_COLOR_HEX[flowerColor] : symbolColor(plant)}
                />
                <span className={styles.colorList}>
                  {plant.flowerColors.map((c) => (
                    <ColorChip key={c} color={c} />
                  ))}
                </span>
              </>
            ) : (
              t('editor.library.detail.noFlowers')
            )}
          </dd>
          <dt>{t('editor.library.detail.leafColor')}</dt>
          <dd>
            <ColorChip color={plant.foliageColor} />
          </dd>
          {plant.autumnColor && (
            <>
              <dt>{t('editor.library.detail.autumnColor')}</dt>
              <dd>
                <ColorChip color={plant.autumnColor} />
              </dd>
            </>
          )}
          <dt>{t('editor.library.detail.native')}</dt>
          <dd>{yesNo(plant.nativeNL)}</dd>
          <dt>{t('editor.library.detail.wildlife')}</dt>
          <dd>
            {plant.wildlife.length ? (
              <Chips items={plant.wildlife.map((w) => t(`plants.wildlife.${w}`))} />
            ) : (
              t('editor.library.detail.none')
            )}
          </dd>
          <dt>{t('editor.library.detail.toxic')}</dt>
          <dd>
            {plant.toxic ? t('editor.library.detail.toxicValue') : t('editor.library.detail.no')}
          </dd>
        </dl>

        {plant.veg && (
          <>
            <h3 className={styles.sectionTitle}>{t('editor.library.detail.calendar')}</h3>
            <dl className={styles.facts}>
              {(['sowIndoors', 'sowOutdoors', 'plantOut', 'harvest'] as const).map((key) => (
                <CalendarRow
                  key={key}
                  months={plant.veg![key]}
                  label={t(`editor.library.detail.${key}`)}
                />
              ))}
              <dt>{t('editor.library.detail.spacing')}</dt>
              <dd>
                {t('editor.library.detail.spacingValue', {
                  row: formatLength(plant.veg.rowSpacingM),
                  inRow: formatLength(plant.veg.inRowSpacingM),
                })}
              </dd>
              {plant.veg.family && (
                <>
                  <dt>{t('editor.library.detail.family')}</dt>
                  <dd className={styles.latin}>{plant.veg.family}</dd>
                </>
              )}
            </dl>
          </>
        )}

        {custom ? (
          <CustomPlantActions project={project} plant={plant} name={name} />
        ) : (
          <div className={styles.actions}>
            <button
              type="button"
              className={cx(controls.button, controls.small)}
              onClick={() => libraryActions.copyAsCustom(plant)}
            >
              <Copy size={16} aria-hidden />
              {t('editor.library.detail.copyAsCustom')}
            </button>
            <p className={styles.hint}>{t('editor.library.detail.copyHint')}</p>
          </div>
        )}
      </div>
    </section>
  )
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className={styles.chips}>
      {items.map((item) => (
        <li key={item} className={styles.chip}>
          {item}
        </li>
      ))}
    </ul>
  )
}

function CalendarRow({ months, label }: { months: readonly number[]; label: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        <MonthStrip months={months} label={label} />
      </dd>
    </>
  )
}

function CustomPlantActions({
  project,
  plant,
  name,
}: {
  project: Project
  plant: Plant
  name: string
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const used = plantingCount(project, plant.id)

  if (confirming) {
    return (
      <div
        className={styles.confirm}
        role="alertdialog"
        aria-label={t('editor.library.detail.delete')}
      >
        <p>
          {used
            ? t('editor.library.detail.deleteConfirmUsed', { name, count: used })
            : t('editor.library.detail.deleteConfirm', { name })}
        </p>
        <div className={styles.actionRow}>
          <button
            type="button"
            className={cx(controls.button, controls.small, controls.danger)}
            onClick={() => libraryActions.deleteCustomPlant(plant.id)}
          >
            {t('editor.library.detail.delete')}
          </button>
          <button
            type="button"
            className={cx(controls.button, controls.small, controls.quiet)}
            onClick={() => setConfirming(false)}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cx(styles.actions, styles.actionRow)}>
      <button
        type="button"
        className={cx(controls.button, controls.small)}
        onClick={() => libraryActions.editCustomPlant(plant)}
      >
        <Pencil size={16} aria-hidden />
        {t('editor.library.detail.edit')}
      </button>
      <button
        type="button"
        className={cx(controls.button, controls.small)}
        onClick={() => libraryActions.copyAsCustom(plant)}
      >
        <Copy size={16} aria-hidden />
        {t('editor.library.detail.copyAsCustom')}
      </button>
      <button
        type="button"
        className={cx(controls.button, controls.small, styles.deleteButton)}
        onClick={() => setConfirming(true)}
      >
        <Trash2 size={16} aria-hidden />
        {t('editor.library.detail.delete')}
      </button>
    </div>
  )
}
