'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import { Suspense } from 'react'
import { StlModel } from './stl-model'
import { LoadingSpinner } from './loading-spinner'

interface StlViewerProps {
  url: string
}

export function StlViewer({ url }: StlViewerProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 100], fov: 50 }}
      gl={{ preserveDrawingBuffer: true }}
      className="bg-background"
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[50, 50, 25]} intensity={1} castShadow />
      <directionalLight position={[-50, -50, -25]} intensity={0.3} />

      <Suspense fallback={<LoadingSpinner />}>
        <StlModel url={url} />
      </Suspense>

      <ContactShadows position={[0, -30, 0]} opacity={0.4} scale={100} blur={2} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      <gridHelper args={[200, 20, '#333', '#222']} position={[0, -30, 0]} />
    </Canvas>
  )
}
