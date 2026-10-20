// Draws the map with Cytoscape and keeps it in sync with the model.
//
// Cytoscape draws on a <canvas>, so it cannot read CSS. The colors and sizes are
// read from the tokens with getComputedStyle and turned into a Cytoscape style.
//
// The look of each person and line comes from classes:
// - people: `center`, `expanded`, `selected`, `common` (in common with the center), `dimmed`
// - lines:  `mutual`, `highlighted` (touches the selected person), `dimmed`
// A person with no class is "not expanded".

import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import type { GraphModel, Link } from './model.ts'

cytoscape.use(fcose)

// Layout physics (how the people push and pull each other). Not design tokens:
// they shape the force simulation, not the look.
const IDEAL_EDGE_LENGTH = 120
const NODE_REPULSION = 12000
const NODE_SEPARATION = 100
const ARROW_SCALE = 0.6 // arrow size relative to the line width
const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5

export interface GraphViewHandlers {
  onPersonClick(login: string): void
  onBackgroundClick(): void
}

export interface UpdateOptions {
  /** New people appear around this person (the one just expanded). */
  origin?: string
  /** Zoom to show the whole map after the layout. */
  fit?: boolean
}

/** Options of the fcose layout used here (Cytoscape's own types do not know them). */
interface FcoseLayoutOptions extends cytoscape.BaseLayoutOptions {
  name: 'fcose'
  randomize: boolean
  animate: boolean
  animationDuration: number
  animationEasing: string
  fit: boolean
  padding: number
  idealEdgeLength: number
  nodeRepulsion: number
  nodeSeparation: number
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
    layoutDuration: number('--dur-layout'),
    ease: value('--ease'),
  }
}

type Tokens = ReturnType<typeof readTokens>

function buildStyle(t: Tokens): cytoscape.StylesheetJson {
  return [
    // Not expanded: the default look of a person.
    {
      selector: 'node',
      style: {
        'background-color': t.nodeIdle,
        width: t.sizeIdle,
        height: t.sizeIdle,
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
      style: { 'background-color': t.nodeExpanded, width: t.sizeExpanded, height: t.sizeExpanded },
    },
    {
      // White dot, a gap in the canvas color, then a white ring.
      selector: 'node.center',
      style: {
        'background-color': t.nodeCenter,
        width: t.sizeCenter,
        height: t.sizeCenter,
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
        width: t.sizeSelected,
        height: t.sizeSelected,
        'underlay-color': t.nodeSelected,
        'underlay-opacity': t.haloOpacity,
        'underlay-padding': t.halo,
        'underlay-shape': 'ellipse',
      },
    },
    {
      selector: 'node.center.selected',
      style: { width: t.sizeCenter, height: t.sizeCenter, 'outline-color': t.nodeSelected },
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
  private layout: cytoscape.Layouts | null = null
  private selected: string | null = null

  constructor(container: HTMLElement, model: GraphModel, handlers: GraphViewHandlers) {
    this.model = model
    this.tokens = readTokens()
    this.cy = cytoscape({
      container,
      style: buildStyle(this.tokens),
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      boxSelectionEnabled: false,
      autounselectify: true, // selection is handled by the `selected` class
    })

    this.resetCamera()

    this.cy.on('tap', 'node', (event) => handlers.onPersonClick(event.target.data('login')))
    this.cy.on('tap', (event) => {
      if (event.target === this.cy) handlers.onBackgroundClick()
    })
    this.cy.on('mouseover', 'node', () => container.classList.add('is-pointing'))
    this.cy.on('mouseout', 'node', () => container.classList.remove('is-pointing'))
  }

  /** Adds what is new in the model, removes what changed, and rearranges the map. */
  update(options: UpdateOptions = {}): void {
    this.cy.batch(() => {
      this.syncPeople(options.origin)
      this.syncLinks()
    })
    this.refreshClasses()
    this.runLayout(options.fit ?? false)
  }

  /** Removes everything from the screen, to start a new map. */
  clear(): void {
    this.layout?.stop()
    this.layout = null
    this.selected = null
    this.cy.elements().remove()
    this.resetCamera()
  }

  /** 100% zoom with the point (0, 0), where a new map starts, in the middle of the screen. */
  private resetCamera(): void {
    this.cy.zoom(1)
    this.cy.pan({ x: this.cy.width() / 2, y: this.cy.height() / 2 })
  }

  /** Selects a person (or nobody, with `null`) and dims everyone who is not a neighbor. */
  select(login: string | null): void {
    this.selected = login === null ? null : nodeId(login)
    this.refreshClasses()
  }

  private syncPeople(origin: string | undefined): void {
    const newPeople = this.model.getPeople().filter((person) => this.cy.getElementById(nodeId(person.login)).empty())
    const start = this.originPosition(origin)

    // New people start in a small circle around the origin, then the layout spreads them out.
    newPeople.forEach((person, index) => {
      const angle = (2 * Math.PI * index) / newPeople.length
      this.cy.add({
        group: 'nodes',
        data: { id: nodeId(person.login), login: person.login },
        position: {
          x: start.x + Math.cos(angle) * (IDEAL_EDGE_LENGTH / 2),
          y: start.y + Math.sin(angle) * (IDEAL_EDGE_LENGTH / 2),
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

  private runLayout(fit: boolean): void {
    this.layout?.stop()

    const duration = this.tokens.layoutDuration // 0 when the user prefers reduced motion
    const options: FcoseLayoutOptions = {
      name: 'fcose',
      randomize: false, // start from the current positions so the map does not jump around
      animate: duration > 0,
      animationDuration: duration,
      animationEasing: this.tokens.ease,
      fit: false, // fitting is done by fitMap, which never zooms past 100%
      padding: this.tokens.padding,
      idealEdgeLength: IDEAL_EDGE_LENGTH,
      nodeRepulsion: NODE_REPULSION,
      nodeSeparation: NODE_SEPARATION,
      stop: () => {
        if (fit) this.fitMap()
      },
    }
    this.layout = this.cy.layout(options)
    this.layout.run()
  }

  /** Shows the whole map. A small map stays at 100% instead of being blown up. */
  private fitMap(): void {
    this.cy.fit(undefined, this.tokens.padding)
    if (this.cy.zoom() > 1) {
      this.cy.zoom(1)
      this.cy.center()
    }
  }
}
