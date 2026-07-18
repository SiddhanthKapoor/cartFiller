import { useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import type { ProviderId, ShoppingList } from '@/shared/types'
import { useSettings } from './hooks/useSettings'
import { useJob } from './hooks/useJob'
import { useMeals } from './hooks/useMeals'
import { HomeScreen } from './screens/Home'
import { ReviewScreen } from './screens/Review'
import { ProgressScreen } from './screens/Progress'
import { SettingsScreen } from './screens/Settings'

type ScreenName = 'home' | 'review' | 'progress' | 'settings'

export default function App() {
  const { settings, update: updateSettings, loaded: settingsLoaded } = useSettings()
  const { job, loaded: jobLoaded, startFill, cancel } = useJob()
  const { meals, remember, favorite, remove } = useMeals()

  const [screen, setScreen] = useState<ScreenName>('home')
  const [list, setList] = useState<ShoppingList | null>(null)
  const [fillBusy, setFillBusy] = useState(false)
  const [routedToJob, setRoutedToJob] = useState(false)

  // If a fill is in flight when the popup opens, land on progress.
  useEffect(() => {
    if (!jobLoaded || routedToJob) return
    setRoutedToJob(true)
    if (job && job.status === 'running') setScreen('progress')
  }, [jobLoaded, job, routedToJob])

  if (!settingsLoaded || !jobLoaded) return null

  const openList = (next: ShoppingList) => {
    setList(next)
    setScreen('review')
  }

  const handleGenerated = (next: ShoppingList) => {
    void remember(next)
    openList(next)
  }

  const handleFill = async (provider: ProviderId) => {
    if (!list || fillBusy) return
    setFillBusy(true)
    try {
      void remember(list)
      const result = await startFill(list, provider, settings.skipPantryStaples)
      if (result.ok) setScreen('progress')
    } finally {
      setFillBusy(false)
    }
  }

  return (
    <div className="relative h-full overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        {screen === 'home' && (
          <HomeScreen
            key="home"
            settings={settings}
            meals={meals}
            onGenerated={handleGenerated}
            onOpenMeal={openList}
            onOpenSettings={() => setScreen('settings')}
            onToggleFavorite={(id) => void favorite(id)}
            onDeleteMeal={(id) => void remove(id)}
          />
        )}

        {screen === 'review' && list && (
          <ReviewScreen
            key="review"
            list={list}
            settings={settings}
            onUpdateSettings={updateSettings}
            onChangeList={setList}
            onBack={() => setScreen('home')}
            onFill={(provider) => void handleFill(provider)}
            fillBusy={fillBusy}
          />
        )}

        {screen === 'progress' && job && (
          <ProgressScreen
            key="progress"
            job={job}
            onCancel={() => void cancel()}
            onDone={() => setScreen('home')}
          />
        )}

        {screen === 'settings' && (
          <SettingsScreen
            key="settings"
            settings={settings}
            onSave={updateSettings}
            onBack={() => setScreen('home')}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
