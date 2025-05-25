"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UserDetails {
  userName?: string;
  // Add other relevant user fields if needed
}

interface PresenceLog {
  id: string;
  presence: 'active' | 'away' | string;
  timestamp: Timestamp;
  userName?: string; // userName might be denormalized here too
  previousPresence?: string | null;
}

interface WorkSession {
  startTime: string;
  endTime: string;
  duration: string;
}

// Helper to format Firestore Timestamp to readable time
const formatTime = (timestamp: Timestamp | undefined): string => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp.seconds * 1000).toLocaleTimeString();
};

// Helper to format duration from milliseconds to Hh Mm Ss format
const formatDuration = (ms: number): string => {
  if (ms < 0) ms = 0;
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

  const C: string[] = [];
  if (hours > 0) C.push(hours + "h");
  if (minutes > 0) C.push(minutes + "m");
  if (seconds > 0 || C.length === 0) C.push(seconds + "s"); // show seconds if duration is less than 1 min or 0s
  return C.join(' ');
};

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.userId as string;

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [presenceLogs, setPresenceLogs] = useState<PresenceLog[]>([]);
  const [totalActiveTime, setTotalActiveTime] = useState<string>("0s");
  const [activityChanges, setActivityChanges] = useState<number>(0);
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const fetchUserData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const userDocRef = doc(db, 'user_statuses', userId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUserDetails(userDocSnap.data() as UserDetails);
        } else {
          setError("User not found.");
          setUserDetails(null);
        }
      } catch (err) {
        console.error("Error fetching user details:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch user details");
        setUserDetails(null);
      }
    };

    fetchUserData();
  }, [userId]);

  useEffect(() => {
    if (!userId || !selectedDate) {
      setPresenceLogs([]);
      setTotalActiveTime("0s");
      setActivityChanges(0);
      setWorkSessions([]);
      return;
    }

    const fetchPresenceData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const date = new Date(selectedDate);
        const startOfDay = new Date(date.setHours(0, 0, 0, 0));
        const endOfDay = new Date(date.setHours(23, 59, 59, 999));

        const logsQuery = query(
          collection(db, 'presence_logs'),
          where("userId", "==", userId),
          where("timestamp", ">=", Timestamp.fromDate(startOfDay)),
          where("timestamp", "<=", Timestamp.fromDate(endOfDay)),
          orderBy("timestamp", "asc")
        );

        const logsSnapshot = await getDocs(logsQuery);
        const logs: PresenceLog[] = [];
        logsSnapshot.forEach(doc => {
          logs.push({ id: doc.id, ...doc.data() } as PresenceLog);
        });
        setPresenceLogs(logs);

        // Calculate metrics
        let totalActiveMs = 0;
        let changes = 0;
        const sessions: WorkSession[] = [];
        let currentSessionStart: Timestamp | null = null;

        if (logs.length > 0) {
          // Consider the state at the very start of the day based on the first log
          // This is a simplification; a more accurate approach might need a log from the previous day
          if (logs[0].presence === 'active') {
            currentSessionStart = Timestamp.fromDate(startOfDay); // Assume active from start of day if first log is active
          }
        }

        for (let i = 0; i < logs.length; i++) {
          const currentLog = logs[i];

          if (currentLog.presence === 'active') {
            if (!currentSessionStart) {
              currentSessionStart = currentLog.timestamp;
            }
          }

          if (currentLog.presence === 'away' && currentSessionStart) {
            const sessionEnd = currentLog.timestamp;
            const durationMs = (sessionEnd.seconds - currentSessionStart.seconds) * 1000 + (sessionEnd.nanoseconds - currentSessionStart.nanoseconds) / 1000000;
            totalActiveMs += durationMs;
            sessions.push({
              startTime: formatTime(currentSessionStart),
              endTime: formatTime(sessionEnd),
              duration: formatDuration(durationMs),
            });
            currentSessionStart = null;
          }
          
          // Count transitions from active to away or away to active
          if (i > 0 && logs[i-1].presence !== currentLog.presence) {
            if((logs[i-1].presence === 'active' && currentLog.presence === 'away') || 
               (logs[i-1].presence === 'away' && currentLog.presence === 'active')){
                 changes++;
            }
          }
        }

        // If still in an active session at the end of the logs (or end of day)
        if (currentSessionStart) {
          // If the last log was active, session goes until end of day or current time if it's today
          const todayDate = new Date().toISOString().split('T')[0];
          let sessionFinalEnd: Timestamp;
          if (selectedDate === todayDate) {
            // If selected date is today, cap at current time
             sessionFinalEnd = Timestamp.now(); 
          } else {
            // If selected date is in the past, cap at end of day
             sessionFinalEnd = Timestamp.fromDate(endOfDay);
          }

          const durationMs = (sessionFinalEnd.seconds - currentSessionStart.seconds) * 1000 + (sessionFinalEnd.nanoseconds - currentSessionStart.nanoseconds) / 1000000;
          totalActiveMs += durationMs;
          sessions.push({
            startTime: formatTime(currentSessionStart),
            endTime: formatTime(sessionFinalEnd),
            duration: formatDuration(durationMs),
          });
        }
        
        setTotalActiveTime(formatDuration(totalActiveMs));
        setActivityChanges(changes);
        setWorkSessions(sessions);

      } catch (err) {
        console.error("Error fetching presence logs:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch presence logs");
        setPresenceLogs([]);
        setTotalActiveTime("0s");
        setActivityChanges(0);
        setWorkSessions([]);
      }
      setIsLoading(false);
    };

    fetchPresenceData();
  }, [userId, selectedDate]);

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(event.target.value);
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {userDetails?.userName ? `${userDetails.userName}'s Activity` : (userId ? `User ${userId} Activity` : 'User Activity')}
        </h1>
        {error && <p className="text-destructive mt-2">Error: {error}</p>}
      </header>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Date</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label htmlFor="activity-date">Activity Date</Label>
            <Input 
              type="date" 
              id="activity-date"
              value={selectedDate} 
              onChange={handleDateChange} 
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading && !error && <p>Loading activity data...</p>}
      {!isLoading && !error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Total Active Time</CardTitle>
                <CardDescription>Total time spent active on {selectedDate}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totalActiveTime}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Activity Changes</CardTitle>
                <CardDescription>Active/Away transitions on {selectedDate}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{activityChanges}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Work Sessions</CardTitle>
              <CardDescription>Breakdown of work sessions on {selectedDate}</CardDescription>
            </CardHeader>
            <CardContent>
              {workSessions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Start Time</TableHead>
                      <TableHead>End Time</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workSessions.map((session, index) => (
                      <TableRow key={index}>
                        <TableCell>{session.startTime}</TableCell>
                        <TableCell>{session.endTime}</TableCell>
                        <TableCell>{session.duration}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p>No work sessions recorded for this day.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
       {!isLoading && !error && presenceLogs.length === 0 && workSessions.length === 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>No Activity Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p>No presence logs found for {userDetails?.userName || userId} on {selectedDate}.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 