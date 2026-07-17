import { NextRequest, NextResponse } from 'next/server'

const CUTTER_API = process.env.CUTTER_API_URL || 'http://localhost:8001'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^[a-f0-9]{6,32}$/.test(id)) {
    return NextResponse.json({ error: 'job id non valido' }, { status: 422 })
  }

  const res = await fetch(`${CUTTER_API}/api/jobs/${id}`, { cache: 'no-store' })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
