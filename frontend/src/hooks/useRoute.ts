import { useState, useEffect, useCallback } from 'react'

export type AppRoute = 'landing' | 'dashboard'

function getInitialRoute(): AppRoute {
  if (typeof window === 'undefined') return 'landing'
  const path = window.location.pathname.toLowerCase()
  const hash = window.location.hash.toLowerCase()

  if (path === '/dashboard' || path.startsWith('/dashboard/') || hash === '#dashboard' || hash.startsWith('#/dashboard')) {
    return 'dashboard'
  }
  return 'landing'
}

export function useRoute() {
  const [route, setRoute] = useState<AppRoute>(getInitialRoute)

  useEffect(() => {
    function handleLocationChange() {
      setRoute(getInitialRoute())
    }

    window.addEventListener('popstate', handleLocationChange)
    window.addEventListener('hashchange', handleLocationChange)
    return () => {
      window.removeEventListener('popstate', handleLocationChange)
      window.removeEventListener('hashchange', handleLocationChange)
    }
  }, [])

  const navigate = useCallback((target: AppRoute) => {
    const targetPath = target === 'landing' ? '/' : '/dashboard'
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath)
      setRoute(target)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  return { route, navigate }
}
