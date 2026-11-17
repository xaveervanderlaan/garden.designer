import { create } from 'zustand'
import type { Bounds } from '../geometry/bounds'
import type { LocalDate } from '../geometry/sun'
import type { Size, Viewport } from '../geometry/viewport'
import type { BedKind } from '../model/beds'
import type { GrowthStopId } from '../model/growth'
import type { PaletteGroup, SymbolVariantId } from '../model/objectKinds'
import type { ObjectKind, Point } from '../model/schema'
import { resetSunMap } from './sunMapStore'

/**
 * select/pan: the usual. draw: drawing an outline or line (see DrawTarget). calibrate: measuring
 * the site plan's scale. stamp: every click places a plant. fill: filling a bed with a plant.
 */
export type SunMoment = { date: LocalDate; minutes: number }

export type Tool = 'select' | 'pan' | 'draw' | 'calibrate' | 'stamp' | 'fill'

/**
 * What the drawing tool makes: the plot outline, a bed, a row of plants along a line, or an object
 * of any kind (its preset says whether that is an outline, a line or a single point), or a
 * measurement (a line whose total length is shown; it can be kept as a dimension).
 */
export type DrawTarget =
  | { kind: 'plot' }
  | { kind: 'bed'; bedKind: BedKind }
  | { kind: 'row'; plantId: string; spacingM: number }
  | { kind: 'object'; objectKind: ObjectKind; variant?: SymbolVariantId }
  | { kind: 'measure' }

/** An outline or line being drawn: what it's for and the corners placed so far (world metres). */
export type Drawing = { target: DrawTarget; points: Point[] }

/** Stamp mode: the plant each click places, and how many were placed so far. */
export type Stamp = { plantId: string; placed: number }

/** Filling a bed: the plant, the bed (null until one is clicked) and the spacing in metres. */
export type Fill = {
  plantId: string
  bedId: string | null
  /** Between plants (in a row, for rows mode). */
  spacingM: number
  /** Rows mode: distance between rows. */
  rowSpacingM?: number
  /** Rows mode: how many rows; absent = all that fit. */
  rows?: number
}

/** Plant labels on the plan: the plant's name, or its numbered species code. */
export type LabelMode = 'name' | 'code'

/** The site plan being calibrated: the (up to two) points clicked so far (world metres). */
export type Calibration = { points: Point[] }

/**
 * Editor view state that is not part of the design: viewport, selection, active tool, drawing in
 * progress. Kept out of the project store so it never ends up in the undo history or in files.
 */
type UiStore = {
  viewport: Viewport
  /** Size of the canvas in CSS pixels; null until it has been measured. */
  canvasSize: Size | null
  /**
   * The last zoom to fit: the area shown and the viewport that produced. While the viewport is
   * still that one, the canvas fits the area again when its size changes (e.g. a panel below the
   * plan opens), so a fitted view stays fitted until you pan, zoom or click on the plan.
   */
  fit: { bounds: Bounds; viewport: Viewport } | null
  selection: string[]
  tool: Tool
  /** The outline being drawn with the draw tool, or null. */
  drawing: Drawing | null
  /** The plant being stamped onto the plan, or null. */
  stamp: Stamp | null
  /** The bed being filled with plants, or null. */
  fill: Fill | null
  labelMode: LabelMode
  /** The view bar's year (M13): plants are drawn at their size then. Default: mature. */
  growthStop: GrowthStopId
  /** The view bar's month (M14, 1–12): plants are drawn as they look then; null: usual look. */
  month: number | null
  /** The sun's moment (M11): date and minutes after local midnight; null: sun off, no shadows. */
  sun: SunMoment | null
  /** Whether the sun's time is playing through the day (not saved). */
  sunPlaying: boolean
  bloomChartOpen: boolean
  /** The vegetable calendar dialog: open, optionally preset to one bed (M15). */
  vegCalendar: { bedId: string | null } | null
  settingsOpen: boolean
  /** The line being measured with the calibrate tool, or null. */
  calibration: Calibration | null
  /** Snap to the grid while drawing and dragging corners (off while tracing the site plan). */
  snapToGrid: boolean
  /** Index of the selected plot corner (for deleting it), or null. */
  activeCorner: number | null
  /**
   * The object (not a bed: those always are) whose corners are being edited instead of moving,
   * rotating and resizing it as a whole. Ends when the selection changes.
   */
  editingCorners: string | null
  /** World position of the mouse over the canvas, or null when it's elsewhere. */
  cursor: Point | null
  helpOpen: boolean
  rectangleDialogOpen: boolean
  /** The site-plan import dialog (progress, page choice or error) is showing. */
  sitePlanDialogOpen: boolean
  /** The toolbar's menu for adding a structure is open. */
  objectMenuOpen: PaletteGroup | null
  setViewport: (viewport: Viewport | ((current: Viewport) => Viewport)) => void
  setCanvasSize: (size: Size) => void
  setFit: (fit: { bounds: Bounds; viewport: Viewport } | null) => void
  setSelection: (ids: string[]) => void
  /** Adds the id to the selection, or removes it if it was already selected. */
  toggleSelected: (id: string) => void
  /**
   * Switches tools. Starting the draw or calibrate tool begins a new drawing (of the plot) or
   * measurement and clears the selection.
   */
  setTool: (tool: Tool) => void
  /** Starts drawing an outline or line for `target`. */
  startDrawing: (target: DrawTarget) => void
  /** Starts stamp mode with a plant. */
  startStamp: (plantId: string) => void
  /** Starts filling a bed (keeps the selection, so the selected bed stays visible). */
  startFill: (fill: Fill) => void
  setDrawing: (drawing: Drawing | null) => void
  setStamp: (stamp: Stamp | null) => void
  setFill: (fill: Fill | null) => void
  setLabelMode: (mode: LabelMode) => void
  setGrowthStop: (stop: GrowthStopId) => void
  setMonth: (month: number | null) => void
  setSun: (sun: SunMoment | null) => void
  setSunPlaying: (playing: boolean) => void
  setBloomChartOpen: (open: boolean) => void
  openVegCalendar: (bedId?: string) => void
  closeVegCalendar: () => void
  setSettingsOpen: (open: boolean) => void
  setCalibration: (calibration: Calibration | null) => void
  setSnapToGrid: (on: boolean) => void
  setActiveCorner: (index: number | null) => void
  setEditingCorners: (id: string | null) => void
  setCursor: (cursor: Point | null) => void
  setHelpOpen: (open: boolean) => void
  setRectangleDialogOpen: (open: boolean) => void
  setSitePlanDialogOpen: (open: boolean) => void
  setObjectMenuOpen: (group: PaletteGroup | null) => void
  /** Back to a clean state, e.g. when another project is opened. */
  reset: () => void
}

const initial = {
  viewport: { x: 0, y: 0, scale: 40 },
  canvasSize: null,
  fit: null,
  selection: [],
  tool: 'select' as Tool,
  drawing: null,
  stamp: null,
  fill: null,
  labelMode: 'name' as LabelMode,
  growthStop: 'mature' as GrowthStopId,
  month: null as number | null,
  sun: null as SunMoment | null,
  sunPlaying: false,
  bloomChartOpen: false,
  vegCalendar: null,
  settingsOpen: false,
  calibration: null,
  snapToGrid: true,
  activeCorner: null,
  editingCorners: null,
  cursor: null,
  helpOpen: false,
  rectangleDialogOpen: false,
  sitePlanDialogOpen: false,
  objectMenuOpen: null,
}

/** The state of every tool that has one, cleared when another tool starts. */
const noToolState = { drawing: null, calibration: null, stamp: null, fill: null }

export const useUiStore = create<UiStore>()((set) => ({
  ...initial,
  setViewport: (viewport) =>
    set((state) => ({
      viewport: typeof viewport === 'function' ? viewport(state.viewport) : viewport,
    })),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
  setFit: (fit) => set({ fit }),
  setSelection: (selection) =>
    set((state) => ({
      selection,
      activeCorner: null,
      editingCorners:
        selection.length === 1 && selection[0] === state.editingCorners
          ? state.editingCorners
          : null,
    })),
  toggleSelected: (id) =>
    set((state) => ({
      activeCorner: null,
      editingCorners: null,
      selection: state.selection.includes(id)
        ? state.selection.filter((s) => s !== id)
        : [...state.selection, id],
    })),
  setTool: (tool) =>
    set((state) => ({
      tool,
      drawing: tool === 'draw' ? { target: { kind: 'plot' }, points: [] } : null,
      calibration: tool === 'calibrate' ? { points: [] } : null,
      stamp: tool === 'stamp' ? state.stamp : null,
      fill: tool === 'fill' ? state.fill : null,
      ...(tool === 'draw' || tool === 'calibrate'
        ? { selection: [], activeCorner: null, editingCorners: null }
        : {}),
    })),
  startDrawing: (target) =>
    set({
      ...noToolState,
      tool: 'draw',
      drawing: { target, points: [] },
      selection: [],
      activeCorner: null,
      editingCorners: null,
    }),
  startStamp: (plantId) =>
    set({
      ...noToolState,
      tool: 'stamp',
      stamp: { plantId, placed: 0 },
      selection: [],
      activeCorner: null,
      editingCorners: null,
    }),
  startFill: (fill) =>
    set({ ...noToolState, tool: 'fill', fill, activeCorner: null, editingCorners: null }),
  setDrawing: (drawing) => set({ drawing }),
  setStamp: (stamp) => set({ stamp }),
  setFill: (fill) => set({ fill }),
  setLabelMode: (labelMode) => set({ labelMode }),
  setGrowthStop: (growthStop) => set({ growthStop }),
  setMonth: (month) => set({ month }),
  setSun: (sun) => set({ sun }),
  setSunPlaying: (sunPlaying) => set({ sunPlaying }),
  setBloomChartOpen: (bloomChartOpen) => set({ bloomChartOpen }),
  openVegCalendar: (bedId) => set({ vegCalendar: { bedId: bedId ?? null } }),
  closeVegCalendar: () => set({ vegCalendar: null }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setCalibration: (calibration) => set({ calibration }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setActiveCorner: (activeCorner) => set({ activeCorner }),
  setEditingCorners: (editingCorners) => set({ editingCorners, activeCorner: null }),
  setCursor: (cursor) => set({ cursor }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setRectangleDialogOpen: (rectangleDialogOpen) => set({ rectangleDialogOpen }),
  setSitePlanDialogOpen: (sitePlanDialogOpen) => set({ sitePlanDialogOpen }),
  setObjectMenuOpen: (objectMenuOpen) => set({ objectMenuOpen }),
  reset: () => {
    resetSunMap()
    set({ ...initial })
  },
}))
