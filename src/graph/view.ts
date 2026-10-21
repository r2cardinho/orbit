// Draws the map with Cytoscape and keeps it in sync with the model.
//
// Cytoscape draws on a <canvas>, so it cannot read CSS. The colors and sizes are
// read from the tokens with getComputedStyle and turned into a Cytoscape style.
//
// The look of each person and line comes from classes:
// - people: `center`, `expanded`, `selected`, `common` (in common with the center), `dimmed`
// - lines:  `mutual`, `highlighted` (touches the selected person), `dimmed`
// - both:   `hidden`, for what the "Map settings" filters leave out
// A person with no class is "not expanded".
//
// Where each person is comes from the live physics (physics.ts). On every step of the
// simulation the new positions are copied into Cytoscape.

import cytoscape from 'cytoscape'
import type { GraphModel, Link } from './model.ts'
import { GraphPhysics } from './physics.ts'

const SPAWN_RADIUS = 30 // new people start in a circle this size around who was expanded
const FIT_ENERGY = 0.1 // the camera fits the map once the physics calms down to this
const ARROW_SCALE = 0.6 // arrow size relative to the line width
const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5

const ZOOM_STEP = 1.2 // each click on + or − zooms by 20%

export interface GraphViewHandlers {
  onPersonClick(login: string): void
  onBackgroundClick(): void
  /** Called whenever the zoom changes, with the level in percent. */
  onZoom(percent: number): void
}

/** What "Map settings" changes in the drawing. */
export interface DisplayOptions {
  mutualOnly: boolean
  showNotExpanded: boolean
  /** 1 is the normal size from the tokens; 0.5 is half, 1.5 is one and a half. */
  nodeScale: number
}

export interface UpdateOptions {
  /** New people appear around this person (the one just expanded). */
  origin?: string
  /** Move the camera to show the whole map once the people settle. */
  fit?: boolean
}

// ---------- Tokens ----------

function readTokens() {
  const css = getComputedStyle(document.documentElement)
  const value = (name: string) => css.getPropertyValue(name).trim()
  const number = (name: string) => parseFloat(value(name)) // "22px" -> 22, "600ms" -> 600

  return {
    canvas: value('--canvas'),
    text: value('--text'),
    label: value('--label'),
    marker: value('--marker'),
    onMarker: value('--on-marker'),
    nodeCenter: value('--node-center'),
    nodeExpanded: value('--node-expanded'),
    nodeIdle: value('--node-idle'),
    nodeSelected: value('--node-selected'),
    edge: value('--edge'),
    edgeHighlight: value('--edge-highlight'),
    edgeMutual: value('--edge-mutual'),
    dimOpacity: number('--dim-opacity'),
    haloOpacity: number('--halo-opacity'),
    sizeCenter: number('--node-size-center'),
    sizeExpanded: number('--node-size-expanded'),
    sizeIdle: number('--node-size-idle'),
    sizeSelected: number('--node-size-selected'),
    ring: number('--node-ring'),
    halo: number('--node-halo'),
    edgeWidth: number('--edge-width'),
    edgeWidthMutual: number('--edge-width-mutual'),
    font: value('--font'),
    fontSize: number('--fs-caption'),
    fontWeightStrong: number('--fw-strong'),
    labelGap: number('--sp-1'),
    padding: number('--sp-8'),
    cameraDuration: number('--dur-camera'),
    ease: value('--ease'),
  }
}

type Tokens = ReturnType<typeof readTokens>

function buildStyle(t: Tokens, scale: number): cytoscape.StylesheetJson {
  return [
    // Not expanded: the default look of a person.
    {
      selector: 'node',
      style: {
        'background-color': t.nodeIdle,
        width: t.sizeIdle * scale,
        height: t.sizeIdle * scale,
        label: 'data(login)',
        color: t.label,
        'font-family': t.font,
        'font-size': t.fontSize,
        'text-valign': 'bottom',
        'text-margin-y': t.labelGap,
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'node.expanded',
      style: { 'background-color': t.nodeExpanded, width: t.sizeExpanded * scale, height: t.sizeExpanded },
    },
    {
      // White dot, a gap in the canvas color, then a white ring.
      selector: 'node.center',
      style: {
        'background-color': t.nodeCenter,
        width: t.sizeCenter * scale,
        height: t.sizeCenter * scale,
        'border-width': t.ring,
        'border-color': t.canvas,
        'outline-width': t.ring,
        'outline-color': t.nodeCenter,
      },
    },
    {
      // Purple dot with a soft halo.
      selector: 'node.selected',
      style: {
        'background-color': t.nodeSelected,
        width: t.sizeSelected * scale,
        height: t.sizeSelected * scale,
        'underlay-color': t.nodeSelected,
        'underlay-opacity': t.haloOpacity,
        'underlay-padding': t.halo,
        'underlay-shape': 'ellipse',
      },
    },
    {
      selector: 'node.center.selected',
      style: { width: t.sizeCenter * scale, height: t.sizeCenter * scale, 'outline-color': t.nodeSelected },
    },
    {
      selector: 'node.center, node.selected',
      style: { color: t.text, 'font-weight': t.fontWeightStrong },
    },
    {
      // Highlighter behind the name of people in common with the center.
      selector: 'node.common',
      style: {
        color: t.onMarker,
        'font-weight': t.fontWeightStrong,
        'text-background-color': t.marker,
        'text-background-opacity': 1,
        'text-background-padding': `${t.labelGap}px`,
        'text-background-shape': 'roundrectangle',
      },
    },

    // Follows: thin gray line with an arrow.
    {
      selector: 'edge',
      style: {
        width: t.edgeWidth,
        'line-color': t.edge,
        'curve-style': 'straight',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': t.edge,
        'arrow-scale': ARROW_SCALE,
        'overlay-opacity': 0,
      },
    },
    {
      selector: 'edge.highlighted',
      style: { 'line-color': t.edgeHighlight, 'target-arrow-color': t.edgeHighlight },
    },
    // Mutual: purple line with a tick in the middle.
    {
      selector: 'edge.mutual',
      style: {
        width: t.edgeWidthMutual,
        'line-color': t.edgeMutual,
        'target-arrow-shape': 'none',
        'mid-target-arrow-shape': 'tee',
        'mid-target-arrow-color': t.edgeMutual,
      },
    },

    { selector: '.dimmed', style: { opacity: t.dimOpacity } },
    { selector: '.hidden', style: { display: 'none' } },
  ]
}

// ---------- Ids ----------

// Ids ignore case, like the model does.
function nodeId(login: string): string {
  return login.toLowerCase()
}

// One id per pair, whatever the direction, so a follow that becomes mutual keeps its id.
function edgeId(link: Link): string {
  return [nodeId(link.source), nodeId(link.target)].sort().join('|')
}

// ---------- View ----------

export class GraphView {
  private readonly cy: cytoscape.Core
  private readonly model: GraphModel
  private readonly tokens: Tokens
  private readonly physics: GraphPhysics
  private selected: string | null = null
  private fitPending = false
  private display: DisplayOptions = { mutualOnly: false, showNotExpanded: true, nodeScale: 1 }
  private bottomInset = 0 // part of the map covered at the bottom (the profile drawer on phones)

  constructor(container: HTMLElement, model: GraphModel, handlers: GraphViewHandlers) {
    this.model = model
    this.tokens = readTokens()
    this.cy = cytoscape({
      container,
      style: buildStyle(this.tokens, this.display.nodeScale),
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      boxSelectionEnabled: false,
      autounselectify: true, // selection is handled by the `selected` class
    })

    this.physics = new GraphPhysics(() => this.syncPositions())
    this.resetCamera()

    // Dragging pins the person under the mouse; the physics makes the neighbors follow.
    this.cy.on('drag', 'node', (event) => {
      const { x, y } = event.target.position()
      this.physics.hold(event.target.id(), x, y)
    })
    this.cy.on('free', 'node', (event) => this.physics.release(event.target.id()))

    this.cy.on('tap', 'node', (event) => handlers.onPersonClick(event.target.data('login')))
    this.cy.on('tap', (event) => {
      if (event.target === this.cy) handlers.onBackgroundClick()
    })
    this.cy.on('zoom', () => handlers.onZoom(this.zoomPercent()))
    handlers.onZoom(this.zoomPercent())

    this.cy.on('mouseover', 'node', () => container.classList.add('is-pointing'))
    this.cy.on('mouseout', 'node', () => container.classList.remove('is-pointing'))

    // Cytoscape only notices window resizes. Opening or closing a side panel changes the
    // graph's size too, so it is told about every change of its container.
    // The pan moves by half the change, so what was in the middle stays in the middle.
    let { width, height } = container.getBoundingClientRect()
    new ResizeObserver(() => {
      const box = container.getBoundingClientRect()
      const pan = this.cy.pan()
      this.cy.resize()
      this.cy.pan({ x: pan.x + (box.width - width) / 2, y: pan.y + (box.height - height) / 2 })
      width = box.width
      height = box.height
    }).observe(container)
  }

  /** Moves the camera to a person when they are outside the visible part of the map. */
  reveal(login: string): void {
    const node = this.cy.getElementById(nodeId(login))
    if (node.empty()) return

    const visible = this.cy.extent()
    const { x, y } = node.position()
    if (x > visible.x1 && x < visible.x2 && y > visible.y1 && y < visible.y2) return

    const duration = this.tokens.cameraDuration // 0 when the user prefers reduced motion
    if (duration === 0) this.cy.center(node)
    else {
      const easing = this.tokens.ease as cytoscape.Css.TransitionTimingFunction
      this.cy.animate({ center: { eles: node } }, { duration, easing })
    }
  }

  /** Adds what is new in the model, removes what changed, and wakes up the physics. */
  update(options: UpdateOptions = {}): void {
    this.cy.batch(() => {
      this.syncPeople(options.origin)
      this.syncLinks()
    })
    this.refreshClasses()
    this.applyFilters()
    if (options.fit === true) this.fitPending = true
    this.updatePhysics()
  }

  /** Applies "Map settings": filters and node size. */
  setDisplay(options: DisplayOptions): void {
    const sizeChanged = options.nodeScale !== this.display.nodeScale
    this.display = options
    if (sizeChanged) this.cy.style(buildStyle(this.tokens, options.nodeScale))
    this.applyFilters()
    this.updatePhysics()
  }

  /** "Spacing" in "Map settings": 1 is normal, 2 is twice as spread out. */
  setSpacing(multiplier: number): void {
    this.physics.setSpacing(multiplier)
  }

  zoomIn(): void {
    this.zoomAroundMiddle(this.cy.zoom() * ZOOM_STEP)
  }

  zoomOut(): void {
    this.zoomAroundMiddle(this.cy.zoom() / ZOOM_STEP)
  }

  /** Moves the camera to show the whole map. */
  fit(): void {
    this.fitMap()
  }

  private zoomAroundMiddle(level: number): void {
    this.cy.zoom({ level, renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 } })
  }

  private zoomPercent(): number {
    return Math.round(this.cy.zoom() * 100)
  }

  /**
   * Hides what the filters leave out:
   * - "Show not expanded" off: people never expanded, and their lines;
   * - "Mutual only" on: one-way lines, and people left without any line.
   * The center always stays.
   */
  private applyFilters(): void {
    const { mutualOnly, showNotExpanded } = this.display
    const isIdle = (id: string) => {
      const login: string = this.cy.getElementById(id).data('login')
      return !this.model.isExpanded(login) && !this.model.isCenter(login)
    }

    this.cy.batch(() => {
      this.cy.edges().forEach((edge) => {
        const hidden =
          (mutualOnly && edge.data('mutual') !== true) ||
          (!showNotExpanded && (isIdle(edge.data('source')) || isIdle(edge.data('target'))))
        edge.toggleClass('hidden', hidden)
      })
      this.cy.nodes().forEach((node) => {
        if (this.model.isCenter(node.data('login'))) {
          node.removeClass('hidden')
          return
        }
        const hasVisibleLine = node.connectedEdges().filter((edge) => !edge.hasClass('hidden')).nonempty()
        node.toggleClass('hidden', (!showNotExpanded && isIdle(node.id())) || (mutualOnly && !hasVisibleLine))
      })
    })
  }

  /** Gives the physics only what is visible, so hidden people do not push anyone. */
  private updatePhysics(): void {
    const people: { id: string; x: number; y: number }[] = []
    const links: { source: string; target: string }[] = []
    this.cy.nodes().forEach((node) => {
      if (!node.hasClass('hidden')) people.push({ id: node.id(), ...node.position() })
    })
    this.cy.edges().forEach((edge) => {
      if (!edge.hasClass('hidden')) links.push({ source: edge.data('source'), target: edge.data('target') })
    })
    this.physics.update(people, links)
  }

  /** Removes everything from the screen, to start a new map. */
  clear(): void {
    this.physics.clear()
    this.fitPending = false
    this.selected = null
    this.cy.stop() // cancels a camera movement in progress
    this.cy.elements().remove()
    this.resetCamera()
  }

  /** 100% zoom with the point (0, 0), where a new map starts, in the middle of the screen. */
  private resetCamera(): void {
    this.cy.zoom(1)
    this.cy.pan({ x: this.cy.width() / 2, y: this.visibleHeight() / 2 })
  }

  /**
   * Tells the view how much of the bottom of the map is covered (in pixels), so the
   * camera centers the map in the part that can still be seen.
   */
  setBottomInset(pixels: number): void {
    this.bottomInset = pixels
  }

  private visibleHeight(): number {
    return Math.max(this.cy.height() - this.bottomInset, 0)
  }

  /** Selects a person (or nobody, with `null`) and dims everyone who is not a neighbor. */
  select(login: string | null): void {
    this.selected = login === null ? null : nodeId(login)
    this.refreshClasses()
  }

  private syncPeople(origin: string | undefined): void {
    const newPeople = this.model.getPeople().filter((person) => this.cy.getElementById(nodeId(person.login)).empty())
    const start = this.originPosition(origin)

    // New people start in a small circle around the origin, then the physics spreads them out.
    newPeople.forEach((person, index) => {
      const angle = (2 * Math.PI * index) / newPeople.length
      this.cy.add({
        group: 'nodes',
        data: { id: nodeId(person.login), login: person.login },
        position: {
          x: start.x + Math.cos(angle) * SPAWN_RADIUS,
          y: start.y + Math.sin(angle) * SPAWN_RADIUS,
        },
      })
    })
  }

  private originPosition(origin: string | undefined): cytoscape.Position {
    if (origin === undefined) return { x: 0, y: 0 }
    const node = this.cy.getElementById(nodeId(origin))
    return node.empty() ? { x: 0, y: 0 } : { ...node.position() }
  }

  private syncLinks(): void {
    const wanted = new Map(this.model.getLinks().map((link) => [edgeId(link), link]))

    // Remove lines that no longer match the model (e.g. a follow that became mutual).
    this.cy.edges().forEach((edge) => {
      const link = wanted.get(edge.id())
      const unchanged =
        link !== undefined &&
        edge.data('source') === nodeId(link.source) &&
        edge.data('target') === nodeId(link.target) &&
        edge.data('mutual') === link.mutual
      if (unchanged) wanted.delete(edge.id())
      else edge.remove()
    })

    for (const [id, link] of wanted) {
      this.cy.add({
        group: 'edges',
        data: { id, source: nodeId(link.source), target: nodeId(link.target), mutual: link.mutual },
        classes: link.mutual ? 'mutual' : '',
      })
    }
  }

  private refreshClasses(): void {
    const selected = this.selected !== null && this.model.hasPerson(this.selected) ? this.selected : null
    const center = this.model.getCenter()

    // Who stays bright: the selected person and their neighbors.
    const bright = new Set<string>()
    const common = new Set<string>()
    if (selected !== null) {
      bright.add(selected)
      for (const login of this.model.getNeighbors(selected)) bright.add(nodeId(login))
      if (center !== null && !this.model.isCenter(selected)) {
        for (const login of this.model.getCommonConnections(selected, center)) common.add(nodeId(login))
      }
    }

    this.cy.batch(() => {
      this.cy.nodes().forEach((node) => {
        const login: string = node.data('login')
        node.toggleClass('center', this.model.isCenter(login))
        node.toggleClass('expanded', this.model.isExpanded(login))
        node.toggleClass('selected', node.id() === selected)
        node.toggleClass('common', common.has(node.id()))
        node.toggleClass('dimmed', selected !== null && !bright.has(node.id()))
      })

      this.cy.edges().forEach((edge) => {
        const touchesSelected = edge.data('source') === selected || edge.data('target') === selected
        edge.toggleClass('highlighted', touchesSelected)
        edge.toggleClass('dimmed', selected !== null && !touchesSelected)
      })
    })
  }

  /** Copies the positions from the physics to the screen. Called on every physics step. */
  private syncPositions(): void {
    this.cy.batch(() => {
      this.cy.nodes().forEach((node) => {
        if (node.grabbed()) return // the mouse is moving this one
        const position = this.physics.position(node.id())
        if (position !== undefined) node.position(position)
      })
    })

    if (this.fitPending && this.physics.energy < FIT_ENERGY) {
      this.fitPending = false
      this.fitMap()
    }
  }

  /** Moves the camera to show the whole map. A small map stays at 100% instead of being blown up. */
  private fitMap(): void {
    const box = this.cy.elements().not('.hidden').boundingBox()
    const padding = this.tokens.padding
    const zoom = Math.max(
      MIN_ZOOM,
      Math.min(1, (this.cy.width() - 2 * padding) / box.w, (this.visibleHeight() - 2 * padding) / box.h),
    )
    // Pan so that the middle of the map lands in the middle of the screen.
    const pan = {
      x: this.cy.width() / 2 - zoom * (box.x1 + box.w / 2),
      y: this.visibleHeight() / 2 - zoom * (box.y1 + box.h / 2),
    }

    const duration = this.tokens.cameraDuration // 0 when the user prefers reduced motion
    if (duration === 0) this.cy.viewport({ zoom, pan })
    else this.cy.animate({ zoom, pan }, { duration, easing: this.tokens.ease as cytoscape.Css.TransitionTimingFunction })
  }
}
