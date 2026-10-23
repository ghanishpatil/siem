import { useState, useEffect, useCallback } from 'react'
import type { AlertStatsResponse, AlertResponse } from './types/alert'
import type { StatsResponse, EventResponse } from './types/event'
import type { HealthResponse } from './types/health'
import {
  getHealth,
  getAlertStats,
  getEventStats,
  listEvents,
  listAlerts,
} from './api/client'
import { useRoute } from './hooks/useRoute'
import { LandingView } from './components/landing/LandingView'
import { Sidebar, type NavSection } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { OverviewView } from './components/views/OverviewView'
import { AlertsView } from './components/views/AlertsView'
import { EventsView } from './components/views/EventsView'
import { RulesView } from './components/views/RulesView'
import { IngestionView } from './components/views/IngestionView'
import { SimulationLabView } from './components/views/SimulationLabView'
import { CorrelationEngineView } from './components/views/CorrelationEngineView'

export default function App() {
  const { route, navigate } = useRoute()
  const [currentSection, setCurrentSection] = useState<NavSection>('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false)

  // System Health
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [isOnline, setIsOnline] = useState<boolean>(false)
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(true)

  // Global Telemetry Data (Shared with Overview, Landing, and Sidebar counters)
  const [alertStats, setAlertStats] = useState<AlertStatsResponse | null>(null)
  const [eventStats, setEventStats] = useState<StatsResponse | null>(null)
  const [recentEvents, setRecentEvents] = useState<EventResponse[]>([])
  const [recentAlerts, setRecentAlerts] = useState<AlertResponse[]>([])

  const [loadingOverview, setLoadingOverview] = useState<boolean>(true)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)

  // Direct selection deep links across tabs
  const [targetAlertId, setTargetAlertId] = useState<number | null>(null)
  const [targetEventId, setTargetEventId] = useState<number | null>(null)

  // Load global telemetry data from backend
  const refreshGlobalData = useCallback(async () => {
    setIsRefreshing(true)
    setIsCheckingHealth(true)
    setOverviewError(null)

    try {
      // Health
      const healthData = await getHealth()
      setHealth(healthData)
      setIsOnline(true)

      // Fetch stats & recent lists in parallel
      const [aStats, eStats, evts, alrts] = await Promise.all([
        getAlertStats(),
        getEventStats(),
        listEvents({ limit: 100 }),
        listAlerts({ limit: 20 }),
      ])

      setAlertStats(aStats)
      setEventStats(eStats)
      setRecentEvents(evts.items)
      setRecentAlerts(alrts.items)
    } catch (err: unknown) {
      setIsOnline(false)
      setOverviewError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCheckingHealth(false)
      setIsRefreshing(false)
      setLoadingOverview(false)
    }
  }, [])

  useEffect(() => {
    refreshGlobalData()
  }, [refreshGlobalData])

  function handleSelectAlertFromOverview(alertId: number) {
    setTargetAlertId(alertId)
    setCurrentSection('alerts')
  }

  function handleSelectEventFromOverview(eventId: number) {
    setTargetEventId(eventId)
    setCurrentSection('events')
  }

  // Experience A: Public Landing Page (Default route '/')
  if (route === 'landing') {
    return (
      <LandingView
        onNavigateToDashboard={() => navigate('dashboard')}
        alertStats={alertStats}
        eventStats={eventStats}
        isOnline={isOnline}
      />
    )
  }

  // Experience B: Internal Security Operations Dashboard (Route '/dashboard')
  return (
    <div className="min-h-screen bg-canvas text-[#F1F5F9] flex flex-col md:flex-row antialiased selection:bg-cyan-500 selection:text-black">
      {/* Sidebar Navigation */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={(sec) => {
          setCurrentSection(sec)
          if (sec !== 'alerts') setTargetAlertId(null)
          if (sec !== 'events') setTargetEventId(null)
        }}
        alertCount={alertStats?.total_alerts}
        eventCount={eventStats?.total_events}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        version={health?.version || '0.1.0'}
        onNavigateToLanding={() => navigate('landing')}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-canvas">
        {/* Top Header Bar */}
        <TopBar
          currentSection={currentSection}
          isOnline={isOnline}
          isCheckingHealth={isCheckingHealth}
          onRefresh={refreshGlobalData}
          isRefreshing={isRefreshing}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        {/* Offline Warning Banner */}
        {!isOnline && !isCheckingHealth && (
          <div className="mx-4 md:mx-6 mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-600/50 text-rose-300 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-bold">FastAPI Connection Offline:</span> Unable to reach{' '}
              <code className="text-white">/api/health</code>. Verify backend daemon is active on port 8000.
            </div>
            <button
              onClick={refreshGlobalData}
              className="px-2.5 py-1 rounded bg-rose-900/60 border border-rose-500/50 text-white text-[11px] hover:bg-rose-800 transition-colors shrink-0"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Views */}
        <main className="flex-1 overflow-x-hidden">
          {currentSection === 'overview' && (
            <OverviewView
              alertStats={alertStats}
              eventStats={eventStats}
              recentEvents={recentEvents}
              recentAlerts={recentAlerts}
              loading={loadingOverview}
              error={overviewError}
              onRetry={refreshGlobalData}
              onSelectAlert={handleSelectAlertFromOverview}
              onSelectEvent={handleSelectEventFromOverview}
              onNavigateSection={setCurrentSection}
            />
          )}

          {currentSection === 'alerts' && (
            <AlertsView
              initialSelectedAlertId={targetAlertId}
              onAlertUpdated={refreshGlobalData}
              onNavigateToEvent={handleSelectEventFromOverview}
            />
          )}

          {currentSection === 'events' && (
            <EventsView
              initialSelectedEventId={targetEventId}
              onNavigateToAlert={handleSelectAlertFromOverview}
            />
          )}

          {currentSection === 'rules' && <RulesView />}

          {currentSection === 'correlation' && (
            <CorrelationEngineView
              onNavigateToAlert={handleSelectAlertFromOverview}
              onRefreshGlobal={refreshGlobalData}
            />
          )}

          {currentSection === 'ingestion' && (
            <IngestionView onEventsIngested={refreshGlobalData} />
          )}

          {currentSection === 'simulation' && (
            <SimulationLabView
              onNavigateToAlert={handleSelectAlertFromOverview}
              onNavigateToEvents={() => setCurrentSection('events')}
              onRefreshGlobal={refreshGlobalData}
            />
          )}
        </main>
      </div>
    </div>
  )
}
