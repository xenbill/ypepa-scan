// Boot: apply the stored theme before the first paint, then mount the app.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { applyTextSize, applyTheme, watchOsTheme } from './theme'
import { queryClient } from './app/queryClient'
import AppRoutes from './app/routes'
import { ErrorBoundary } from './pages/StatusPage'

applyTheme()
applyTextSize()
watchOsTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
