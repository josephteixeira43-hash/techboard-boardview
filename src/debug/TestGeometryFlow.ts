import { validateParsedComponent } from '@/parsers/parseUtils'

export async function testGeometryFlow(): Promise<boolean> {
  console.log('🧪 TESTING GEOMETRY FLOW')
  console.log('='.repeat(50))

  const mockComponent = {
    ref: 'TEST_U1',
    posX: 100,
    posY: 200,
    width: 50,
    height: 25,
    layer: 'top',
  }

  console.log('1. Raw parser output:', mockComponent)

  const normalized = validateParsedComponent({
    id: mockComponent.ref,
    x: mockComponent.posX,
    y: mockComponent.posY,
    width: mockComponent.width,
    height: mockComponent.height,
    layer: mockComponent.layer,
  })

  console.log('2. Parsed component:', normalized)

  const hasRequiredFields =
    normalized != null &&
    normalized.id &&
    typeof normalized.x === 'number' &&
    typeof normalized.y === 'number' &&
    typeof normalized.width === 'number' &&
    typeof normalized.height === 'number'

  console.log('3. Validation:', hasRequiredFields ? '✅ PASS' : '❌ FAIL')

  if (!hasRequiredFields || !normalized) {
    console.error('❌ Parse validation failed')
    return false
  }

  console.log('4. Sample geometry:', {
    id: normalized.id,
    bounds: `x:${normalized.x}, y:${normalized.y}, w:${normalized.width}, h:${normalized.height}`,
  })

  console.log('='.repeat(50))
  console.log('✅ Geometry flow test complete')
  return true
}
