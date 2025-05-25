"use client"; // Client-side rendering için gerekli

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase'; // Firebase db importu
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { userStatusToDataTableSchema } from '@/components/data-table';
import type { z } from 'zod';

import { AppSidebar } from "@/components/app-sidebar";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
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

// PresenceLog için TypeScript interface'i
export interface PresenceLog {
  id: string; // Firestore document ID
  userId: string;
  userName?: string;
  presence: string;
  timestamp: Timestamp;
  previousPresence?: string | null;
}

// data-table.tsx'deki Zod şemasından DataTable'ın beklediği tipi alacağız.
// Bu tip, totalActiveToday alanını içerecek şekilde güncellenecek.
// Şimdilik MappedUserStatus olarak adlandıralım, data-table.tsx'deki schema güncellenince bu da uyumlu olacak.
type MappedUserStatusWithActiveTime = z.infer<typeof import('@/components/data-table').schema> & { totalActiveToday?: string };

// Helper to convert Firestore Timestamp to Date, if not already Date
function toDate(timestamp: Timestamp | Date): Date {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  return timestamp;
}

// Function to calculate daily active time
function calculateDailyActiveTime(
  userId: string,
  allLogsForUser: PresenceLog[], // All logs for this specific user, already filtered
  currentUserStatus: UserStatus
): string {
  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const events: { time: Date; type: string }[] = [];

  // 1. Determine initial state at startOfDay
  let stateAtStartOfDay = 'away';
  const logsBeforeToday = allLogsForUser
    .filter(log => log.timestamp && toDate(log.timestamp) < startOfDay)
    .sort((a, b) => toDate(b.timestamp).getTime() - toDate(a.timestamp).getTime());

  if (logsBeforeToday.length > 0) {
    stateAtStartOfDay = logsBeforeToday[0].presence;
  } else if (currentUserStatus.presence === 'active' && currentUserStatus.last_changed && toDate(currentUserStatus.last_changed) < startOfDay) {
    stateAtStartOfDay = 'active';
  }
  events.push({ time: startOfDay, type: stateAtStartOfDay });

  // 2. Add logs from today
  const todayLogs = allLogsForUser
    .filter(log => log.timestamp && toDate(log.timestamp) >= startOfDay && toDate(log.timestamp) <= now)
    .sort((a, b) => toDate(a.timestamp).getTime() - toDate(b.timestamp).getTime());

  todayLogs.forEach(log => {
    // Only add if it's a new event (different time or different type)
    // This helps to keep the event list cleaner if multiple logs at the exact same ms (unlikely with Firestore ts)
    const lastPushedEvent = events.length > 0 ? events[events.length -1] : null;
    if (!lastPushedEvent || toDate(log.timestamp).getTime() !== lastPushedEvent.time.getTime() || log.presence !== lastPushedEvent.type) {
        events.push({ time: toDate(log.timestamp), type: log.presence });
    }
  });
  
  // 3. Add current state at "now" to cap the last interval
  const lastEventInEvents = events.length > 0 ? events[events.length -1] : null;
    if (!lastEventInEvents || 
        lastEventInEvents.time.getTime() < now.getTime() || 
        (lastEventInEvents.time.getTime() === now.getTime() && lastEventInEvents.type !== currentUserStatus.presence)
    ) {
       events.push({ time: now, type: currentUserStatus.presence });
    }

  // 4. Sort events and remove consecutive duplicates by type to form clean state periods
  events.sort((a, b) => a.time.getTime() - b.time.getTime());
  const uniqueStateEvents: { time: Date; type: string }[] = [];
  if (events.length > 0) {
    uniqueStateEvents.push(events[0]);
    for (let i = 1; i < events.length; i++) {
      // Add if type is different OR if time is different (to keep all distinct log points)
      // We want to simplify sequences like: active(t1), active(t2), away(t3) into active(t1), away(t3)
      // This means, only add if the *type* is different from the last *uniqueStateEvent*.
      if (events[i].type !== uniqueStateEvents[uniqueStateEvents.length - 1].type) {
         // If the new event has the same time as the last one but different type, replace the last one.
         // This handles edge cases like: away(T1), active(T1) -> should just be active(T1)
         if (events[i].time.getTime() === uniqueStateEvents[uniqueStateEvents.length -1].time.getTime()){
            uniqueStateEvents[uniqueStateEvents.length -1] = events[i];
         } else {
            uniqueStateEvents.push(events[i]);
         }
      } else if (events[i].time.getTime() > uniqueStateEvents[uniqueStateEvents.length - 1].time.getTime()) {
        // If same type but later time, update the time of the last unique event to this later time
        // This is to ensure the state is seen as continuous until this new time.
        // NO, this is wrong. We need each distinct point if type is same.
        // The original filter was better: `event.type !== arr[index - 1].type || event.time.getTime() !== arr[index-1].time.getTime()`
        // For calculation, we need all points {time, type} that are not exact duplicates.
        // Let's revert to a simpler unique filter for exact {time, type} duplicates:
        // This is already handled implicitly by the forEach loop logic for adding todayLogs.
        // And the sort + calculation loop correctly handles sequences. So no complex unique filtering is needed beyond removing exact duplicates.
        // The current structure of `events` after step 3 should be sufficient if exact duplicates were avoided.

        // Let's ensure `events` has no exact consecutive {time, type} duplicates before calculation.
        // This can be done by rebuilding `uniqueStateEvents`
        // Or by refining the add logic. The add logic for todayLogs is one defense.
      }
    }
  }

  // Re-filter for unique state transitions for calculation
  const calculationEvents: { time: Date; type: string }[] = [];
  if (uniqueStateEvents.length > 0) {
    calculationEvents.push(uniqueStateEvents[0]);
    for (let i = 1; i < uniqueStateEvents.length; i++) {
        if (uniqueStateEvents[i].type !== calculationEvents[calculationEvents.length -1].type) {
            calculationEvents.push(uniqueStateEvents[i]);
        } else { // same type, update time to the latest if it's later.
           calculationEvents[calculationEvents.length -1].time = uniqueStateEvents[i].time;
        }
    }
  } else if (events.length > 0) { // Fallback if uniqueStateEvents logic has issue, use sorted events
     calculationEvents.push(events[0]);
     for (let i = 1; i < events.length; i++) {
        if (events[i].type !== calculationEvents[calculationEvents.length -1].type || events[i].time.getTime() !== calculationEvents[calculationEvents.length -1].time.getTime() ) {
             calculationEvents.push(events[i]);
        }
     }
  }


  // 5. Calculate total active time
  let totalActiveMs = 0;
  for (let i = 0; i < calculationEvents.length - 1; i++) {
    const currentEvent = calculationEvents[i];
    const nextEvent = calculationEvents[i + 1];
    if (currentEvent.type === 'active') {
      totalActiveMs += nextEvent.time.getTime() - currentEvent.time.getTime();
    }
  }
  
  // Handle case where user is active from start of day and no other events
  if (calculationEvents.length === 1 && calculationEvents[0].type === 'active' && calculationEvents[0].time.getTime() <= startOfDay.getTime()) {
      // This condition means they were active at start of day, and the 'now' event (same type) was the next
      // This is covered by the loop if 'now' event is added correctly and is different.
      // If calculationEvents is [{time: startOfDay, type:'active'}, {time: now, type:'active'}]
      // Then the loop calculates (now - startOfDay) if the first type is 'active'.
      // Let's ensure the 'now' event is correctly handled if it's the *only* other event.
      // If uniqueStateEvents = [{time:startOfDay, type:'active'}, {time:now, type:'active'}], loop works.
  }


  if (totalActiveMs <= 0) return "0m";

  const totalSeconds = Math.floor(totalActiveMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
}

export default function HomePage() {
  const [originalUserStatuses, setOriginalUserStatuses] = useState<UserStatus[]>([]);
  const [allPresenceLogs, setAllPresenceLogs] = useState<PresenceLog[]>([]);
  const [mappedDataForTable, setMappedDataForTable] = useState<MappedUserStatusWithActiveTime[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const statusesCollectionRef = collection(db, 'user_statuses');
        const logsCollectionRef = collection(db, 'presence_logs'); //TODO: Add query for date range if needed for performance

        const [statusesSnapshot, logsSnapshot] = await Promise.all([
          getDocs(statusesCollectionRef),
          getDocs(logsCollectionRef)
        ]);

        const statuses: UserStatus[] = [];
        statusesSnapshot.forEach((doc) => {
          statuses.push({ id: doc.id, ...doc.data() } as UserStatus);
        });
        setOriginalUserStatuses(statuses);
        
        const logs: PresenceLog[] = [];
        logsSnapshot.forEach((doc) => {
          logs.push({ id: doc.id, ...doc.data() } as PresenceLog);
        });
        setAllPresenceLogs(logs);

        // Transform data after both fetches are complete
        const transformedData = statuses.map(userStatus => {
          const userLogs = logs.filter(log => log.userId === userStatus.userId);
          const activeToday = calculateDailyActiveTime(userStatus.userId, userLogs, userStatus);
          
          // Assuming userStatusToDataTableSchema returns an object compatible with MappedUserStatusWithActiveTime's base
          const baseMappedData = userStatusToDataTableSchema(userStatus);
          return { 
            ...baseMappedData, 
            totalActiveToday: activeToday 
          };
        });
        setMappedDataForTable(transformedData);

      } catch (err) {
        console.error("Error fetching data:", err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
        setError(errorMessage);
        setOriginalUserStatuses([]); // Clear data on error
        setAllPresenceLogs([]);
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
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div>
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
