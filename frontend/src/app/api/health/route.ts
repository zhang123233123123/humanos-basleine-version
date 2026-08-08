import { humanosErrorResponse, humanosRequest } from '@/lib/server/humanos-api'

export async function GET() {
  try {
    return Response.json(await humanosRequest('GET', '/api/health'))
  } catch (error) {
    return humanosErrorResponse(error)
  }
}
