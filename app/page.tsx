"use client"; // Client-side rendering için gerekli

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase'; // Firebase db importu
import { collection, getDocs, Timestamp, query, where } from 'firebase/firestore';
import { userStatusToDataTableSchema } from '@/components/data-table';
import type { z } from 'zod';

// lib/activityUtils.ts'den importlar
import {
  calculateActivityForDate,
  formatDuration,
  formatDateToYYYYMMDD,
  type ActivityData
} from '@/lib/activityUtils';

import { AppSidebar } from "@/components/app-sidebar";
import { DataTable } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
import { SiteHeader } from "@/components/site-header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

// Zustand store importu
import { useWorkspaceStore } from '@/stores/workspaceStore';

// UserStatus için TypeScript interface'i
// Bu arayüz, app/api/cron/check-presence/route.ts içindeki UserStatus ile uyumlu olmalı
export interface UserStatus {
  id: string; // Firestore document ID (örn: workspaceId_userId)
  user_id: string; // Gerçek Slack kullanıcı ID\'si
  workspace_id: string; 
  name: string; // Slack user.name
  status_text?: string;
  status_emoji?: string;
  status_expiration?: number;
  real_name?: string;
  display_name?: string;
  image_original?: string;
  updated_at: Timestamp; // Firestore Timestamp (last_checked gibi düşünülebilir)
  // Orijinal UserStatus'tan presence ve last_changed gibi alanlar da gerekebilir
  // data-table'ın ne beklediğine bağlı.
  // Şimdilik cron'daki UserStatus'a benzer tutalım.
  presence?: 'active' | 'away' | string; // Bu alan cron job'daki UserStatus'ta yoktu, ama presence_logs'tan gelebilir
                                      // VEYA user_statuses'a eklenebilir. Şimdilik opsiyonel.
}

// data-table.tsx'deki Zod şemasından DataTable'ın beklediği tipi alacağız.
// Bu tip, totalActiveToday alanını içerecek şekilde güncellenecek.
// Şimdilik MappedUserStatus olarak adlandıralım, data-table.tsx'deki schema güncellenince bu da uyumlu olacak.
type MappedUserStatusWithActiveTime = z.infer<typeof import('@/components/data-table').schema> & { totalActiveToday?: string };

export default function HomePage() {
  const [originalUserStatuses, setOriginalUserStatuses] = useState<UserStatus[]>([]);
  const [mappedDataForTable, setMappedDataForTable] = useState<MappedUserStatusWithActiveTime[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Zustand store'dan seçili workspace ID'sini al
  const selectedWorkspaceId = useWorkspaceStore((state) => state.selectedWorkspaceId);
  const workspacesLoading = useWorkspaceStore((state) => state.isLoadingWorkspaces);

  useEffect(() => {
    const fetchData = async () => {
      if (workspacesLoading) {
        setIsLoading(true); 
        setOriginalUserStatuses([]);
        setMappedDataForTable([]);
        // console.log("HomePage: Workspaces are loading, waiting...");
        return;
      }
      
      if (!selectedWorkspaceId) {
        setIsLoading(false);
        // setError("Lütfen bir çalışma alanı seçin."); // Bu mesajı SectionCards veya DataTable içinde gösterebiliriz.
        setOriginalUserStatuses([]);
        setMappedDataForTable([]);
        // console.log("HomePage: No workspace selected.");
        return;
      }

      setIsLoading(true);
      setError(null);
      // console.log(`HomePage: Fetching data for workspace ID: ${selectedWorkspaceId}`);

      try {
        const statusesCollectionRef = collection(db, 'user_statuses');
        const q = query(statusesCollectionRef, where('workspace_id', '==', selectedWorkspaceId));
        const statusesSnapshot = await getDocs(q);
        
        // Firestore'dan gelen veriyi UserStatus arayüzüne map'leyelim
        const statusesData = statusesSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id, // workspaceId_userId
            user_id: data.user_id,
            workspace_id: data.workspace_id,
            name: data.name,
            status_text: data.status_text,
            status_emoji: data.status_emoji,
            status_expiration: data.status_expiration,
            real_name: data.real_name,
            display_name: data.display_name,
            image_original: data.image_original,
            updated_at: data.updated_at,
            // Eğer user_statuses'ta presence alanı da varsa:
            presence: data.presence,
          } as UserStatus; 
        });
        
        // console.log(`Fetched ${statusesData.length} user statuses for workspace ${selectedWorkspaceId}`);
        setOriginalUserStatuses(statusesData);

        const todayString = formatDateToYYYYMMDD(new Date());
        
        const tableDataPromises = statusesData.map(async (status) => {
          try {
            const activity: ActivityData = await calculateActivityForDate(db, status.user_id, todayString, selectedWorkspaceId);
            const activeTodayFormatted = formatDuration(activity.totalActiveMs);
            
            // userStatusToDataTableSchema'ya UserStatus tipinde veri gönderiyoruz
            const baseMappedData = userStatusToDataTableSchema(status); 
            return { 
              ...baseMappedData, 
              totalActiveToday: activeTodayFormatted 
            };
          } catch (userActivityError) {
            console.error(`Error fetching activity for user ${status.user_id} in workspace ${selectedWorkspaceId}:`, userActivityError);
          const baseMappedData = userStatusToDataTableSchema(status);
          return { 
            ...baseMappedData, 
              totalActiveToday: "Error"
          };
          }
        });

        const resolvedTableData = await Promise.all(tableDataPromises);
        setMappedDataForTable(resolvedTableData);

      } catch (err) {
        console.error(`Error fetching data for workspace ${selectedWorkspaceId}:`, err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
        setError(errorMessage);
        setOriginalUserStatuses([]);
        setMappedDataForTable([]);
      }
      setIsLoading(false);
    };

    fetchData();
  }, [selectedWorkspaceId, workspacesLoading]);

  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "calc(var(--spacing) * 72)",
        "--header-height": "calc(var(--spacing) * 12)",
      } as React.CSSProperties}
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="grid grid-cols-1 gap-4 @container">
              <SectionCards 
                userStatuses={originalUserStatuses}
                isLoading={isLoading} 
                error={error} 
            />
              </div>
              {/* <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div> */}
              <div className="border rounded-lg shadow-sm">
              <DataTable 
                data={mappedDataForTable} 
                isLoading={isLoading} 
                error={error} 
              /> 
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
