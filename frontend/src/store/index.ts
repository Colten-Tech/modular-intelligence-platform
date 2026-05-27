import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AppStore {
  user: User | null
  setUser: (user: User | null) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  activeModuleId: string | null
  setActiveModule: (id: string | null) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),

      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      activeModuleId: null,
      setActiveModule: (id) => set({ activeModuleId: id }),
    }),
    {
      name: 'mip-app-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
)
