'use client'

import { useState, useCallback } from 'react'
import * as THREE from 'three'
import { saveAnnotation, Annotation } from '@/lib/annotations'

interface AnnotationToolState {
  points: THREE.Vector3[]
  notes: string
  profile: Annotation['profile']
  thickness: number
}

interface AnnotationToolReturn {
  state: AnnotationToolState
  addPoint: (point: THREE.Vector3) => void
  undoPoint: () => void
  clearPoints: () => void
  setNotes: (notes: string) => void
  setProfile: (profile: Annotation['profile']) => void
  setThickness: (thickness: number) => void
  save: (stlFileName: string, implantCount: number) => Annotation | null
  canSave: boolean
}

export function useAnnotationTool(): AnnotationToolReturn {
  const [state, setState] = useState<AnnotationToolState>({
    points: [],
    notes: '',
    profile: 'oval',
    thickness: 1.5,
  })

  const addPoint = useCallback((point: THREE.Vector3) => {
    setState(prev => ({ ...prev, points: [...prev.points, point.clone()] }))
  }, [])

  const undoPoint = useCallback(() => {
    setState(prev => ({ ...prev, points: prev.points.slice(0, -1) }))
  }, [])

  const clearPoints = useCallback(() => {
    setState(prev => ({ ...prev, points: [] }))
  }, [])

  const setNotes = useCallback((notes: string) => {
    setState(prev => ({ ...prev, notes }))
  }, [])

  const setProfile = useCallback((profile: Annotation['profile']) => {
    setState(prev => ({ ...prev, profile }))
  }, [])

  const setThickness = useCallback((thickness: number) => {
    setState(prev => ({ ...prev, thickness }))
  }, [])

  const save = useCallback((stlFileName: string, implantCount: number): Annotation | null => {
    if (state.points.length === 0) return null

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      stlFileName,
      createdAt: new Date().toISOString(),
      implantCount,
      cutLinePoints: state.points.map(p => [p.x, p.y, p.z]),
      profile: state.profile,
      thickness: state.thickness,
      notes: state.notes,
    }
    saveAnnotation(annotation)
    setState(prev => ({ ...prev, points: [], notes: '' }))
    return annotation
  }, [state])

  return {
    state,
    addPoint,
    undoPoint,
    clearPoints,
    setNotes,
    setProfile,
    setThickness,
    save,
    canSave: state.points.length > 0,
  }
}
