import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import { AppRoutes } from './App'
import './components/components.css'
import { createQueryClient } from './queryClient'
import './styles/app.css'
import './styles/forms.css'
import './tokens.css'

const queryClient = createQueryClient()

// A data router is what lets a form block navigation while it holds unsaved changes.
const router = createBrowserRouter([{ path: '*', element: <AppRoutes /> }])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
