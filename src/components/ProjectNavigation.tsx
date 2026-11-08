import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const ProjectNavigationContext = createContext({ isJob: false, setProjectStatus: (_id: string, _status: string) => {} })

export function ProjectNavigationProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const projectId = /^\/bids\/([^/]+)/.exec(pathname)?.[1]
  const [project, setProject] = useState<{ id: string; status: string } | null>(null)
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void supabase!.from('bids').select('status').eq('id', projectId).single().then(({ data }) => {
      if (!cancelled && data) setProject({ id: projectId, status: data.status })
    })
    return () => { cancelled = true }
  }, [projectId])
  return <ProjectNavigationContext.Provider value={{
    isJob: !!projectId && project?.id === projectId && project.status === 'won',
    setProjectStatus: (id, status) => setProject({ id, status }),
  }}>{children}</ProjectNavigationContext.Provider>
}

export const useProjectNavigation = () => useContext(ProjectNavigationContext)
