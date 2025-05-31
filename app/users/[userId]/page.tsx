"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, TrendingUp, Zap, Hourglass, Repeat, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';

// lib/activityUtils.ts'den import edilecekler
import {
  formatTime, 
  formatDuration, 
  formatDateToYYYYMMDD, 
  calculateActivityForDate, 
  type PresenceLog, // type importu
  type WorkSession, // type importu
  type ActivityData // type importu
} from '@/lib/activityUtils';

interface UserDetails {
  userName?: string;
  // Add other relevant user fields if needed
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [selectedDate, setSelectedDate] = useState<string>(formatDateToYYYYMMDD(new Date()));
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
      setIsLoading(false);
      return;
    }

    const fetchActivity = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const activityData: ActivityData = await calculateActivityForDate(db, userId, selectedDate);
        
        setPresenceLogs(activityData.presenceLogsForDay);
        setWorkSessions(activityData.workSessions);
        setTotalActiveTime(formatDuration(activityData.totalActiveMs));
        setActivityChanges(activityData.activityChanges);

      } catch (err) {
        console.error("Error fetching activity data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch activity data");
        setPresenceLogs([]);
        setTotalActiveTime("0s");
        setActivityChanges(0);
        setWorkSessions([]);
      }
      setIsLoading(false);
    };

    fetchActivity();
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
    today.setHours(0,0,0,0);

    if (currentDate.getTime() <= today.getTime()) {
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