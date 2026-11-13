import { EyeOff, ImagePlus, ImageUp, Lock, Ruler, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { displayRotation } from '../../../geometry/calibration'
import { formatLength, formatPercent } from '../../../i18n/units'
import type { Background, Project } from '../../../model/schema'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import { NumberField } from './NumberField'
import styles from './panels.module.css'

const icon = { size: 16, 'aria-hidden': true } as const

/** With nothing selected: import a site plan, or get back to the one there is. */
export function SitePlanStart({ project }: { project: Project }) {
  const { t } = useTranslation()
  return (
    <>
      <h3 className={styles.sectionTitle}>{t('editor.sitePlan.title')}</h3>
      {project.background ? (
        <div className={styles.buttonColumn}>
          <button
            type="button"
            className={cx(controls.button, controls.small)}
            onClick={editorActions.selectSitePlan}
          >
            {t('editor.sitePlan.edit')}
          </button>
        </div>
      ) : (
        <>
          <p className={styles.hint}>{t('editor.sitePlan.importHint')}</p>
          <div className={styles.buttonColumn}>
            <button
              type="button"
              className={cx(controls.button, controls.small)}
              onClick={editorActions.importSitePlan}
            >
              <ImagePlus {...icon} />
              {t('editor.sitePlan.import')}
            </button>
          </div>
        </>
      )}
    </>
  )
}

/** The selected site plan: its scale, rotation and opacity, and what you can do with it. */
export function SitePlanProperties({ background }: { background: Background }) {
  const { t } = useTranslation()
  const opacityId = useId()
  const { fileName, page, calibration, metresPerPixel: mpp } = background

  return (
    <>
      <dl className={styles.facts}>
        <dt>{t('editor.properties.kind')}</dt>
        <dd data-testid="item-kind">{t('editor.sitePlan.title')}</dd>
        {fileName && (
          <>
            <dt>{t('editor.sitePlan.file')}</dt>
            <dd className={styles.fileName} title={fileName}>
              {page ? t('editor.sitePlan.fileAndPage', { file: fileName, page }) : fileName}
            </dd>
          </>
        )}
        <dt>{t('editor.sitePlan.size')}</dt>
        <dd data-testid="site-plan-size">
          {t('editor.sitePlan.sizeValue', {
            width: formatLength(background.widthPx * mpp, 1),
            depth: formatLength(background.heightPx * mpp, 1),
          })}
        </dd>
        {calibration && (
          <>
            <dt>{t('editor.sitePlan.calibratedWith')}</dt>
            <dd data-testid="site-plan-calibration">{formatLength(calibration.distanceM)}</dd>
          </>
        )}
      </dl>

      {!calibration && <p className={styles.notice}>{t('editor.sitePlan.notCalibrated')}</p>}
      <button
        type="button"
        className={cx(controls.button, controls.small, !calibration && controls.primary)}
        onClick={editorActions.startCalibration}
      >
        <Ruler {...icon} />
        {calibration ? t('editor.sitePlan.recalibrate') : t('editor.sitePlan.calibrate')}
      </button>

      <h3 className={styles.subtitle}>{t('editor.sitePlan.alignTitle')}</h3>
      <div className={styles.inlineField}>
        <span className={styles.inlineLabel} aria-hidden>
          {t('editor.sitePlan.rotation')}
        </span>
        <NumberField
          value={displayRotation(background.rotationDeg)}
          digits={1}
          label={t('editor.sitePlan.rotationLabel')}
          onCommit={editorActions.rotateSitePlan}
        />
        <span aria-hidden>°</span>
      </div>
      <div className={styles.inlineField}>
        <label className={styles.inlineLabel} htmlFor={opacityId}>
          {t('editor.sitePlan.opacity')}
        </label>
        <input
          id={opacityId}
          type="range"
          className={styles.range}
          min={0}
          max={100}
          step={5}
          value={Math.round(background.opacity * 100)}
          onChange={(e) => editorActions.setSitePlanOpacity(Number(e.target.value) / 100)}
        />
        <span className={styles.rangeValue}>{formatPercent(background.opacity)}</span>
      </div>
      <p className={styles.hint}>{t('editor.sitePlan.alignHint')}</p>

      <div className={styles.buttonColumn}>
        <button
          type="button"
          className={cx(controls.button, controls.small)}
          title={t('editor.sitePlan.lockHint')}
          onClick={editorActions.lockSitePlan}
        >
          <Lock {...icon} />
          {t('editor.sitePlan.lock')}
        </button>
        <button
          type="button"
          className={cx(controls.button, controls.small)}
          onClick={editorActions.hideSitePlan}
        >
          <EyeOff {...icon} />
          {t('editor.sitePlan.hide')}
        </button>
        <button
          type="button"
          className={cx(controls.button, controls.small)}
          onClick={editorActions.importSitePlan}
        >
          <ImageUp {...icon} />
          {t('editor.sitePlan.replace')}
        </button>
        <button
          type="button"
          className={cx(controls.button, controls.small, styles.deleteButton)}
          onClick={editorActions.removeSitePlan}
        >
          <Trash2 {...icon} />
          {t('editor.sitePlan.remove')}
        </button>
      </div>
    </>
  )
}
