// stores/workspaceStore.ts

import { create } from 'zustand';
import { db } from '@/lib/firebase'; // Firebase db örneğinizin yolu
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';

// Firestore'daki slack_workspaces belgelerinin yapısını temsil eder
// Frontend'de dropdown için en azından workspace_id ve workspace_name gerekli.
export interface SlackWorkspace {
  workspace_id: string;    // Slack team.id, Firestore'daki belge ID'si
  workspace_name: string;
  bot_token?: string;      // Frontend'de doğrudan gerekmeyebilir ama tamlık için eklenebilir
  status?: string;         // 'active' olanları çekeceğiz
  app_id?: string;
  bot_user_id?: string;
  scopes?: string;
  installation_date?: Timestamp; // Firestore Timestamp
}

interface WorkspaceState {
  workspaces: SlackWorkspace[];
  selectedWorkspaceId: string | null;
  isLoadingWorkspaces: boolean;
  fetchWorkspaces: () => Promise<void>;
  setSelectedWorkspaceId: (id: string | null) => void;
}

// Helper to get initial state from localStorage
const getInitialWorkspaceId = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('selected-workspace-id');
  }
  return null;
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  selectedWorkspaceId: null, // Always initialize as null to prevent hydration errors
  isLoadingWorkspaces: false,
  setSelectedWorkspaceId: (id) => {
    set({ selectedWorkspaceId: id });
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('selected-workspace-id', id);
        console.log(`Workspace ID ${id} saved to localStorage.`);
      } else {
        localStorage.removeItem('selected-workspace-id');
        console.log('Workspace ID removed from localStorage.');
      }
    }
  },
  fetchWorkspaces: async () => {
    if (get().isLoadingWorkspaces) return; // Zaten yükleniyorsa tekrar çağırma
    set({ isLoadingWorkspaces: true });
    try {
      const q = query(
        collection(db, 'slack_workspaces'),
        where('status', '==', 'active')
      );
      const querySnapshot = await getDocs(q);
      const fetchedWorkspaces: SlackWorkspace[] = [];
      querySnapshot.forEach((doc) => {
        fetchedWorkspaces.push({
            workspace_id: doc.id, 
            ...(doc.data() as Omit<SlackWorkspace, 'workspace_id'>)
        });
      });
      
      set({ workspaces: fetchedWorkspaces, isLoadingWorkspaces: false });

      // If, after fetching, there is still no selected ID (from hydration), set a default one.
      if (!get().selectedWorkspaceId && fetchedWorkspaces.length > 0) {
        const defaultId = fetchedWorkspaces[0].workspace_id;
        // Call the full action to ensure localStorage is also updated.
        get().setSelectedWorkspaceId(defaultId);
        console.log(`Default workspace ID ${defaultId} set and saved to localStorage.`);
      }
       console.log('Workspaces fetched:', fetchedWorkspaces);
       if (get().selectedWorkspaceId) {
           console.log('Selected workspace ID set to:', get().selectedWorkspaceId);
       }

    } catch (error) {
      console.error("Error fetching workspaces: ", error);
      set({ isLoadingWorkspaces: false, workspaces: [] });
    }
  },
})); 