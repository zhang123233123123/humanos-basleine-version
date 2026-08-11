import { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const HUMANOS_BACKEND = process.env.HUMANOS_BACKEND_URL || 'http://localhost:8787'

const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        const email = credentials.email.trim().toLowerCase()

        let res: Response
        try {
          res = await fetch(`${HUMANOS_BACKEND}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(8_000),
            body: JSON.stringify({
              email,
              password: credentials.password || '',
            }),
          })
        } catch {
          throw new Error('AUTH_SERVICE_UNAVAILABLE')
        }

        if (res.status === 401) return null
        if (!res.ok) throw new Error('AUTH_SERVICE_UNAVAILABLE')

        const data = await res.json().catch(() => null)
        if (!data?.user?.id) throw new Error('AUTH_SERVICE_UNAVAILABLE')
        return {
          id: data.user.id,
          email,
          name: data.user.name || email,
          image: data.user.avatar || null,
        }
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
    verifyRequest: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.humanosUserId = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && typeof token.humanosUserId === 'string') {
        session.user.id = token.humanosUserId
      }
      return session
    },
  },
}

export default authOptions
