"use client"; // Client-side rendering için gerekli

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase'; // Firebase db importu
import { collection, getDocs, Timestamp } from 'firebase/firestore';
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

// UserStatus için TypeScript interface'i
export interface UserStatus {
  id: string; // Firestore document ID (userId ile aynı olacak)
  userId: string;
  userName?: string;
  presence: 'active' | 'away' | string;
  last_checked: Timestamp;
  last_changed?: Timestamp;
}

// app/page.tsx'e özel PresenceLog, eğer util'deki ile birebir aynı değilse kalabilir,
// ama idealde util'deki kullanılmalı. Şimdilik util'dekini alias ile aldık.
// Eğer util'deki PresenceLog arayüzü userId içermiyorsa ve burada gerekiyorsa, bu tanım kalmalı
// veya util'deki güncellenmeli. Kontrol edelim: util'deki PresenceLog userId içeriyor.
// Bu yüzden aşağıdaki PresenceLog tanımını kaldırabiliriz.
/*
export interface PresenceLog {
  id: string; 
  userId: string;
  userName?: string;
  presence: string;
  timestamp: Timestamp;
  previousPresence?: string | null;
}
*/

// data-table.tsx'deki Zod şemasından DataTable'ın beklediği tipi alacağız.
// Bu tip, totalActiveToday alanını içerecek şekilde güncellenecek.
// Şimdilik MappedUserStatus olarak adlandıralım, data-table.tsx'deki schema güncellenince bu da uyumlu olacak.
type MappedUserStatusWithActiveTime = z.infer<typeof import('@/components/data-table').schema> & { totalActiveToday?: string };

export default function HomePage() {
  const [originalUserStatuses, setOriginalUserStatuses] = useState<UserStatus[]>([]);
  const [mappedDataForTable, setMappedDataForTable] = useState<MappedUserStatusWithActiveTime[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const statusesCollectionRef = collection(db, 'user_statuses');
        const statusesSnapshot = await getDocs(statusesCollectionRef);
        const statusesData = statusesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserStatus));
        
        setOriginalUserStatuses(statusesData);

        const todayString = formatDateToYYYYMMDD(new Date());
        
        const tableDataPromises = statusesData.map(async (status) => {
          try {
            // Her kullanıcı için o günkü aktivite verisini çek
            const activity: ActivityData = await calculateActivityForDate(db, status.userId, todayString);
            const activeTodayFormatted = formatDuration(activity.totalActiveMs);
            
            const baseMappedData = userStatusToDataTableSchema(status); // Bu fonksiyonun UserStatus tipini alması lazım
            return { 
              ...baseMappedData, 
              totalActiveToday: activeTodayFormatted 
            };
          } catch (userActivityError) {
            console.error(`Error fetching activity for user ${status.userId}:`, userActivityError);
          const baseMappedData = userStatusToDataTableSchema(status);
          return { 
            ...baseMappedData, 
              totalActiveToday: "Error" // Hata durumunda gösterilecek değer
          };
          }
        });

        const resolvedTableData = await Promise.all(tableDataPromises);
        setMappedDataForTable(resolvedTableData);

      } catch (err) {
        console.error("Error fetching data:", err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
        setError(errorMessage);
        setOriginalUserStatuses([]);
        setMappedDataForTable([]);
      }
      setIsLoading(false);
    };

    fetchData();
  }, []);

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
              <SectionCards 
                userStatuses={originalUserStatuses}
                isLoading={isLoading} 
                error={error} 
            />
              {/* <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div> */}
              <DataTable 
                data={mappedDataForTable} 
                isLoading={isLoading} 
                error={error} 
              /> 
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
