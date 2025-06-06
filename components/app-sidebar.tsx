"use client"

import * as React from "react"
import {
  IconDashboard,
  IconHelp,
  IconInnerShadowTop,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useWorkspaceStore, SlackWorkspace } from "@/stores/workspaceStore"

const data = {
  user: {
    name: "CMJ",
    email: "0xboyraz@proton.me",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: IconDashboard,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: IconSettings,
    },
    {
      title: "Get Help",
      url: "#",
      icon: IconHelp,
    },
    {
      title: "Search",
      url: "#",
      icon: IconSearch,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const selectedWorkspaceId = useWorkspaceStore((state) => state.selectedWorkspaceId)
  const setSelectedWorkspaceId = useWorkspaceStore((state) => state.setSelectedWorkspaceId)
  const isLoadingWorkspaces = useWorkspaceStore((state) => state.isLoadingWorkspaces)

  const selectedWorkspaceName = React.useMemo(() => {
    if (isLoadingWorkspaces) return "Yükleniyor...";
    if (!selectedWorkspaceId && workspaces.length > 0) return "Çalışma Alanı Seçin...";
    if (!selectedWorkspaceId && workspaces.length === 0 && !isLoadingWorkspaces) return "Çalışma Alanı Yok";
    const workspace = workspaces.find(ws => ws.workspace_id === selectedWorkspaceId);
    return workspace ? workspace.workspace_name : "Çalışma Alanı Seçin...";
  }, [selectedWorkspaceId, workspaces, isLoadingWorkspaces]);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="p-2.5">
        <Select
          value={selectedWorkspaceId ?? ""}
          onValueChange={(value) => {
            setSelectedWorkspaceId(value || null);
          }}
          disabled={isLoadingWorkspaces || workspaces.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={selectedWorkspaceName} />
          </SelectTrigger>
          <SelectContent>
            {workspaces.length === 0 && !isLoadingWorkspaces && (
              <div className="p-2 text-sm text-muted-foreground text-center">
                Aktif çalışma alanı bulunamadı.
              </div>
            )}
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.workspace_id} value={workspace.workspace_id}>
                {workspace.workspace_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
