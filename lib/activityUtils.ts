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

export interface PresenceLog {
  id: string;
  presence: 'active' | 'away' | string; // string, beklenmedik durumlar için
  timestamp: Timestamp;
  userId: string; // userId'yi de ekleyelim, loglarda genellikle olur
  userName?: string;
  previousPresence?: string | null;
}

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
  presenceLogsForDay: PresenceLog[];
  source?: 'cache' | 'firestore'; // Verinin kaynağını belirtmek için opsiyonel alan
}

const CACHE_PREFIX = "activityCache_";
const CACHE_EXPIRY_MINUTES_FOR_TODAY = 10;

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
const parseTimeStrToDate = (timeStr: string, targetDateString: string): Date | null => {
  if (!timeStr || timeStr === 'N/A') return null;

  const datePart = new Date(targetDateString + "T00:00:00"); // Saat dilimi sorunları için UTC gibi davran

  const timeParts = timeStr.match(/(\d+):(\d+):(\d+)\s*(AM|PM)?/i);
  if (!timeParts) return null;

  let hours = parseInt(timeParts[1], 10);
  const minutes = parseInt(timeParts[2], 10);
  const seconds = parseInt(timeParts[3], 10);
  const period = timeParts[4] ? timeParts[4].toUpperCase() : null;

  if (period === "PM" && hours !== 12) {
    hours += 12;
  }
  if (period === "AM" && hours === 12) { // 12 AM (gece yarısı) 0 olarak kabul edilir
    hours = 0;
  }
  
  // Eğer saat dilimi bilgisi yoksa, datePart'ın yerel saat dilimine göre ayarlar.
  // Firestore Timestamp'leri UTC olduğu için, formatTime yerel saat diliminde string verir.
  // Bu string'i tekrar Date objesine çevirirken aynı yerel saat dilimini kullanmak tutarlı olur.
  datePart.setHours(hours, minutes, seconds, 0);
  return datePart;
};

export const calculateActivityForDate = async (
  db: Firestore, 
  userId: string, 
  targetDateString: string
): Promise<ActivityData> => {
  const todayFormatted = formatDateToYYYYMMDD(new Date());
  const isToday = targetDateString === todayFormatted;
  const cacheKey = `${CACHE_PREFIX}${userId}_${targetDateString}`;

  let cachedActivityData: ActivityData | null = null;
  let cacheWriteTimestamp: number | null = null;

  if (typeof window !== 'undefined') {
    try {
      const cachedItemString = localStorage.getItem(cacheKey);
      if (cachedItemString) {
        const parsedCache = JSON.parse(cachedItemString);
        cachedActivityData = parsedCache.data as ActivityData;
        cacheWriteTimestamp = parsedCache.timestamp as number;
      }
    } catch (e) {
      console.warn("[Cache] Error reading from localStorage:", e);
      // Hata olursa cache yokmuş gibi devam et
    }
  }

  // Durum: Geçmiş gün ve cache var -> Direkt dön (canlı güncelleme gerekmez)
  if (!isToday && cachedActivityData) {
    // console.log(`[Cache HIT Past Day] User: ${userId}, Date: ${targetDateString}`);
    return { ...cachedActivityData, source: 'cache' };
  }

  let logsForCalculation: PresenceLog[];
  let sourceToReport: ActivityData['source'];

  // Durum: Bugün ve cache taze (10dk'dan yeni)
  if (isToday && cachedActivityData && cacheWriteTimestamp && (new Date().getTime() - cacheWriteTimestamp) < CACHE_EXPIRY_MINUTES_FOR_TODAY * 60 * 1000) {
    // console.log(`[Cache USING Today Fresh Logs for RECALC] User: ${userId}, Date: ${targetDateString}`);
    logsForCalculation = cachedActivityData.presenceLogsForDay; 
    sourceToReport = 'cache'; // Veya 'cache_recalculated'
  }
  // Durum: Bugün, cache bayat veya ilk kez değil ama incremental için base var
  else if (isToday && cachedActivityData && cachedActivityData.presenceLogsForDay) { 
    // console.log(`[Cache Today Stale - INCREMENTAL] User: ${userId}, Date: ${targetDateString}`);
    const lastKnownLogTimestamp = cachedActivityData.presenceLogsForDay.length > 0 
      ? cachedActivityData.presenceLogsForDay[cachedActivityData.presenceLogsForDay.length - 1].timestamp
      : Timestamp.fromDate(new Date(targetDateString + "T00:00:00")); 

    const newLogsQuery = query(
      collection(db, 'presence_logs'),
      where("userId", "==", userId),
      where("timestamp", ">", lastKnownLogTimestamp),
      where("timestamp", "<=", Timestamp.fromDate(new Date(targetDateString + "T23:59:59.999"))),
      orderBy("timestamp", "asc")
    );
    const newLogsSnapshot = await getDocs(newLogsQuery);
    const newLogs: PresenceLog[] = newLogsSnapshot.docs.map(doc => ({ id: doc.id, userId, ...doc.data() } as PresenceLog));

    if (newLogs.length > 0) {
      logsForCalculation = [...cachedActivityData.presenceLogsForDay, ...newLogs];
      sourceToReport = 'firestore_incremental';
    } else {
      // console.log(`[Cache USING Stale Logs (No New) for RECALC] User: ${userId}, Date: ${targetDateString}`);
      logsForCalculation = cachedActivityData.presenceLogsForDay;
      sourceToReport = 'cache_refreshed_no_new_logs';
    }
  }
  // Durum: Cache yok (ya da bugün değil ve cache yoktu) veya sunucu -> Tam çekim
  else {
    // console.log(`[Cache FULL FETCH] User: ${userId}, Date: ${targetDateString}`);
    const date = new Date(targetDateString + "T00:00:00");
    const startOfDayForQuery = new Date(date); startOfDayForQuery.setHours(0, 0, 0, 0);
    const endOfDayForQuery = new Date(date); endOfDayForQuery.setHours(23, 59, 59, 999);

    const fullLogsQuery = query(
      collection(db, 'presence_logs'),
      where("userId", "==", userId),
      where("timestamp", ">=", Timestamp.fromDate(startOfDayForQuery)),
      where("timestamp", "<=", Timestamp.fromDate(endOfDayForQuery)),
      orderBy("timestamp", "asc")
    );
    const fullLogsSnapshot = await getDocs(fullLogsQuery);
    logsForCalculation = fullLogsSnapshot.docs.map(doc => ({ id: doc.id, userId, ...doc.data() } as PresenceLog));
    sourceToReport = 'firestore_full';
  }

  // --- Ana Hesaplama Mantığı (HER ZAMAN logsForCalculation kullanılır) ---
  // Bu blok `isToday` ise sonucu canlı hale getirecektir.
  
  const calculationDate = new Date(targetDateString + "T00:00:00");
  const startOfDay = new Date(calculationDate); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(calculationDate); endOfDay.setHours(23, 59, 59, 999);

  let totalActiveMs = 0;
  let activityChanges = 0;
  const sessions: WorkSession[] = [];
  let currentSessionStart: Timestamp | null = null;

  const previousDayDate = new Date(calculationDate);
  previousDayDate.setDate(calculationDate.getDate() - 1);
  const startOfPreviousDay = new Date(previousDayDate); startOfPreviousDay.setHours(0, 0, 0, 0);
  const endOfPreviousDay = new Date(previousDayDate); endOfPreviousDay.setHours(23, 59, 59, 999);

  const prevDayQuery = query(
    collection(db, 'presence_logs'),
    where("userId", "==", userId),
    where("timestamp", ">=", Timestamp.fromDate(startOfPreviousDay)),
    where("timestamp", "<=", Timestamp.fromDate(endOfPreviousDay)),
    orderBy("timestamp", "desc"),
    limit(1)
  );
  const prevDaySnapshot = await getDocs(prevDayQuery);
  let initialLogIndexToProcess = 0;

  if (!prevDaySnapshot.empty) {
    const lastLogPrevDay = prevDaySnapshot.docs[0].data() as PresenceLog;
    if (lastLogPrevDay.presence === 'active') {
      currentSessionStart = Timestamp.fromDate(startOfDay);
      if (logsForCalculation.length > 0 && logsForCalculation[0].presence === 'away' && logsForCalculation[0].timestamp.toMillis() > currentSessionStart.toMillis()) {
        const sessionEnd = logsForCalculation[0].timestamp;
        const durationMs = (sessionEnd.seconds - currentSessionStart.seconds) * 1000 + (sessionEnd.nanoseconds - currentSessionStart.nanoseconds) / 1000000;
        if (durationMs > 0) {
          totalActiveMs += durationMs;
          sessions.push({
            startTime: formatTime(currentSessionStart),
            endTime: formatTime(sessionEnd),
            duration: formatDuration(durationMs),
            durationMs: durationMs,
          });
        }
        currentSessionStart = null;
        initialLogIndexToProcess = 1;
      }
    }
  }

  for (let i = initialLogIndexToProcess; i < logsForCalculation.length; i++) {
    const currentLog = logsForCalculation[i];
    if (currentLog.presence === 'active') {
      if (!currentSessionStart) {
        currentSessionStart = currentLog.timestamp;
      }
    } else if (currentLog.presence === 'away' && currentSessionStart) {
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

    if (i > 0 && logsForCalculation[i-1].presence !== currentLog.presence) {
      const prevLogForChange = logsForCalculation[i-1];
      if((prevLogForChange.presence === 'active' && currentLog.presence === 'away') || 
         (prevLogForChange.presence === 'away' && currentLog.presence === 'active')){
           activityChanges++;
      }
    }
  }

  if (initialLogIndexToProcess === 1 && logsForCalculation.length > 0) {
    if (!prevDaySnapshot.empty && prevDaySnapshot.docs[0].data().presence === 'active' && logsForCalculation[0].presence === 'away') {
      activityChanges++;
    }
  }

  if (currentSessionStart) {
    let sessionFinalEnd: Timestamp;
    if (isToday) { // Bu, sonucu canlı yapar
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

  const result: ActivityData = {
    workSessions: sessions,
    totalActiveMs: totalActiveMs,
    activityChanges: activityChanges,
    presenceLogsForDay: logsForCalculation, 
    source: sourceToReport 
  };

  // Sonucu cache'e yaz (eğer geçmiş gün değilse, geçmiş gün zaten başta dönüldü)
  if (typeof window !== 'undefined' && (isToday || !cachedActivityData)) { // Bugünse her zaman cache'i güncelle, geçmiş günse ve cache yoktuysa yaz
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: result, timestamp: new Date().getTime() }));
      // console.log(`[Cache SET After CALCULATION for ${sourceToReport}] User: ${userId}, Date: ${targetDateString}`);
    } catch (e) {
      console.warn("[Cache] Error writing to localStorage:", e);
    }
  }
  return result;
}; 