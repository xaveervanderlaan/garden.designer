import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { perimeter, polygonArea } from '../../geometry/polygon'
import { shapePoints } from '../../geometry/frame'
import { currentLanguage } from '../../i18n'
import { formatMonths } from '../../i18n/months'
import { formatArea, formatLength } from '../../i18n/units'
import { type Bed, findBed, isBed, plantingsInBed } from '../../model/beds'
import { objectArea } from '../../model/areas'
import type { HitItem } from '../../model/hitTest'
import { materialOf } from '../../model/objectKinds'
import { findPlant, plantName } from '../../model/plants'
import type { GardenObject, Planting, Project } from '../../model/schema'
import type { PlantView } from '../../styles/plantAppearance'
import { useBedName } from '../editor/panels/bedName'
import { PlantSymbol } from '../library/parts'
import { BottomSheet } from './BottomSheet'
import styles from './viewer.module.css'

type Props = { project: Project; hit: HitItem; view: PlantView; onClose(): void }

/** The sheet with what a tap hit: a plant, a bed or other object, or the plot. */
export function ItemSheet({ project, hit, onClose }: Props) {
  const { t } = useTranslation()
  const bedName = useBedName(project)
  const lang = currentLanguage()
  let title = ''
  let body: ReactNode = null

  if (hit.type === 'plot') {
    title = t('viewer.sheet.plot')
    body = (
      <Facts
        rows={[
          [t('viewer.sheet.area'), formatArea(polygonArea(project.plot.outline))],
          [t('viewer.sheet.perimeter'), formatLength(perimeter(project.plot.outline))],
        ]}
      />
    )
  } else if (hit.type === 'planting') {
    const planting = project.plantings.find((p) => p.id === hit.id)
    if (planting) {
      const content = plantingContent(project, planting, t, lang, bedName)
      title = content.title
      body = content.body
    }
  } else {
    const object = project.objects.find((o) => o.id === hit.id)
    if (object) {
      title =
        object.label?.trim() ||
        (isBed(object) ? bedName(object) : t(`editor.objectKinds.${object.kind}`))
      body = objectBody(project, object, t, lang)
    }
  }
  return (
    <BottomSheet title={title} onClose={onClose}>
      {body}
    </BottomSheet>
  )
}

type Row = [label: string, value: ReactNode]

function Facts({ rows }: { rows: Row[] }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.fact}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function plantingContent(
  project: Project,
  planting: Planting,
  t: TFunction,
  lang: 'en' | 'nl',
  bedName: (bed: Bed) => string,
): { title: string; body: ReactNode } {
  const plant = findPlant(project, planting.plantId)
  const existing = planting.status === 'existing'
  const planted: Row = [
    t('viewer.sheet.plantedYear'),
    existing ? t('viewer.sheet.existing') : planting.plantedYear,
  ]
  if (!plant)
    return { title: t('editor.properties.unknownPlant'), body: <Facts rows={[planted]} /> }
  const name = plantName(plant, lang)
  const bed = planting.bedId ? findBed(project, planting.bedId) : undefined
  const rows: Row[] = [
    [t('viewer.sheet.type'), t(`plants.categories.${plant.category}`)],
    [
      t('viewer.sheet.size'),
      t('editor.library.detail.sizeValue', {
        height: formatLength(plant.heightM),
        spread: formatLength(plant.spreadM),
      }),
    ],
    [
      t('viewer.sheet.flowers'),
      plant.bloomMonths.length > 0
        ? formatMonths(plant.bloomMonths)
        : t('editor.library.detail.noFlowers'),
    ],
    planted,
  ]
  if (bed) rows.push([t('viewer.sheet.bed'), bedName(bed)])
  if (planting.notes?.trim()) rows.push([t('viewer.sheet.notes'), planting.notes])
  return {
    title: name,
    body: (
      <>
        <div className={styles.plantHead}>
          <PlantSymbol plant={plant} size={40} />
          {plant.names.latin && plant.names.latin !== name && <i>{plant.names.latin}</i>}
        </div>
        <Facts rows={rows} />
      </>
    ),
  }
}

function objectBody(
  project: Project,
  object: GardenObject,
  t: TFunction,
  lang: 'en' | 'nl',
): ReactNode {
  const rows: Row[] = []
  if (object.label?.trim())
    rows.push([t('viewer.sheet.kind'), t(`editor.objectKinds.${object.kind}`)])
  const area = objectArea(project, object)
  if (area !== null) rows.push([t('viewer.sheet.area'), formatArea(area)])
  if (object.shape.type === 'polyline') {
    rows.push([t('viewer.sheet.length'), formatLength(perimeter(shapePoints(object.shape), false))])
  }
  if (object.heightM !== undefined)
    rows.push([t('viewer.sheet.height'), formatLength(object.heightM)])
  const material = materialOf(object)
  if (material) rows.push([t('viewer.sheet.material'), t(`editor.materials.${material}`)])
  if (isBed(object)) {
    rows.push([t('viewer.sheet.plants'), plantingsInBed(project, object.id).length])
  }
  if (object.plantId) {
    const plant = findPlant(project, object.plantId)
    if (plant) rows.push([t('viewer.sheet.hedgePlant'), plantName(plant, lang)])
  }
  if (object.status === 'existing')
    rows.push([t('viewer.sheet.status'), t('viewer.sheet.existing')])
  if (object.notes?.trim()) rows.push([t('viewer.sheet.notes'), object.notes])
  return rows.length > 0 ? <Facts rows={rows} /> : null
}
