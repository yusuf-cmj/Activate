'use client';

import { useEffect } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore'; // Store dosyanızın yolu

export function WorkspaceInitializer() {
  const fetchWorkspaces = useWorkspaceStore((state) => state.fetchWorkspaces);
  const workspacesLoaded = useWorkspaceStore((state) => state.workspaces.length > 0);
  const isLoading = useWorkspaceStore((state) => state.isLoadingWorkspaces);
  const setSelectedWorkspaceId = useWorkspaceStore((state) => state.setSelectedWorkspaceId);

  // This effect runs only once on mount to hydrate the store from localStorage.
  useEffect(() => {
    const savedWorkspaceId = localStorage.getItem('selected-workspace-id');
    if (savedWorkspaceId) {
      console.log(`WorkspaceInitializer: Hydrating workspace ID from localStorage: ${savedWorkspaceId}`);
      setSelectedWorkspaceId(savedWorkspaceId);
    }
    // This effect should run only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures it runs once on mount.

  // This effect handles fetching the list of workspaces if they aren't already loaded.
  useEffect(() => {
    if (!workspacesLoaded && !isLoading) {
      console.log('WorkspaceInitializer: Fetching workspaces...');
      fetchWorkspaces();
    }
  }, [fetchWorkspaces, workspacesLoaded, isLoading]);

  return null; // This component does not render anything.
} 