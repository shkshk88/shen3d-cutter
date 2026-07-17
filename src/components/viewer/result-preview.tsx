'use client'

import { Suspense, useMemo, useState } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, Bounds } from '@react-three/drei'
import { STLLoader } from 'three-stdlib'
import * as THREE from 'three'
import { Slider } from '@/components/ui/slider'
import { getDownloadUrl } from '@/lib/bar-client'

function PartMesh({ url, color, opacity, offset }: {
  url: string
  color: string
  opacity: number
  offset: THREE.Vector3
}) {
  const geometry = useLoader(STLLoader, url)
  geometry.computeVertexNormals()
  return (
    <mesh geometry={geometry} position={offset}>
      <meshStandardMaterial
        color={color}
        metalness={0.3}
        roughness={0.5}
        transparent={opacity < 1}
        opacity={opacity}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

interface ResultPreviewProps {
  barFile: string
  superFile: string
  /** Asse di inserzione (per l'esplosione della vista) */
  axis: [number, number, number]
  /** Punti della barra sotto lo spessore minimo (overlay rosso) */
  thinSpots?: [number, number, number][]
}

/**
 * Preview 3D del risultato: barra (indigo) + sovrastruttura (semi-trasparente)
 * con slider di esplosione lungo l'asse di inserzione e overlay dei punti
 * sotto spessore minimo.
 */
export function ResultPreview({ barFile, superFile, axis, thinSpots }: ResultPreviewProps) {
  const [explode, setExplode] = useState(0)
  const [showThinSpots, setShowThinSpots] = useState(true)

  const supOffset = useMemo(() => {
    const d = new THREE.Vector3(...axis)
    if (d.lengthSq() < 1e-9) d.set(0, 1, 0)
    return d.normalize().multiplyScalar(explode)
  }, [axis, explode])

  return (
    <div className="space-y-2">
      <div className="h-64 rounded-lg overflow-hidden border bg-background">
        <Canvas camera={{ position: [0, 0, 100], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[50, 80, 40]} intensity={1} />
          <directionalLight position={[-40, -60, -30]} intensity={0.3} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.3}>
              <PartMesh
                url={getDownloadUrl(barFile)}
                color="#6366f1"
                opacity={1}
                offset={new THREE.Vector3(0, 0, 0)}
              />
              <PartMesh
                url={getDownloadUrl(superFile)}
                color="#e2e8f0"
                opacity={0.55}
                offset={supOffset}
              />
            </Bounds>
          </Suspense>
          {showThinSpots && thinSpots?.map((p, i) => (
            <mesh key={i} position={p}>
              <sphereGeometry args={[0.35, 8, 8]} />
              <meshBasicMaterial color="#ef4444" transparent opacity={0.85} depthTest={false} />
            </mesh>
          ))}
          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
        </Canvas>
      </div>
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Esplodi</span>
        <Slider
          min={0}
          max={25}
          step={0.5}
          value={[explode]}
          onValueChange={(v) => setExplode(Array.isArray(v) ? v[0] : (v as number))}
        />
        <span className="text-xs w-12 text-right">{explode.toFixed(1)}mm</span>
        {thinSpots && thinSpots.length > 0 && (
          <button
            type="button"
            className={`text-xs px-2 py-0.5 rounded whitespace-nowrap border ${showThinSpots ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'text-muted-foreground border-border'}`}
            onClick={() => setShowThinSpots(!showThinSpots)}
            title="Punti della barra sotto lo spessore minimo"
          >
            ⚠ sottile ({thinSpots.length})
          </button>
        )}
      </div>
    </div>
  )
}
