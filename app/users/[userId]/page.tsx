"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, Zap, Hourglass, Repeat, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import ActivityHeatmap, { type HeatmapData } from "@/components/ui/ActivityHeatmap";

// lib/activityUtils.ts'den import edilecekler
import {
  formatDuration, 
  formatDateToYYYYMMDD, 
  calculateActivityForDate, 
  type WorkSession, 
  type ActivityData 
} from '@/lib/activityUtils';

// Zustand store importu
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface UserDetails {
  user_id: string;
  workspace_id: string;
  name: string;
  presence?: string;
  status_text: string;
  status_emoji: string;
  status_expiration: number;
  real_name: string;
  display_name: string;
  image_original: string;
  updated_at: Timestamp;
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  
  const slackUserIdFromParams = params.userId as string;

  // Zustand store'dan seçili workspace ID'sini al
  const selectedWorkspaceIdFromStore = useWorkspaceStore((state) => state.selectedWorkspaceId);
  const workspacesLoading = useWorkspaceStore((state) => state.isLoadingWorkspaces);

  const [selectedDate, setSelectedDate] = useState<string>(formatDateToYYYYMMDD(new Date()));
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [totalActiveTime, setTotalActiveTime] = useState<string>("0s");
  const [activityChanges, setActivityChanges] = useState<number>(0);
  const [workSessions, setWorkSessions] = useState<WorkSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [isHeatmapLoading, setIsHeatmapLoading] = useState<boolean>(true);

  const HEATMAP_TARGET_YEAR = 2025; 

  useEffect(() => {
    if (workspacesLoading) {
      setIsLoading(true);
      return;
    }
    if (!slackUserIdFromParams || !selectedWorkspaceIdFromStore) {
      setIsLoading(false);
      if(!selectedWorkspaceIdFromStore && !workspacesLoading){
        console.warn("UserDetailPage: Workspace not selected or still loading.");
      }
      if(!slackUserIdFromParams){
        console.error("UserDetailPage: slackUserIdFromParams is missing from URL.");
        setError("User ID not found in URL.");
      }
      return;
    }

    const fetchUserData = async () => {
      setIsLoading(true);
      setError(null);
      console.log(`UserDetailPage: Fetching user data for slackUserId: ${slackUserIdFromParams} in workspace: ${selectedWorkspaceIdFromStore}`);
      try {
        const userDocRef = doc(db, 'user_statuses', slackUserIdFromParams);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as UserDetails;
          if (userData.workspace_id && userData.workspace_id !== selectedWorkspaceIdFromStore) {
            console.warn(`UserDetailPage: Fetched user ${slackUserIdFromParams} belongs to workspace ${userData.workspace_id}, but current selected workspace is ${selectedWorkspaceIdFromStore}.`);
          }
          setUserDetails(userData);
          console.log("UserDetailPage: User details fetched:", userData);
        } else {
          setError("User not found in the selected workspace or an issue with user_statuses collection.");
          setUserDetails(null);
          console.log(`UserDetailPage: User document not found for ID: ${slackUserIdFromParams}`);
        }
      } catch (err) {
        console.error("Error fetching user details:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch user details");
        setUserDetails(null);
      }
    };

    fetchUserData();
  }, [slackUserIdFromParams, selectedWorkspaceIdFromStore, workspacesLoading]);

  useEffect(() => {
    if (workspacesLoading || !selectedWorkspaceIdFromStore || !slackUserIdFromParams || !selectedDate) {
      setTotalActiveTime("0s");
      setActivityChanges(0);
      setWorkSessions([]);
      if (!workspacesLoading) setIsLoading(false);
      return;
    }

    console.log(`UserDetailPage: Fetching activity for date: ${selectedDate}, user: ${slackUserIdFromParams}, workspace: ${selectedWorkspaceIdFromStore}`);
    const fetchActivity = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const activityData: ActivityData = await calculateActivityForDate(db, slackUserIdFromParams, selectedDate, selectedWorkspaceIdFromStore);
        console.log("UserDetailPage: Activity data fetched:", activityData);
        setWorkSessions(activityData.workSessions);
        setTotalActiveTime(formatDuration(activityData.totalActiveMs));
        setActivityChanges(activityData.activityChanges);
      } catch (err) {
        console.error("Error fetching activity data:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch activity data");
        setTotalActiveTime("0s");
        setActivityChanges(0);
        setWorkSessions([]);
      }
      setIsLoading(false);
    };

    fetchActivity();
  }, [slackUserIdFromParams, selectedWorkspaceIdFromStore, selectedDate, workspacesLoading]);

  useEffect(() => {
    if (workspacesLoading || !selectedWorkspaceIdFromStore || !slackUserIdFromParams) {
      if(!workspacesLoading) setIsHeatmapLoading(false);
      return;
    }

    console.log(`UserDetailPage: Fetching heatmap data for user: ${slackUserIdFromParams}, workspace: ${selectedWorkspaceIdFromStore}, year: ${HEATMAP_TARGET_YEAR}`);
    const fetchHeatmapData = async () => {
      setIsHeatmapLoading(true);
      const yearStartDate = new Date(HEATMAP_TARGET_YEAR, 0, 1);
      const yearEndDate = new Date(HEATMAP_TARGET_YEAR, 11, 31);
      const promises: Promise<HeatmapData | null>[] = [];
      let currentDateLoop = new Date(yearStartDate);

      while (currentDateLoop <= yearEndDate) {
        const dateString = formatDateToYYYYMMDD(currentDateLoop);
        promises.push(
          calculateActivityForDate(db, slackUserIdFromParams, dateString, selectedWorkspaceIdFromStore)
            .then(activity => ({
              date: dateString,
              totalActiveMs: activity.totalActiveMs,
              count: activity.totalActiveMs > 0 ? (activity.totalActiveMs / (1000 * 60)) : 0
            }))
            .catch(err => {
              console.error(`Error fetching heatmap data for ${dateString}:`, err);
              return null;
            })
        );
        const nextDate = new Date(currentDateLoop);
        nextDate.setDate(currentDateLoop.getDate() + 1);
        currentDateLoop = nextDate;
      }

      try {
        const results = await Promise.all(promises);
        const validResults = results.filter(Boolean) as HeatmapData[];
        setHeatmapData(validResults);
      } catch (err) {
        console.error("Error fetching all heatmap data entries:", err);
        setHeatmapData([]);
      }
      setIsHeatmapLoading(false);
    };

    fetchHeatmapData();
  }, [slackUserIdFromParams, selectedWorkspaceIdFromStore, HEATMAP_TARGET_YEAR, workspacesLoading]);

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(event.target.value);
  };

  const handlePreviousDay = () => {
    const currentDateHandler = new Date(selectedDate + "T00:00:00"); 
    currentDateHandler.setDate(currentDateHandler.getDate() - 1);
    setSelectedDate(formatDateToYYYYMMDD(currentDateHandler));
  };

  const handleNextDay = () => {
    const currentDateHandler = new Date(selectedDate + "T00:00:00");
    currentDateHandler.setDate(currentDateHandler.getDate() + 1);
    const today = new Date();
    today.setHours(0,0,0,0);

    if (currentDateHandler.getTime() <= today.getTime()) {
      setSelectedDate(formatDateToYYYYMMDD(currentDateHandler));
    }
  };
  
  const displayName = userDetails?.real_name || userDetails?.name || slackUserIdFromParams || "User";

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
          {`${displayName}'s Activity`}
        </h1>
      </header>
      {error && <p className="text-destructive mt-2 text-center bg-destructive/10 p-3 rounded-md">Error: {error}</p>}

      {workspacesLoading && <p className="text-center">Loading workspace data...</p>}
      {!workspacesLoading && !selectedWorkspaceIdFromStore && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Workspace Not Selected</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please select a workspace from the sidebar to view user details.</p>
          </CardContent>
        </Card>
      )}

      {!workspacesLoading && selectedWorkspaceIdFromStore && slackUserIdFromParams && (
        <>
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

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Activity Overview ({HEATMAP_TARGET_YEAR})</CardTitle>
              <CardDescription>Daily activity intensity for {HEATMAP_TARGET_YEAR}.</CardDescription>
            </CardHeader>
            <CardContent>
              {isHeatmapLoading ? (
                <p>Loading activity heatmap for {HEATMAP_TARGET_YEAR}...</p>
              ) : heatmapData.length > 0 ? (
                <ActivityHeatmap 
                  data={heatmapData} 
                />
              ) : (
                <p>No activity data available for the heatmap for {HEATMAP_TARGET_YEAR}.</p>
              )}
            </CardContent>
          </Card>

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
       {!isLoading && !error && workSessions.length === 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>No Activity Data</CardTitle>
          </CardHeader>
          <CardContent>
                <p>No work sessions recorded for {userDetails?.real_name || userDetails?.name || slackUserIdFromParams} on {selectedDate}.</p>
          </CardContent>
        </Card>
          )}
        </>
      )}
    </div>
  );
} 

interface ActivityTimelineProps {
  workSessions: WorkSession[];
  selectedDate: string; 
}

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ workSessions, selectedDate }) => {
  const timelineHeight = 50;
  const containerWidth = "100%";

  const getDayBoundaries = () => {
    const date = new Date(selectedDate + "T00:00:00");
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
    const [hoursStr, minutesStr, secondsStr] = time.split(':');
    
    let hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);
    const seconds = secondsStr ? parseInt(secondsStr, 10) : 0;

    if (period && period.toLowerCase() === 'pm' && hours !== 12) {
      hours += 12;
    }
    if (period && period.toLowerCase() === 'am' && hours === 12) {
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
              backgroundColor: '#e2e8f0',
              position: 'relative', 
              borderRadius: '4px' 
            }}
          >
            {[...Array(25)].map((_, hour) => {
              const leftPercentage = (hour / 24) * 100;
              if (hour === 24 && leftPercentage > 99.9) return null;
              return (
                <div
                  key={`hour-line-${hour}`}
                  style={{
                    position: 'absolute',
                    left: `${leftPercentage}%`,
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    backgroundColor: '#cbd5e1',
                    zIndex: 1,
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
                    zIndex: 2,
                  }}
                />
              );
            })}
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