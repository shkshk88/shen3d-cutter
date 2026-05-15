import { NextRequest, NextResponse } from 'next/server'

const CUTTER_API = process.env.CUTTER_API_URL || 'http://localhost:8001'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params

  const res = await fetch(`${CUTTER_API}/api/download/${filename}`)

  if (!res.ok) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const data = await res.arrayBuffer()
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
