import { ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react'
import { useId, useLayoutEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../i18n'
import { allPlants, findPlant, plantName } from '../../model/plants'
import {
  FLOWER_COLORS,
  FOLIAGE_COLORS,
  PLANT_CATEGORIES,
  type Project,
  WILDLIFE,
} from '../../model/schema'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import { libraryActions } from './actions'
import styles from './library.module.css'
import { toggled, useLibraryStore } from './libraryStore'
import { ColorToggles, MonthToggles, PlantSymbol } from './parts'
import { PlantDetail } from './PlantDetail'
import { type LibraryCategory, activeFilterCount, filterPlants } from './search'

const TABS: readonly LibraryCategory[] = ['all', ...PLANT_CATEGORIES, 'custom']

/** The plant library (left panel): search and filter the plants, or show one in detail. */
export function LibraryPanel({ project }: { project: Project }) {
  const detailId = useLibraryStore((s) => s.detailId)
  const plant = detailId ? findPlant(project, detailId) : undefined
  // A plant that no longer exists (e.g. after undo) falls back to the list.
  return plant ? (
    <PlantDetail project={project} plant={plant} />
  ) : (
    <PlantBrowser project={project} />
  )
}

function PlantBrowser({ project }: { project: Project }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const titleId = useId()
  const filters = useLibraryStore((s) => s.filters)
  const setFilters = useLibraryStore((s) => s.setFilters)
  const scroller = useRef<HTMLDivElement>(null)

  const customPlants = project.customPlants
  const results = useMemo(() => {
    const custom = new Set(customPlants.map((p) => p.id))
    return filterPlants(allPlants({ customPlants }), filters, {
      lang,
      isCustom: (plant) => custom.has(plant.id),
    })
  }, [customPlants, filters, lang])
  const customIds = useMemo(() => new Set(customPlants.map((p) => p.id)), [customPlants])

  // Back from the detail card: scroll the list to where it was.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = useLibraryStore.getState().listScrollTop
  }, [])

  const open = (id: string) =>
    useLibraryStore.getState().showDetail(id, scroller.current?.scrollTop)

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div ref={scroller} className={styles.scroll}>
        <div className={styles.top}>
          <h2 id={titleId} className={styles.title}>
            {t('editor.library.title')}
          </h2>
          <div className={styles.searchBox}>
            <Search size={16} aria-hidden className={styles.searchIcon} />
            <input
              type="search"
              className={cx(controls.input, styles.search)}
              aria-label={t('editor.library.search')}
              placeholder={t('editor.library.searchPlaceholder')}
              value={filters.query}
              maxLength={100}
              onChange={(e) => setFilters({ query: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && filters.query) {
                  e.stopPropagation()
                  setFilters({ query: '' })
                }
              }}
            />
          </div>
        </div>
        <div className={styles.controls}>
          <div className={styles.tabs} role="group" aria-label={t('editor.library.categories')}>
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={styles.tab}
                aria-pressed={filters.category === tab}
                onClick={() => setFilters({ category: tab })}
              >
                {t(`editor.library.tabs.${tab}`)}
              </button>
            ))}
          </div>
          <Filters />
          <p className={styles.count} aria-live="polite" data-testid="library-count">
            {t('editor.library.results', { count: results.length })}
          </p>
        </div>

        <ul className={styles.results} aria-label={t('editor.library.resultsLabel')}>
          {results.map((plant) => (
            <li key={plant.id}>
              <button type="button" className={styles.result} onClick={() => open(plant.id)}>
                <PlantSymbol plant={plant} size={26} />
                <span className={styles.resultNames}>
                  <span className={styles.resultName}>{plantName(plant, lang)}</span>
                  <span className={styles.latin}>{plant.names.latin}</span>
                </span>
                {customIds.has(plant.id) && (
                  <span className={styles.tag}>{t('editor.library.ownTag')}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {results.length === 0 && (
          <p className={styles.empty}>
            {filters.category === 'custom' && customPlants.length === 0
              ? t('editor.library.noCustom')
              : t('editor.library.noResults')}
          </p>
        )}
      </div>

      <div className={styles.bottom}>
        <button
          type="button"
          className={cx(controls.button, controls.small)}
          onClick={libraryActions.newCustomPlant}
        >
          <Plus size={16} aria-hidden />
          {t('editor.library.newPlant')}
        </button>
      </div>
    </section>
  )
}

function Filters() {
  const { t } = useTranslation()
  const filters = useLibraryStore((s) => s.filters)
  const open = useLibraryStore((s) => s.filtersOpen)
  const { setFilters, setFiltersOpen, resetFilters } = useLibraryStore.getState()
  const count = activeFilterCount(filters)
  const panelId = useId()

  return (
    <div className={styles.filters}>
      <div className={styles.filterBar}>
        <button
          type="button"
          className={styles.filterToggle}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setFiltersOpen(!open)}
        >
          {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          {count ? t('editor.library.filtersActive', { count }) : t('editor.library.filters')}
        </button>
        {count > 0 && (
          <button type="button" className={styles.clear} onClick={resetFilters}>
            <X size={14} aria-hidden />
            {t('editor.library.clearFilters')}
          </button>
        )}
      </div>
      {open && (
        <div id={panelId} className={styles.filterPanel}>
          <h3 className={styles.filterTitle}>{t('editor.library.bloomMonths')}</h3>
          <MonthToggles
            value={filters.bloomMonths}
            label={t('editor.library.bloomMonths')}
            onChange={(bloomMonths) => setFilters({ bloomMonths })}
          />
          <h3 className={styles.filterTitle}>{t('editor.library.flowerColor')}</h3>
          <ColorToggles
            colors={FLOWER_COLORS}
            value={filters.flowerColors}
            label={t('editor.library.flowerColor')}
            onChange={(flowerColors) => setFilters({ flowerColors })}
          />
          <h3 className={styles.filterTitle}>{t('editor.library.foliageColor')}</h3>
          <ColorToggles
            colors={FOLIAGE_COLORS}
            value={filters.foliageColors}
            label={t('editor.library.foliageColor')}
            onChange={(foliageColors) => setFilters({ foliageColors })}
          />
          <h3 className={styles.filterTitle}>{t('editor.library.other')}</h3>
          <div className={styles.checks}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={filters.nativeNL}
                onChange={(e) => setFilters({ nativeNL: e.target.checked })}
              />
              {t('editor.library.nativeNL')}
            </label>
            {WILDLIFE.map((w) => (
              <label key={w} className={styles.check}>
                <input
                  type="checkbox"
                  checked={filters.wildlife.includes(w)}
                  onChange={() => setFilters({ wildlife: toggled(filters.wildlife, w) })}
                />
                {t(`editor.library.wildlife.${w}`)}
              </label>
            ))}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={filters.nonToxic}
                onChange={(e) => setFilters({ nonToxic: e.target.checked })}
              />
              {t('editor.library.nonToxic')}
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
