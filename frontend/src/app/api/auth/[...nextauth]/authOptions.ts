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

        try {
          const res = await fetch(`${HUMANOS_BACKEND}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password || credentials.email,
            }),
          })

          if (!res.ok) return null

          const data = await res.json()
          return {
            id: data.user?.id || credentials.email,
            email: credentials.email,
            name: data.user?.name || credentials.email,
            image: data.user?.avatar || null,
          }
        } catch {
          return null
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
}

export default authOptions
