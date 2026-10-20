// Live physics for the map, built on d3-force.
//
// Every person is a particle and the simulation runs all the time, like molecules:
// - links work as springs, pulling connected people together;
// - every person pushes the others away (charge) and keeps some room (collision);
// - a weak pull towards the middle keeps the map from drifting off;
// - a tiny "float" push, which slowly turns, keeps everyone gently moving.
// Dragging a person pins them under the mouse and wakes the simulation up,
// so their connections follow like springs.
//
// When the user prefers reduced motion, nothing floats: the simulation runs all at
// once, in the background, and only the final positions are shown.

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
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
const CENTER_PULL = 0.02 // pull towards the middle of the map
const VELOCITY_DECAY = 0.35 // friction: higher stops movement sooner
const FLOAT_STRENGTH = 0.05 // size of the floating push
const FLOAT_SPEED = 0.01 // how fast each push turns (radians per tick)

// "Alpha" is the simulation's energy. It fades over time towards a target.
const ALPHA_WAKE = 1 // new people on the map: full energy
const ALPHA_DRAG = 0.3 // while dragging: enough for neighbors to follow
const ALPHA_FLOAT = 0.05 // resting energy that keeps the springs alive
const SETTLE_TICKS = 300 // steps run at once when there is no animation

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

export interface PhysicsNode extends SimulationNodeDatum {
  id: string
  /** Where this person's floating push starts, so people do not all move together. */
  phase: number
}

export interface PhysicsLink {
  source: string
  target: string
}

type Link = SimulationLinkDatum<PhysicsNode>

/** Custom d3 force: a small push whose direction slowly turns, different for each person. */
function forceFloat() {
  let nodes: PhysicsNode[] = []
  let time = 0

  function force() {
    if (reducedMotion.matches) return
    time += 1
    for (const node of nodes) {
      const angle = node.phase + time * FLOAT_SPEED
      node.vx = (node.vx ?? 0) + Math.cos(angle) * FLOAT_STRENGTH
      node.vy = (node.vy ?? 0) + Math.sin(angle) * FLOAT_STRENGTH
    }
  }
  force.initialize = (all: PhysicsNode[]) => {
    nodes = all
  }
  return force
}

export class GraphPhysics {
  private readonly simulation: Simulation<PhysicsNode, Link>
  private readonly nodes = new Map<string, PhysicsNode>()
  private readonly onTick: () => void

  /** `onTick` is called after every step, so the screen can copy the new positions. */
  constructor(onTick: () => void) {
    this.onTick = onTick
    this.simulation = forceSimulation<PhysicsNode, Link>()
      .velocityDecay(VELOCITY_DECAY)
      .force('link', forceLink<PhysicsNode, Link>().id((node) => node.id).distance(LINK_DISTANCE))
      .force('charge', forceManyBody<PhysicsNode>().strength(CHARGE).distanceMax(CHARGE_RANGE))
      .force('collide', forceCollide<PhysicsNode>(COLLIDE_RADIUS))
      .force('x', forceX<PhysicsNode>(0).strength(CENTER_PULL))
      .force('y', forceY<PhysicsNode>(0).strength(CENTER_PULL))
      .force('float', forceFloat())
      .on('tick', onTick)
      .stop()

    // If the user changes the motion setting while the page is open, follow it.
    reducedMotion.addEventListener('change', () => this.wake(ALPHA_DRAG))
  }

  /**
   * Replaces the people and links in the simulation.
   * People already there keep their position and speed; new ones start at the given point.
   */
  update(people: { id: string; x: number; y: number }[], links: PhysicsLink[]): void {
    const next = new Map<string, PhysicsNode>()
    for (const person of people) {
      const existing = this.nodes.get(person.id)
      next.set(person.id, existing ?? { id: person.id, x: person.x, y: person.y, phase: Math.random() * 2 * Math.PI })
    }
    this.nodes.clear()
    for (const [id, node] of next) this.nodes.set(id, node)

    this.simulation.nodes([...this.nodes.values()])
    // d3 replaces the ids in `source` and `target` with the nodes, so it gets copies.
    this.simulation.force<ForceLink<PhysicsNode, Link>>('link')!.links(links.map((link) => ({ ...link })))
    this.wake(ALPHA_WAKE)
  }

  /** Current position of a person, or `undefined` if they are not in the simulation. */
  position(id: string): { x: number; y: number } | undefined {
    const node = this.nodes.get(id)
    return node === undefined ? undefined : { x: node.x ?? 0, y: node.y ?? 0 }
  }

  /** The simulation's energy, from 1 (just woken up) down to the resting level. */
  get energy(): number {
    return this.simulation.alpha()
  }

  /** Pins a person at a point (while being dragged). Their neighbors follow. */
  hold(id: string, x: number, y: number): void {
    const node = this.nodes.get(id)
    if (node === undefined) return
    node.fx = x
    node.fy = y
    node.x = x
    node.y = y
    if (!reducedMotion.matches) this.simulation.alphaTarget(ALPHA_DRAG).restart()
  }

  /** Spreads people out (above 1) or brings them closer (below 1). */
  setSpacing(multiplier: number): void {
    this.simulation.force<ForceLink<PhysicsNode, Link>>('link')!.distance(LINK_DISTANCE * multiplier)
    this.simulation.force<ForceManyBody<PhysicsNode>>('charge')!.strength(CHARGE * multiplier)
    this.wake(ALPHA_DRAG)
  }

  /** Lets go of a person after dragging; the springs settle them again. */
  release(id: string): void {
    const node = this.nodes.get(id)
    if (node === undefined) return
    node.fx = null
    node.fy = null
    if (!reducedMotion.matches) this.simulation.alphaTarget(ALPHA_FLOAT)
  }

  /** Stops everything and forgets every person, to start a new map. */
  clear(): void {
    this.simulation.stop()
    this.nodes.clear()
    this.simulation.nodes([])
    this.simulation.force<ForceLink<PhysicsNode, Link>>('link')!.links([])
  }

  private wake(alpha: number): void {
    if (reducedMotion.matches) {
      // No animation: run the steps right away and show only the result.
      this.simulation.stop().alpha(alpha).alphaTarget(0)
      this.simulation.tick(SETTLE_TICKS)
      this.onTick()
      return
    }
    this.simulation.alpha(alpha).alphaTarget(ALPHA_FLOAT).restart()
  }
}
