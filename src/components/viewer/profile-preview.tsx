'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useState, useEffect, useRef } from 'react'
import { generateProfile, getDownloadUrl, ProfileResult } from '@/lib/cutter-client'
import { STLLoader } from 'three-stdlib'
import * as THREE from 'three'

interface ProfilePreviewProps {
  profileType: string
  profileParams: Record<string, number>
  profileId: string
}

function ProfileMesh({ url }: { url: string }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)

  useEffect(() => {
    const loader = new STLLoader()
    loader.load(url, (geo) => {
      geo.computeVertexNormals()
      geo.computeBoundingBox()
      const center = new THREE.Vector3()
      geo.boundingBox?.getCenter(center)
      geo.translate(-center.x, -center.y, -center.z)
      setGeometry(geo)
    })
  }, [url])

  if (!geometry) {
    return (
      <mesh>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#6366f1" wireframe />
      </mesh>
    )
  }

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#6366f1" />
    </mesh>
  )
}

export function ProfilePreview({ profileType, profileParams, profileId }: ProfilePreviewProps) {
  const [profileResult, setProfileResult] = useState<ProfileResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    generateProfile(profileType, profileParams)
      .then((result) => {
        if (!cancelled) {
          setProfileResult(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Errore generazione profilo')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [profileType, profileParams])

  const downloadUrl = profileResult ? getDownloadUrl(profileResult.stl_path.split('/').pop() ?? '') : ''

  return (
    <div className="space-y-2">
      <div className="h-40 w-full rounded-lg bg-muted border overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center p-4">
            <p className="text-xs text-destructive text-center">{error}</p>
          </div>
        ) : profileResult ? (
          <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <ProfileMesh url={`/api/cutter/download/${profileResult.stl_path.split('/').pop()}`} />
            <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={4} />
          </Canvas>
        ) : null}
      </div>
      {profileResult && (
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <p>{profileResult.vertices} vertici, {profileResult.faces} facce</p>
          {downloadUrl && (
            <a href={downloadUrl} download={`${profileId}.stl`}>
              <button className="w-full mt-1 py-1 px-2 rounded bg-primary text-primary-foreground text-xs hover:opacity-90">
                Scarica STL
              </button>
            </a>
          )}
        </div>
      )}
    </div>
  )
}
