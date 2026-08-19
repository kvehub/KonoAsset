import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ThemeProvider } from '@/components/functional/ThemeProvider'
import { Toaster } from '@/components/ui/toaster'
import { PreferenceContextProvider } from '@/components/context/PreferenceContext'
import { LocalizationContextProvider } from '@/components/context/LocalizationContext'
import { DragDropEmitter } from '@/components/functional/DragDropEmitter'

import '../index.css'

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <PreferenceContextProvider>
        <LocalizationContextProvider>
          <DragDropEmitter>
            <Outlet />
            <Toaster />
          </DragDropEmitter>
        </LocalizationContextProvider>
      </PreferenceContextProvider>
    </ThemeProvider>
  ),
})
