"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, TrendingUp, Zap, Hourglass, Repeat, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';

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
  durationMs: number;
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
  const router = useRouter();
  const userId = params.userId as string;

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [presenceLogs, setPresenceLogs] = useState<PresenceLog[]>([]);
  const [totalActiveTime, setTotalActiveTime] = useState<string>("0s");
  const [activityChanges, setActivityChanges] = useState<number>(0);
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to format a Date object to YYYY-MM-DD string
  const formatDateToYYYYMMDD = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Ay 0-indexli olduğu için +1
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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

        for (let i = 0; i < logs.length; i++) {
          const currentLog = logs[i];

          if (currentLog.presence === 'active') {
            if (!currentSessionStart) {
              currentSessionStart = currentLog.timestamp;
            }
          }

          if (currentLog.presence === 'away' && currentSessionStart) {
            const sessionEnd = currentLog.timestamp;
            if (sessionEnd.toMillis() > currentSessionStart.toMillis()) {
              const durationMs = (sessionEnd.seconds - currentSessionStart.seconds) * 1000 + (sessionEnd.nanoseconds - currentSessionStart.nanoseconds) / 1000000;
              totalActiveMs += durationMs;
              sessions.push({
                startTime: formatTime(currentSessionStart),
                endTime: formatTime(sessionEnd),
                duration: formatDuration(durationMs),
                durationMs: durationMs,
              });
            }
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
          const todayDate = new Date().toISOString().split('T')[0];
          let sessionFinalEnd: Timestamp;

          if (selectedDate === todayDate) {
            sessionFinalEnd = Timestamp.now(); 
          } else {
            sessionFinalEnd = Timestamp.fromDate(endOfDay);
          }

          if (sessionFinalEnd.toMillis() > currentSessionStart.toMillis()) {
            const durationMs = (sessionFinalEnd.seconds - currentSessionStart.seconds) * 1000 + (sessionFinalEnd.nanoseconds - currentSessionStart.nanoseconds) / 1000000;
            totalActiveMs += durationMs;
            sessions.push({
              startTime: formatTime(currentSessionStart),
              endTime: formatTime(sessionFinalEnd),
              duration: formatDuration(durationMs),
              durationMs: durationMs,
            });
          }
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

  const handlePreviousDay = () => {
    const currentDate = new Date(selectedDate + "T00:00:00"); 
    currentDate.setDate(currentDate.getDate() - 1);
    setSelectedDate(formatDateToYYYYMMDD(currentDate));
  };

  const handleNextDay = () => {
    const currentDate = new Date(selectedDate + "T00:00:00");
    currentDate.setDate(currentDate.getDate() + 1);
    const today = new Date();
    today.setHours(0,0,0,0); // Karşılaştırma için bugünün başlangıcını al

    // Gelecekteki bir tarihe gitmeyi engelle
    if (currentDate.getTime() <= today.getTime()) { // getTime() ile milisaniye olarak karşılaştır
      setSelectedDate(formatDateToYYYYMMDD(currentDate));
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <header className="mb-6 flex items-center space-x-4">
        <button 
          onClick={() => router.push('/')} 
          className="p-2 rounded-md hover:bg-accent text-foreground"
          aria-label="Go back to homepage"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="text-2xl font-semibold text-foreground">
          {userDetails?.userName ? `${userDetails.userName}'s Activity` : (userId ? `User ${userId} Activity` : 'User Activity')}
        </h1>
      </header>
      {error && <p className="text-destructive mt-2">Error: {error}</p>}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Date</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs flex items-center space-x-2">
            <button onClick={handlePreviousDay} className="p-2 rounded-md hover:bg-accent" aria-label="Previous day">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex-grow">
              <Label htmlFor="activity-date" className="sr-only">Activity Date</Label>
              <Input 
                type="date" 
                id="activity-date"
                value={selectedDate} 
                onChange={handleDateChange} 
                className="w-full"
              />
            </div>
            <button onClick={handleNextDay} className="p-2 rounded-md hover:bg-accent" aria-label="Next day">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </CardContent>
      </Card>

      {isLoading && !error && <p>Loading activity data...</p>}
      {!isLoading && !error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Active Time</CardTitle>
                <Hourglass className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalActiveTime}</p>
                <p className="text-xs text-muted-foreground">Active on {selectedDate}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Work Sessions</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{workSessions.length}</p>
                <p className="text-xs text-muted-foreground">Number of distinct sessions</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Longest Session</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {workSessions.length > 0 
                    ? formatDuration(Math.max(...workSessions.map(s => s.durationMs)))
                    : "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">Longest uninterrupted session</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Activity Changes</CardTitle>
                <Repeat className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{activityChanges}</p>
                <p className="text-xs text-muted-foreground">Active/Away transitions</p>
              </CardContent>
            </Card>
          </div>

          {/* Aktivite Zaman Çizelgesi Buraya Eklenecek */}
          <ActivityTimeline workSessions={workSessions} selectedDate={selectedDate} />

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

// Yeni Aktivite Zaman Çizelgesi Bileşeni
interface ActivityTimelineProps {
  workSessions: WorkSession[];
  selectedDate: string; // startOfDay ve endOfDay'ı hesaplamak için
  timeZone?: string; // İsteğe bağlı, zaman gösterimleri için
}

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ workSessions, selectedDate, timeZone }) => {
  const timelineHeight = 50; // piksel
  const containerWidth = "100%"; // Ya da sabit bir piksel değeri

  // selectedDate'den günün başlangıç ve bitiş timestamp'lerini al
  const getDayBoundaries = () => {
    const date = new Date(selectedDate + "T00:00:00"); // Saat dilimi sorunlarını önlemek için explicit saat
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return { startOfDayMs: startOfDay.getTime(), endOfDayMs: endOfDay.getTime() };
  };

  const { startOfDayMs, endOfDayMs } = getDayBoundaries();
  const totalDayMs = endOfDayMs - startOfDayMs;

  const parseTimeToMilliseconds = (timeStr: string): number | null => {
    const [time, period] = timeStr.split(' ');
    let [hours, minutes, seconds] = time.split(':').map(Number);

    if (period && period.toLowerCase() === 'pm' && hours !== 12) {
      hours += 12;
    }
    if (period && period.toLowerCase() === 'am' && hours === 12) { // Gece yarısı (12 AM)
      hours = 0;
    }
    
    const sessionDate = new Date(selectedDate + "T00:00:00");
    sessionDate.setHours(hours, minutes, seconds || 0, 0);
    return sessionDate.getTime();
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Daily Activity Timeline</CardTitle>
        <CardDescription>Visual representation of active and away periods on {selectedDate}</CardDescription>
      </CardHeader>
      <CardContent style={{ paddingTop: '10px', paddingBottom: '30px' }}>
        {workSessions.length === 0 && <p>No activity to display on timeline.</p>}
        {workSessions.length > 0 && (
          <div 
            style={{
              width: containerWidth, 
              height: timelineHeight, 
              backgroundColor: '#e2e8f0', // Açık gri arka plan
              position: 'relative', 
              borderRadius: '4px' 
            }}
          >
            {/* Saat çizgilerini ekleyelim (arka plana) */}
            {[...Array(25)].map((_, hour) => {
              const leftPercentage = (hour / 24) * 100;
              if (hour === 24 && leftPercentage > 99.9) return null; // Son çizgiyi çok kenarda gösterme
              return (
                <div
                  key={`hour-line-${hour}`}
                  style={{
                    position: 'absolute',
                    left: `${leftPercentage}%`,
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    backgroundColor: '#cbd5e1', // Biraz daha koyu gri çizgi
                    zIndex: 1, // Aktif blokların altında kalsın
                  }}
                />
              );
            })}

            {workSessions.map((session, index) => {
              const sessionStartMs = parseTimeToMilliseconds(session.startTime);
              const sessionEndMs = parseTimeToMilliseconds(session.endTime);

              if (sessionStartMs === null || sessionEndMs === null || sessionEndMs <= sessionStartMs) {
                return null; 
              }

              const normalizedStartMs = Math.max(0, sessionStartMs - startOfDayMs);
              const normalizedEndMs = Math.min(totalDayMs, sessionEndMs - startOfDayMs);

              if (normalizedEndMs <= normalizedStartMs) return null; 

              const leftPercentage = (normalizedStartMs / totalDayMs) * 100;
              const widthPercentage = ((normalizedEndMs - normalizedStartMs) / totalDayMs) * 100;

              return (
                <div
                  key={index}
                  title={`${session.startTime} - ${session.endTime} (Duration: ${session.duration})`}
                  style={{
                    position: 'absolute',
                    left: `${leftPercentage}%`,
                    width: `${widthPercentage}%`,
                    height: '100%',
                    backgroundColor: '#4ade80', 
                    borderRadius: '2px',
                    zIndex: 2, // Saat çizgilerinin üzerinde olsun
                  }}
                />
              );
            })}
            {/* Saat etiketleri */}
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'absolute', bottom: '-25px', width: '100%', fontSize: '10px' }}>
              {[0,3,6,9,12,15,18,21,24].map(h => (
                <span key={h} style={{ transform: h === 24 ? 'translateX(-50%)' : (h === 0 ? 'translateX(0%)': 'translateX(-50%)') }}>{`${String(h).padStart(2,'0')}:00`}</span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 