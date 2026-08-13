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
  const [registerFeedback, setRegisterFeedback] = useState<{
    kind: 'progress' | 'success' | 'error'
    message: string
  } | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast(t('login.fillAllFields'))
      return
    }
    setLoading(true)
    setRegisterFeedback({
      kind: 'progress',
      message: locale === 'zh' ? '正在检查邮箱和用户名…' : 'Checking email and username…',
    })
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
        if (res.status === 409 && (err.error === 'email_exists' || err.error === 'account_exists')) {
          const message = locale === 'zh'
            ? `注册失败：邮箱 ${err.email || email.trim()} 已存在，对应用户名为 ${err.username || '—'}。`
            : `Registration failed: ${err.email || email.trim()} already exists (username: ${err.username || '—'}).`
          setRegisterFeedback({ kind: 'error', message })
          toast.error(message)
          return
        }
        if (res.status === 409 && err.error === 'username_exists') {
          const message = locale === 'zh'
            ? `注册失败：用户名 ${err.username || name.trim()} 已存在，请更换用户名。`
            : `Registration failed: username ${err.username || name.trim()} already exists. Choose another username.`
          setRegisterFeedback({ kind: 'error', message })
          toast.error(message)
          return
        }
        const message = err.message || err.error || t('login.registerFailed')
        setRegisterFeedback({ kind: 'error', message })
        toast.error(message)
        return
      }
      const registeredEmail = email.trim().toLowerCase()
      const successMessage = locale === 'zh'
        ? `账号创建成功：邮箱 ${registeredEmail}，用户名 ${name.trim()}。正在登录…`
        : `Account created: ${registeredEmail} (username: ${name.trim()}). Signing in…`
      setRegisterFeedback({ kind: 'success', message: successMessage })
      toast.success(successMessage, { duration: 4000 })
      // A new HumanOS account always starts in daytime mode. This also
      // clears a dark preference left by another account in this browser.
      window.localStorage.setItem('theme', 'light')
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
      // Auto login after register
      const result = await signIn('credentials', {
        email: registeredEmail,
        password,
        callbackUrl: '/app',
        redirect: false,
      })
      if (!result?.ok || result.error) {
        const message = t('login.registerSuccessLoginFailed').replace('{email}', registeredEmail)
        setRegisterFeedback({ kind: 'error', message })
        toast.error(message)
        return
      }
      window.location.assign('/app/onboarding')
    } catch {
      const message = t('login.registerFailed')
      setRegisterFeedback({ kind: 'error', message })
      toast.error(message)
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
                  onChange={(e) => { setName(e.target.value); setRegisterFeedback(null) }}
                />
              )}
              <Input
                type="email"
                placeholder={t('login.emailPlaceholder')}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setRegisterFeedback(null) }}
              />
              <Input
                type="password"
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setRegisterFeedback(null) }}
              />
              {isRegister && registerFeedback ? (
                <div
                  role="status"
                  aria-live="polite"
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    registerFeedback.kind === 'error'
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : registerFeedback.kind === 'success'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-blue-200 bg-blue-50 text-blue-800'
                  }`}
                >
                  {registerFeedback.message}
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? (locale === 'zh' ? '处理中…' : 'Processing…')
                  : isRegister
                    ? t('login.registerButton')
                    : t('login.loginButton')}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setIsRegister(!isRegister); setRegisterFeedback(null) }}
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
