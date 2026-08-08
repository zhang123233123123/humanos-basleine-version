import { getServerSession } from 'next-auth'
import authOptions from '@/app/api/auth/[...nextauth]/authOptions'

const HUMANOS_BACKEND = process.env.HUMANOS_BACKEND_URL || 'http://localhost:8787'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const userEmail = session?.user?.email || 'demo'

    const url = new URL(`${HUMANOS_BACKEND}/api/profile`)
    url.searchParams.set('user_id', userEmail)

    const res = await fetch(url)
    if (!res.ok) throw new Error('HumanOS backend error')
    const data = await res.json()
    return Response.json(data)
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const userEmail = session?.user?.email || 'demo'

    const body = await req.json()
    const res = await fetch(`${HUMANOS_BACKEND}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, user_id: userEmail }),
    })

    if (!res.ok) throw new Error('HumanOS backend error')
    const data = await res.json()
    return Response.json(data)
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
