// Physics for the map, built on d3-force.
//
// Every person is a particle:
// - links work as springs, pulling connected people together;
// - every person pushes the others away (charge) and keeps some room (collision);
// - a weak pull towards the middle keeps separate groups from drifting apart.
//
// Two ways of working:
// - Live (the "Live physics" setting, on by default): the simulation runs with
//   animation, settles, and stops. Dragging someone wakes it up and their
//   connections follow like springs. On top of that, every person floats a few
//   pixels around their place. The float is only a drawing effect, not a force,
//   so it can never push the map away or make it shake.
// - Still (setting off, or the user prefers reduced motion): nothing moves by itself.
//   The first time, everyone is arranged at once, without animation. After that,
//   new people are fitted in among the ones already placed, who stay exactly where
//   they are. Dragging moves only the person being dragged.

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceCollide,
  type ForceLink,
  type ForceManyBody,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'

// Physics tuning. Not design tokens: they shape the simulation, not the look.
const LINK_DISTANCE = 80 // preferred length of a line
const CHARGE = -220 // how strongly people push each other away
const CHARGE_RANGE = 400 // the push stops beyond this distance
const COLLIDE_RADIUS = 18 // room around each person, so names do not overlap
const COLLIDE_STRENGTH = 0.7 // below 1 the collisions are softer, so crowds do not shake
const CENTER_PULL = 0.02 // pull towards the middle of the map
const VELOCITY_DECAY = 0.35 // friction: higher stops movement sooner
const ALPHA_DECAY = 0.03 // how fast the energy fades; the map stops in about 4 seconds

// "Alpha" is the simulation's energy. It fades over time and the simulation stops near 0.
const ALPHA_WAKE = 1 // new people on the map: full energy
const ALPHA_DRAG = 0.3 // while dragging: enough for neighbors to follow

// Still map. Measured on a map of 300 people: placing 20 new ones takes about 150 ms,
// nobody already there moves, and nobody ends up closer than in a normally settled map.
const SETTLE_STEPS = 300 // steps to arrange everyone at once
const PLACE_STEPS = 120 // steps to fit new people among the ones already placed
const PLACE_COLLIDE_RADIUS = 20 // firmer room while fitting, since the others cannot move
const PLACE_COLLIDE_ITERATIONS = 2
const PLACE_LINK_STRENGTH = 0.3 // softer springs, so new people can spread out

// Floating (live only): each person drifts around their place, in their own rhythm.
const FLOAT_DISTANCE = 3 // pixels, at most, away from their place
const FLOAT_SPEED_MIN = 0.08 // turns per second
const FLOAT_SPEED_MAX = 0.2

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

export interface PhysicsNode extends SimulationNodeDatum {
  id: string
  // Floating rhythm, different for each person so they do not move together.
  floatSpeed: number
  floatPhaseX: number
  floatPhaseY: number
}

export interface PhysicsLink {
  source: string
  target: string
}

type Link = SimulationLinkDatum<PhysicsNode>

function newNode(id: string, x: number, y: number): PhysicsNode {
  return {
    id,
    x,
    y,
    floatSpeed: FLOAT_SPEED_MIN + Math.random() * (FLOAT_SPEED_MAX - FLOAT_SPEED_MIN),
    floatPhaseX: Math.random() * 2 * Math.PI,
    floatPhaseY: Math.random() * 2 * Math.PI,
  }
}

export class GraphPhysics {
  private readonly simulation: Simulation<PhysicsNode, Link>
  private readonly linkForce: ForceLink<PhysicsNode, Link>
  private readonly collideForce: ForceCollide<PhysicsNode>
  private readonly nodes = new Map<string, PhysicsNode>()
  /** People who already have a place (on a still map they stay there). */
  private readonly placed = new Set<string>()
  private readonly onTick: () => void
  private live = true
  private frame: number | null = null

  /** `onTick` is called whenever positions change, so the screen can copy them. */
  constructor(onTick: () => void) {
    this.onTick = onTick
    this.linkForce = forceLink<PhysicsNode, Link>().id((node) => node.id).distance(LINK_DISTANCE)
    this.collideForce = forceCollide<PhysicsNode>(COLLIDE_RADIUS).strength(COLLIDE_STRENGTH)
    this.simulation = forceSimulation<PhysicsNode, Link>()
      .velocityDecay(VELOCITY_DECAY)
      .alphaDecay(ALPHA_DECAY)
      .force('link', this.linkForce)
      .force('charge', forceManyBody<PhysicsNode>().strength(CHARGE).distanceMax(CHARGE_RANGE))
      .force('collide', this.collideForce)
      .force('x', forceX<PhysicsNode>(0).strength(CENTER_PULL))
      .force('y', forceY<PhysicsNode>(0).strength(CENTER_PULL))
      .stop()

    // If the user changes the motion setting while the page is open, follow it.
    reducedMotion.addEventListener('change', () => this.applyMode())
  }

  /** True when the map is animated: "Live physics" on and no reduced motion. */
  get isMoving(): boolean {
    return this.live && !reducedMotion.matches
  }

  /** "Live physics" in "Map settings". */
  setLive(on: boolean): void {
    this.live = on
    this.applyMode()
  }

  /**
   * Replaces the people and links in the simulation.
   * People already there keep their position; new ones start at the given point.
   */
  update(people: { id: string; x: number; y: number }[], links: PhysicsLink[]): void {
    const next = new Map<string, PhysicsNode>()
    for (const person of people) next.set(person.id, this.nodes.get(person.id) ?? newNode(person.id, person.x, person.y))
    this.nodes.clear()
    for (const [id, node] of next) this.nodes.set(id, node)

    this.simulation.nodes([...this.nodes.values()])
    // d3 replaces the ids in `source` and `target` with the nodes, so it gets copies.
    this.linkForce.links(links.map((link) => ({ ...link })))

    if (this.isMoving) this.wake(ALPHA_WAKE)
    else if (this.placed.size === 0) this.settleAll()
    else this.placeNewPeople()

    for (const id of this.nodes.keys()) this.placed.add(id)
  }

  /** Where to draw a person now, or `undefined` if they are not in the simulation. */
  position(id: string): { x: number; y: number } | undefined {
    const node = this.nodes.get(id)
    if (node === undefined) return undefined
    const x = node.x ?? 0
    const y = node.y ?? 0
    if (!this.isMoving || node.fx != null) return { x, y } // still map, or held by the mouse

    const turns = (performance.now() / 1000) * node.floatSpeed * 2 * Math.PI
    return {
      x: x + Math.sin(turns + node.floatPhaseX) * FLOAT_DISTANCE,
      y: y + Math.sin(turns * 0.8 + node.floatPhaseY) * FLOAT_DISTANCE,
    }
  }

  /** The simulation's energy, from 1 (just woken up) down to 0 (stopped). */
  get energy(): number {
    return this.simulation.alpha()
  }

  /** Pins a person at a point while they are dragged. On a live map, their neighbors follow. */
  hold(id: string, x: number, y: number): void {
    const node = this.nodes.get(id)
    if (node === undefined) return
    node.fx = x
    node.fy = y
    node.x = x
    node.y = y
    if (this.isMoving) this.simulation.alphaTarget(ALPHA_DRAG).restart()
  }

  /** Lets go of a person after dragging. A live map settles again; a still one stays as it is. */
  release(id: string): void {
    const node = this.nodes.get(id)
    if (node === undefined) return
    node.fx = null
    node.fy = null
    if (this.isMoving) this.simulation.alphaTarget(0) // the energy fades and the map stops
  }

  /** Spreads people out (above 1) or brings them closer (below 1). */
  setSpacing(multiplier: number): void {
    this.linkForce.distance(LINK_DISTANCE * multiplier)
    this.simulation.force<ForceManyBody<PhysicsNode>>('charge')!.strength(CHARGE * multiplier)
    if (this.isMoving) this.wake(ALPHA_DRAG)
    else this.settleAll() // spacing is about everyone, so on a still map everyone is rearranged
  }

  /** Stops everything and forgets every person, to start a new map. */
  clear(): void {
    this.simulation.stop()
    this.stopDrawing()
    this.nodes.clear()
    this.placed.clear()
    this.simulation.nodes([])
    this.linkForce.links([])
  }

  // ---------- Live ----------

  private wake(alpha: number): void {
    this.simulation.alpha(alpha).alphaTarget(0).restart()
    this.startDrawing()
  }

  /**
   * On a live map the screen is redrawn on every frame: while the simulation runs,
   * and also after it stops, because of the floating.
   */
  private startDrawing(): void {
    if (this.frame !== null) return
    const draw = () => {
      this.onTick()
      this.frame = requestAnimationFrame(draw)
    }
    this.frame = requestAnimationFrame(draw)
  }

  private stopDrawing(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
  }

  private applyMode(): void {
    if (this.isMoving) {
      if (this.nodes.size > 0) this.startDrawing()
      return
    }
    this.simulation.stop()
    this.stopDrawing()
    this.onTick() // draw everyone at their place, without the floating offset
  }

  // ---------- Still ----------

  /** Arranges everyone at once, without animation, and draws only the result. */
  private settleAll(): void {
    this.simulation.stop().alpha(ALPHA_WAKE).tick(SETTLE_STEPS)
    this.onTick()
  }

  /**
   * Fits new people in among the ones already placed, who are pinned so they do not move.
   * While fitting, collisions are firmer and springs softer, so the new people find room
   * without squeezing against anyone.
   */
  private placeNewPeople(): void {
    const pinned: PhysicsNode[] = []
    for (const node of this.nodes.values()) {
      if (!this.placed.has(node.id) || node.fx != null) continue
      node.fx = node.x
      node.fy = node.y
      pinned.push(node)
    }

    // Temporary softer springs (the normal ones are left untouched and put back after).
    const placingLinks = forceLink<PhysicsNode, Link>(this.linkForce.links())
      .id((node) => node.id)
      .distance(this.linkForce.distance())
      .strength(PLACE_LINK_STRENGTH)
    this.simulation.force('link', placingLinks)
    this.collideForce.radius(PLACE_COLLIDE_RADIUS).strength(1).iterations(PLACE_COLLIDE_ITERATIONS)
    this.simulation.stop().alpha(ALPHA_WAKE).tick(PLACE_STEPS)

    // Back to the normal forces, and let go of everyone.
    this.simulation.force('link', this.linkForce)
    this.collideForce.radius(COLLIDE_RADIUS).strength(COLLIDE_STRENGTH).iterations(1)
    for (const node of pinned) {
      node.fx = null
      node.fy = null
    }
    this.onTick()
  }
}
