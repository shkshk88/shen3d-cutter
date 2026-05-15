import { NextRequest, NextResponse } from 'next/server'

const CUTTER_API = process.env.CUTTER_API_URL || 'http://localhost:8001'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const filePath = path.join('/')

  const res = await fetch(`${CUTTER_API}/api/${filePath}`)

  if (!res.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: res.status })
  }

  const data = await res.arrayBuffer()
  return new NextResponse(data, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
    },
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const filePath = path.join('/')
  const body = await req.arrayBuffer()

  const res = await fetch(`${CUTTER_API}/api/${filePath}`, {
    method: 'POST',
    headers: {
      'Content-Type': req.headers.get('Content-Type') || 'application/json',
    },
    body,
  })

  const data = await res.arrayBuffer()
  return new NextResponse(data, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
    },
    status: res.status,
  })
}
