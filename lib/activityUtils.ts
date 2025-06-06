import { Timestamp, collection, query, where, orderBy, getDocs, limit, Firestore } from 'firebase/firestore';

// Helper function to format a Date object to YYYY-MM-DD string
export const formatDateToYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Firestore Timestamp'i okunabilir zamana çeviren yardımcı fonksiyon
export const formatTime = (timestamp: Timestamp | undefined): string => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp.seconds * 1000).toLocaleTimeString();
};

// Milisaniyeden Hh Mm Ss formatına çeviren yardımcı fonksiyon
export const formatDuration = (ms: number): string => {
  if (ms < 0) ms = 0;
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

  const C: string[] = [];
  if (hours > 0) C.push(hours + "h");
  if (minutes > 0) C.push(minutes + "m");
  if (seconds > 0 || C.length === 0) C.push(seconds + "s");
  return C.join(' ');
};

export interface WorkSession {
  startTime: string;
  endTime: string;
  duration: string;
  durationMs: number;
}

export interface ActivityData {
  workSessions: WorkSession[];
  totalActiveMs: number;
  activityChanges: number;
  presenceLogsForDay: [];
  source?: 
    | 'cache'
    | 'firestore_full'
    | 'firestore_incremental'
    | 'cache_revalidated_no_new_logs'
    | 'cache_rehydrated'; // Önbellekten okundu ve Timestamp'ler hydrate edildi gibi bir durum için
}

const CACHE_PREFIX = "activityCache_";
// const CACHE_EXPIRY_MINUTES_FOR_TODAY = 10; // KALDIRILDI - kullanılmıyor

// Helper to parse time string (like "10:30:00 AM/PM") from WorkSession to milliseconds since epoch for a given date
// Bu fonksiyon, UserDetailPage.tsx içindeki ActivityTimeline'dan alınabilir ve genelleştirilebilir.
// Şimdilik basit bir tanım yapalım, eğer gerekirse UserDetailPage'teki daha kapsamlı olanla değiştiririz.
// Ancak ActivityData içindeki session.startTime zaten formatTime ile formatlanmış olacak,
// bu yüzden onu tekrar parse etmek yerine, durationMs ve startTime (Timestamp olarak) üzerinden gitmek daha iyi olabilir.
// YA DA en iyisi, WorkSession'a startTimestamp (Timestamp) ve endTimestamp (Timestamp) eklemek.
// Bu refaktör şimdilik kapsam dışı. Mevcut stringler üzerinden gidelim.

// Bu yardımcı fonksiyon, ActivityTimeline bileşenindeki mantığa benzer şekilde çalışır.
// targetDateString: YYYY-MM-DD formatında seansın ait olduğu gün.
// timeStr: "11:02:51 PM" gibi formatTime'dan gelen string.
/*
const parseTimeStrToDate = (timeStr: string, targetDateString: string): Date | null => {
  if (!timeStr || timeStr === 'N/A') return null;

  const datePart = new Date(targetDateString + "T00:00:00");

  const timeParts = timeStr.match(/(\d+):(\d+):(\d+)\s*(AM|PM)?/i);
  if (!timeParts) return null;

  let hours = parseInt(timeParts[1], 10);
  const minutes = parseInt(timeParts[2], 10);
  const seconds = parseInt(timeParts[3], 10);
  const period = timeParts[4] ? timeParts[4].toUpperCase() : null;

  if (period === "PM" && hours !== 12) {
    hours += 12;
  }
  if (period === "AM" && hours === 12) { 
    hours = 0;
  }
  
  datePart.setHours(hours, minutes, seconds, 0);
  return datePart;
};
*/

export interface ActivitySessionDocument {
  id: string;
  user_id: string;
  workspace_id: string;
  start_time: Timestamp;
  end_time: Timestamp | null;
  last_seen: Timestamp;
}

export const calculateActivityForDate = async (
  db: Firestore,
  userId: string, // Bu Slack user ID (Uxxxx)
  targetDateString: string,
  workspaceId: string // YENİ PARAMETRE
): Promise<ActivityData> => {
  console.log(`[calculateActivityForDate] Start for userId: ${userId}, workspaceId: ${workspaceId}, date: ${targetDateString}`);

  const todayFormatted = formatDateToYYYYMMDD(new Date());
  const isToday = targetDateString === todayFormatted;
  const cacheKey = `${CACHE_PREFIX}${workspaceId}_${userId}_${targetDateString}`;
  console.log(`[calculateActivityForDate] Cache key: ${cacheKey}, isToday: ${isToday}`);

  // Önbellek okuma mantığı (bugün hariç) aynı kalır
  if (!isToday) {
    if (typeof window !== 'undefined') {
      try {
        const cachedItemString = localStorage.getItem(cacheKey);
        if (cachedItemString) {
          const parsedCache = JSON.parse(cachedItemString);
          console.log(`[calculateActivityForDate] Returning cached data for PAST DAY: ${targetDateString}`);
          // Önbellekten dönen verinin formatı yeni ActivityData ile uyumlu olmalı.
          // Eski önbellek verileri uyumsuz olabilir, bu yüzden şimdilik basitçe dönüyoruz.
          // Gerekirse burada bir dönüşüm (migration) yapılabilir.
          return { ...parsedCache.data, source: 'cache' };
        }
      } catch (e) {
        console.warn(`[calculateActivityForDate] Error reading from localStorage for ${cacheKey}:`, e);
      }
    }
  }
  
  // Bugün için veya önbellekte olmayan geçmiş günler için hesaplama
  const targetDateStart = new Date(`${targetDateString}T00:00:00.000Z`);
  const targetDateEnd = new Date(`${targetDateString}T23:59:59.999Z`);
  const targetDateStartTs = Timestamp.fromDate(targetDateStart);
  const targetDateEndTs = Timestamp.fromDate(targetDateEnd);

  console.log(`[calculateActivityForDate] Fetching sessions for date range: ${targetDateStart.toISOString()} - ${targetDateEnd.toISOString()}`);
  
  // İlgili günle kesişen oturumları bulmak için sorgu:
  // 1. Gün bitmeden başlamış olanlar
  const sessionsQuery = query(
    collection(db, 'activity_sessions'),
    where("user_id", "==", userId),
    where("workspace_id", "==", workspaceId),
    where("start_time", "<=", targetDateEndTs),
    orderBy("start_time", "asc")
  );

  const sessionsSnapshot = await getDocs(sessionsQuery);

  // 2. Filtre: Gün başlamadan bitmemiş olanlar
  const allRelevantSessions: ActivitySessionDocument[] = sessionsSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as ActivitySessionDocument))
    .filter(session => {
      // end_time null ise (aktif oturum) veya gün başlangıcından sonra ise tut
      return session.end_time === null || session.end_time >= targetDateStartTs;
    });

  console.log(`[calculateActivityForDate] Found ${allRelevantSessions.length} relevant session documents.`);

  let totalActiveMs = 0;
  const workSessions: WorkSession[] = [];

  for (const session of allRelevantSessions) {
    // Oturumun başlangıç ve bitiş zamanlarını al
    const sessionStart = session.start_time;
    // Bitiş zamanı null ise, bugünün oturumu için şimdiki zamanı, geçmiş günler için gün sonunu kullan
    const sessionEnd = session.end_time ?? (isToday ? Timestamp.now() : targetDateEndTs);

    // Oturumun ilgili gün içindeki kısmını hesapla
    const effectiveStartTime = sessionStart > targetDateStartTs ? sessionStart : targetDateStartTs;
    const effectiveEndTime = sessionEnd < targetDateEndTs ? sessionEnd : targetDateEndTs;

    // Sürenin pozitif olduğundan emin ol
    if (effectiveEndTime.toMillis() > effectiveStartTime.toMillis()) {
      const durationMs = effectiveEndTime.toMillis() - effectiveStartTime.toMillis();
      totalActiveMs += durationMs;

      workSessions.push({
        startTime: formatTime(effectiveStartTime),
        endTime: formatTime(effectiveEndTime),
        duration: formatDuration(durationMs),
        durationMs: durationMs,
      });
    }
  }

  const result: ActivityData = {
    workSessions: workSessions,
    totalActiveMs: totalActiveMs,
    activityChanges: workSessions.length, // Aktivite değişikliği sayısını oturum sayısına eşitle
    presenceLogsForDay: [], // Bu alan artık kullanılmıyor
    source: 'firestore_full' // Şimdilik hep full fetch
  };

  console.log(`[calculateActivityForDate] Finished calculation for userId: ${userId}. Result: `, JSON.parse(JSON.stringify(result)));

  // Sonucu önbelleğe yaz
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: result, timestamp: new Date().getTime() }));
      console.log(`[calculateActivityForDate] Cache SET for ${cacheKey}`);
    } catch (e) {
      console.warn("[Cache] Error writing to localStorage:", e);
    }
  }

  return result;
}; 