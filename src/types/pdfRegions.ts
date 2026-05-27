// Virtual board regions derived from PDF schematic structure (not physical PCB coords)

export type VirtualRegionName =
  | 'PMIC'
  | 'RF'
  | 'AUDIO'
  | 'CHARGING'
  | 'CPU'
  | 'SIM'
  | 'DISPLAY'
  | 'OTHER'

export interface VirtualRegion {
  regionId: string
  regionName: VirtualRegionName
  clusterIds: string[]
  componentIds: string[]
  /** Bounding box in virtual canvas space (BOARD_W × BOARD_H) */
  x: number
  y: number
  width: number
  height: number
  color: string
}

export interface PdfRegionEnrichmentResult {
  components: import('@/types/board').BoardComponent[]
  regions: VirtualRegion[]
}

export interface PdfRegionContext {
  hits?: import('@/lib/pdfComponentExtractor').PdfTextHit[]
  pageCount?: number
  netLabels?: import('@/types/pdfNetGraph').PdfNetLabel[]
}
