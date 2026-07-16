'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  SplitCurve,
  EMPTY_SPLIT_CURVE,
  densifySplitCurve,
  validateSplitCurve,
  CurveValidation,
} from '@/lib/split-curve'
import { ScrewChannel } from '@/lib/screw-channels'

const MAX_UNDO = 50

export interface SplitCurveTool {
  curve: SplitCurve
  densified: THREE.Vector3[]
  validation: CurveValidation
  selectedIndex: number | null
  addPoint: (point: THREE.Vector3) => void
  movePoint: (index: number, point: THREE.Vector3) => void
  /** Commit del punto a fine drag (spinge lo stato pre-drag nello stack undo) */
  beginDrag: () => void
  insertPointNear: (point: THREE.Vector3) => void
  deletePoint: (index: number) => void
  selectPoint: (index: number | null) => void
  closeLoop: () => void
  undo: () => void
  clear: () => void
  setCurve: (curve: SplitCurve) => void
  canClose: boolean
  canUndo: boolean
}

interface UseSplitCurveToolArgs {
  geometry: THREE.BufferGeometry | null
  channels: ScrewChannel[]
  insertionAxis: THREE.Vector3 | null
}

export function useSplitCurveTool({ geometry, channels, insertionAxis }: UseSplitCurveToolArgs): SplitCurveTool {
  const [curve, setCurveState] = useState<SplitCurve>(EMPTY_SPLIT_CURVE)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const undoStack = useRef<SplitCurve[]>([])
  const [undoSize, setUndoSize] = useState(0)

  const pushUndo = useCallback((snapshot: SplitCurve) => {
    undoStack.current.push({
      controlPoints: snapshot.controlPoints.map(p => p.clone()),
      closed: snapshot.closed,
    })
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
    setUndoSize(undoStack.current.length)
  }, [])

  const addPoint = useCallback((point: THREE.Vector3) => {
    setCurveState(prev => {
      pushUndo(prev)
      return { ...prev, controlPoints: [...prev.controlPoints, point.clone()] }
    })
  }, [pushUndo])

  const movePoint = useCallback((index: number, point: THREE.Vector3) => {
    setCurveState(prev => {
      if (index < 0 || index >= prev.controlPoints.length) return prev
      const controlPoints = prev.controlPoints.slice()
      controlPoints[index] = point.clone()
      return { ...prev, controlPoints }
    })
  }, [])

  const beginDrag = useCallback(() => {
    // Snapshot dello stato pre-drag: i movePoint durante il drag non
    // passano dallo stack, così l'undo annulla l'intero trascinamento
    setCurveState(prev => {
      pushUndo(prev)
      return prev
    })
  }, [pushUndo])

  const insertPointNear = useCallback((point: THREE.Vector3) => {
    setCurveState(prev => {
      const n = prev.controlPoints.length
      if (n < 2) return prev
      pushUndo(prev)
      // Trova il segmento più vicino al punto e inserisce dopo il suo primo estremo
      let bestSeg = 0
      let bestDist = Infinity
      const segCount = prev.closed ? n : n - 1
      const line = new THREE.Line3()
      const closest = new THREE.Vector3()
      for (let i = 0; i < segCount; i++) {
        line.set(prev.controlPoints[i], prev.controlPoints[(i + 1) % n])
        line.closestPointToPoint(point, true, closest)
        const d = closest.distanceToSquared(point)
        if (d < bestDist) { bestDist = d; bestSeg = i }
      }
      const controlPoints = prev.controlPoints.slice()
      controlPoints.splice(bestSeg + 1, 0, point.clone())
      return { ...prev, controlPoints }
    })
  }, [pushUndo])

  const deletePoint = useCallback((index: number) => {
    setCurveState(prev => {
      if (index < 0 || index >= prev.controlPoints.length) return prev
      pushUndo(prev)
      const controlPoints = prev.controlPoints.filter((_, i) => i !== index)
      return {
        controlPoints,
        closed: controlPoints.length >= 3 ? prev.closed : false,
      }
    })
    setSelectedIndex(null)
  }, [pushUndo])

  const closeLoop = useCallback(() => {
    setCurveState(prev => {
      if (prev.controlPoints.length < 3 || prev.closed) return prev
      pushUndo(prev)
      return { ...prev, closed: true }
    })
  }, [pushUndo])

  const undo = useCallback(() => {
    const last = undoStack.current.pop()
    setUndoSize(undoStack.current.length)
    if (last) {
      setCurveState(last)
      setSelectedIndex(null)
    }
  }, [])

  const clear = useCallback(() => {
    setCurveState(prev => {
      if (prev.controlPoints.length > 0) pushUndo(prev)
      return EMPTY_SPLIT_CURVE
    })
    setSelectedIndex(null)
  }, [pushUndo])

  const setCurve = useCallback((next: SplitCurve) => {
    setCurveState(prev => {
      if (prev.controlPoints.length > 0) pushUndo(prev)
      return {
        controlPoints: next.controlPoints.map(p => p.clone()),
        closed: next.closed,
      }
    })
    setSelectedIndex(null)
  }, [pushUndo])

  const densified = useMemo(
    () => densifySplitCurve(curve, geometry),
    [curve, geometry]
  )

  const validation = useMemo(
    () => validateSplitCurve(curve, densified, channels, insertionAxis),
    [curve, densified, channels, insertionAxis]
  )

  return {
    curve,
    densified,
    validation,
    selectedIndex,
    addPoint,
    movePoint,
    beginDrag,
    insertPointNear,
    deletePoint,
    selectPoint: setSelectedIndex,
    closeLoop,
    undo,
    clear,
    setCurve,
    canClose: !curve.closed && curve.controlPoints.length >= 3,
    canUndo: undoSize > 0,
  }
}
