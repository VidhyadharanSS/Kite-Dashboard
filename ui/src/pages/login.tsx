import { FormEvent, useState } from 'react'
import Logo from '@/assets/icon.svg'
import { useAuth } from '@/contexts/auth-context'
import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router-dom'

import { withSubPath } from '@/lib/subpath'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LanguageToggle } from '@/components/language-toggle'

export function LoginPage() {
  const { t } = useTranslation()
  const { user, login, loginWithPassword, providers, isLoading } = useAuth()
  const [searchParams] = useSearchParams()
  const [loginLoading, setLoginLoading] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const error = searchParams.get('error')

  if (user && !isLoading) {
    return <Navigate to="/" replace />
  }

  const handleLogin = async (provider: string) => {
    setLoginLoading(provider)
    try {
      await login(provider)
    } catch (error) {
      console.error('Login error:', error)
      setLoginLoading(null)
    }
  }

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault()
    setLoginLoading('password')
    setPasswordError(null)
    try {
      await loginWithPassword(username, password)
    } catch (err) {
      if (err instanceof Error) {
        setPasswordError(err.message || t('login.errors.invalidCredentials'))
      } else {
        setPasswordError(t('login.errors.unknownError'))
      }
    } finally {
      setLoginLoading(null)
    }
  }

  const getErrorMessage = (errorCode: string | null) => {
    if (!errorCode) return null
    const provider = searchParams.get('provider') || 'OAuth provider'
    const user = searchParams.get('user')
    const reason = searchParams.get('reason') || errorCode

    switch (reason) {
      case 'insufficient_permissions':
        return {
          title: t('login.errors.accessDenied'),
          message: user
            ? t('login.errors.insufficientPermissionsUser', { user })
            : t('login.errors.insufficientPermissions'),
          details: t('login.errors.insufficientPermissionsDetails'),
        }
      case 'token_exchange_failed':
        return {
          title: t('login.errors.authenticationFailed'),
          message: t('login.errors.tokenExchangeFailed', { provider }),
          details: t('login.errors.tokenExchangeDetails'),
        }
      case 'user_info_failed':
        return {
          title: t('login.errors.profileAccessFailed'),
          message: t('login.errors.userInfoFailed', { provider }),
          details: t('login.errors.userInfoDetails'),
        }
      case 'jwt_generation_failed':
        return {
          title: t('login.errors.sessionCreationFailed'),
          message: user
            ? t('login.errors.jwtGenerationFailedUser', { user })
            : t('login.errors.jwtGenerationFailed'),
          details: t('login.errors.jwtGenerationDetails'),
        }
      case 'callback_failed':
        return {
          title: t('login.errors.oauthCallbackFailed'),
          message: t('login.errors.callbackFailed'),
          details: t('login.errors.contactSupport'),
        }
      case 'callback_error':
        return {
          title: t('login.errors.authenticationError'),
          message: t('login.errors.callbackError'),
          details: t('login.errors.contactSupport'),
        }
      case 'user_disabled':
        return {
          title: t('login.errors.userDisabled', 'User Disabled'),
          message: t('login.errors.userDisabledMessage'),
        }
      default:
        return {
          title: t('login.errors.authenticationError'),
          message: t('login.errors.generalError'),
          details: t('login.errors.contactSupport'),
        }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground animate-pulse">Authenticating...</p>
        </div>
      </div>
    )
  }

  const errorInfo = getErrorMessage(error)

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px] animate-pulse [animation-delay:2s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-violet-600/5 blur-[100px]" />
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <img src={Logo} className="h-6 w-6 invert opacity-80" alt="Kites" />
          <span className="text-white/60 text-sm font-medium tracking-wide">Kites</span>
        </div>
        <LanguageToggle />
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">

          {/* Logo + Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-5 shadow-2xl backdrop-blur-sm">
              <img src={Logo} className="h-8 w-8 invert" alt="Kites" />
            </div>
            <h1 className="text-2xl font-semibold text-white mb-1">{t('login.signIn')}</h1>
            <p className="text-sm text-white/50">{t('login.subtitle')}</p>
          </div>

          {/* Error Alert */}
          {errorInfo && (
            <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 backdrop-blur-sm p-4 text-sm">
              <p className="font-semibold text-red-400">{errorInfo.title}</p>
              <p className="text-red-300/80 mt-1">{errorInfo.message}</p>
              {errorInfo.details && (
                <p className="text-red-400/60 text-xs mt-2">{errorInfo.details}</p>
              )}
              {(searchParams.get('reason') === 'insufficient_permissions' || error === 'insufficient_permissions') && (
                <button
                  onClick={() => { window.location.href = withSubPath('/login') }}
                  className="mt-3 w-full text-xs font-medium text-red-300 underline underline-offset-2 hover:text-red-200"
                >
                  {t('login.tryAgainDifferentAccount')}
                </button>
              )}
            </div>
          )}

          {/* Auth Card */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl p-6 space-y-5">
            {providers.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-white/50 text-sm">{t('login.noLoginMethods')}</p>
                <p className="text-white/30 text-xs mt-2">{t('login.configureAuth')}</p>
              </div>
            ) : (
              <>
                {/* Password Login */}
                {providers.includes('password') && (
                  <form onSubmit={handlePasswordLogin} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="username" className="text-white/70 text-xs uppercase tracking-wider font-semibold">
                        {t('login.usernameOrEmail', 'Username or Email')}
                      </Label>
                      <Input
                        id="username"
                        type="text"
                        placeholder={t('login.enterUsernameOrEmail', 'Enter your username or email')}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 focus:ring-white/10 h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="password" className="text-white/70 text-xs uppercase tracking-wider font-semibold">
                        {t('login.password')}
                      </Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder={t('login.enterPassword')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 focus:ring-white/10 h-11"
                      />
                    </div>
                    {passwordError && (
                      <Alert variant="destructive" className="bg-red-900/30 border-red-500/30 text-red-300">
                        <AlertDescription>{passwordError}</AlertDescription>
                      </Alert>
                    )}
                    <Button
                      type="submit"
                      disabled={loginLoading !== null}
                      className="w-full h-11 bg-white text-slate-900 hover:bg-white/90 font-semibold transition-all duration-200 shadow-lg shadow-white/10"
                    >
                      {loginLoading === 'password' ? (
                        <div className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-900 border-t-transparent" />
                          <span>{t('login.signingIn')}</span>
                        </div>
                      ) : (
                        t('login.signInWithPassword')
                      )}
                    </Button>
                  </form>
                )}

                {/* Divider if both password and oauth providers exist */}
                {providers.filter((p) => p !== 'password').length > 0 && providers.includes('password') && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-white/10" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-3 text-[10px] uppercase tracking-wider text-white/30 bg-transparent">
                        {t('login.orContinueWith')}
                      </span>
                    </div>
                  </div>
                )}

                {/* OAuth Providers */}
                {providers.filter((p) => p !== 'password').map((provider) => (
                  <Button
                    key={provider}
                    onClick={() => handleLogin(provider)}
                    disabled={loginLoading !== null}
                    className="w-full h-11 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white font-medium transition-all duration-200"
                    variant="ghost"
                  >
                    {loginLoading === provider ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        <span>{t('login.signingIn')}</span>
                      </div>
                    ) : (
                      <span>
                        {t('login.signInWith', {
                          provider: provider.charAt(0).toUpperCase() + provider.slice(1),
                        })}
                      </span>
                    )}
                  </Button>
                ))}
              </>
            )}
          </div>

          {/* Footer note */}
          <p className="text-center text-[11px] text-white/25 mt-6">
            Access Kites dashboard
          </p>
        </div>
      </div>
    </div>
  )
}
