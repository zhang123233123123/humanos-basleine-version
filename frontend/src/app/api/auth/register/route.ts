const HUMANOS_BACKEND = process.env.HUMANOS_BACKEND_URL || 'http://localhost:8787'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const res = await fetch(`${HUMANOS_BACKEND}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return Response.json(data, { status: res.status })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
