'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signIn } from 'next-auth/react'
import { useTranslation } from '@/i18n/LanguageProvider'
import { toast } from 'sonner'

export default function LoginPage() {
  const { t, locale } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRegister, setIsRegister] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast(t('login.fillAllFields'))
      return
    }
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        callbackUrl: '/app',
        redirect: false,
      })
      if (!result?.ok || result.error) {
        toast(result?.error === 'AUTH_SERVICE_UNAVAILABLE'
          ? t('login.serviceUnavailable')
          : t('login.invalidCredentials'))
        return
      }
      window.location.assign(result.url || '/app')
    } catch {
      toast(t('login.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !name) {
      toast(t('login.fillAllFields'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 409 && err.error === 'account_exists') {
          toast(locale === 'zh'
            ? `邮箱 ${err.email || email.trim()} 已经注册，用户名为 ${err.username || '—'}。请直接登录或使用其他邮箱。`
            : `Email ${err.email || email.trim()} is already registered under username ${err.username || '—'}. Sign in or use another email.`)
          return
        }
        toast(err.message || err.error || t('login.registerFailed'))
        return
      }
      const registeredEmail = email.trim().toLowerCase()
      toast.success(
        t('login.registerSuccess').replace('{email}', registeredEmail),
        { duration: 4000 },
      )
      // Keep the confirmation visible before automatic sign-in navigates away.
      await new Promise((resolve) => window.setTimeout(resolve, 900))
      // Auto login after register
      const result = await signIn('credentials', {
        email: registeredEmail,
        password,
        callbackUrl: '/app',
        redirect: false,
      })
      if (!result?.ok || result.error) {
        toast.error(t('login.registerSuccessLoginFailed').replace('{email}', registeredEmail))
        return
      }
      window.location.assign('/app/onboarding')
    } catch {
      toast(t('login.registerFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center w-full justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <div>
            <h2 className="mt-8 text-2xl font-bold leading-9 tracking-tight">
              {isRegister ? t('login.registerTitle') : t('login.title')}
            </h2>
          </div>

          <div className="mt-10">
            <form
              onSubmit={isRegister ? handleRegister : handleLogin}
              className="flex flex-col gap-4"
            >
              {isRegister && (
                <Input
                  type="text"
                  placeholder={t('login.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
              <Input
                type="email"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                type="password"
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? '...'
                  : isRegister
                    ? t('login.registerButton')
                    : t('login.loginButton')}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setIsRegister(!isRegister)}
                className="text-sm text-muted-foreground hover:underline"
              >
                {isRegister ? t('login.hasAccount') : t('login.noAccount')}
              </button>
            </div>

            <p className="text-muted-foreground text-sm text-center mt-8">
              {t('login.termsPrefix')}{' '}
              <Link href="#" className="text-muted-foreground/80">
                {t('login.termsOfService')}
              </Link>{' '}
              {t('login.and')}{' '}
              <Link href="#" className="text-muted-foreground/80">
                {t('login.privacyPolicy')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
