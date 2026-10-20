// cytoscape-fcose ships without TypeScript types. It is a Cytoscape extension,
// registered with `cytoscape.use(fcose)`.
declare module 'cytoscape-fcose' {
  import type { Ext } from 'cytoscape'

  const fcose: Ext
  export default fcose
}
