import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase'; // Firebase db importu
import { collection, doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

// pages/api/cron/check-presence.ts dosyasındaki fonksiyonları ve interfaceleri buraya taşıyacağız
// veya import edeceğiz. Şimdilik direkt buraya kopyalayıp uyarlayalım.

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const PRESENCE_LOG_COLLECTION = 'presence_logs';
const USER_STATUS_COLLECTION = 'user_statuses';

interface SlackUser {
  id: string;
  name: string;
  is_bot: boolean;
  deleted: boolean;
}

interface UserStatus {
  userId: string;
  presence: string; 
  last_checked: Timestamp;
  last_changed?: Timestamp;
  userName?: string; // userName'i UserStatus'a da ekleyelim
}

async function getAllUsers(): Promise<SlackUser[]> {
  if (!SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN is not set');
  let users: SlackUser[] = [];
  let cursor: string | undefined = undefined;
  try {
    do {
      const response = await fetch(
        `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${cursor}` : ''}`,
        {
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        }
      );
      const data = await response.json();
      if (!data.ok) throw new Error(`Slack API Error (users.list): ${data.error} - ${data.needed} - ${data.provided}`);
      const activeUsers = data.members.filter((user: SlackUser) => !user.is_bot && !user.deleted);
      users = users.concat(activeUsers);
      cursor = data.response_metadata?.next_cursor;
    } while (cursor);
    return users;
  } catch (error) {
    console.error('Error fetching users from Slack:', error);
    return [];
  }
}

async function getUserPresence(userId: string): Promise<string | null> {
  if (!SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN is not set');
  try {
    const response = await fetch(
      `https://slack.com/api/users.getPresence?user=${userId}`,
      {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      }
    );
    const data = await response.json();
    if (!data.ok) {
      console.error(`Slack API Error (users.getPresence for ${userId}): ${data.error} - ${data.needed} - ${data.provided}`);
      return null;
    }
    return data.presence;
  } catch (error) {
    console.error(`Error fetching presence for user ${userId}:`, error);
    return null;
  }
}

// App Router için GET veya POST handler
// Vercel Cron GET ile de tetikleyebiliyor, POST daha standart
export async function GET(request: Request) {
  // İsteğe bağlı: Güvenlik için header kontrolü eklenebilir
  // const cronSecret = request.headers.get('x-vercel-cron-secret');
  // if (cronSecret !== process.env.CRON_SECRET) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }
  console.log('Cron job started (GET): Checking user presences...');
  try {
    const users = await getAllUsers();
    if (!users.length) {
      console.log('No users found or error fetching users. Cron job ending.');
      return NextResponse.json({ message: 'No users found or error fetching users.' });
    }
    console.log(`Found ${users.length} active users to check.`);

    for (const user of users) {
      const currentPresence = await getUserPresence(user.id);
      if (currentPresence === null) continue;

      const userStatusRef = doc(db, USER_STATUS_COLLECTION, user.id);
      const userStatusSnap = await getDoc(userStatusRef);
      const now = serverTimestamp() as Timestamp;

      let previousPresence: string | undefined = undefined;
      let previousStatusData: UserStatus | undefined = undefined;

      if (userStatusSnap.exists()) {
        previousStatusData = userStatusSnap.data() as UserStatus;
        previousPresence = previousStatusData?.presence;
      }

      if (previousPresence !== currentPresence) {
        console.log(`User ${user.name} (${user.id}) presence changed from ${previousPresence || 'N/A'} to ${currentPresence}`);
        await setDoc(doc(collection(db, PRESENCE_LOG_COLLECTION)), {
          userId: user.id,
          userName: user.name,
          presence: currentPresence,
          timestamp: now,
          previousPresence: previousPresence || null,
        });
        await setDoc(userStatusRef, {
          userId: user.id,
          userName: user.name,
          presence: currentPresence,
          last_changed: now,
          last_checked: now,
        }, { merge: true });
      } else {
        if (userStatusSnap.exists()) {
          await setDoc(userStatusRef, { last_checked: now }, { merge: true });
        } else {
          await setDoc(userStatusRef, {
            userId: user.id,
            userName: user.name,
            presence: currentPresence,
            last_checked: now,
            last_changed: now,
          }, { merge: true });
        }
      }
      // await new Promise(resolve => setTimeout(resolve, 200)); // Optional delay
    }
    console.log('Cron job finished successfully.');
    return NextResponse.json({ message: 'Presence check completed.' });
  } catch (error) {
    console.error('Error in cron job:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Cron job failed', details: errorMessage }, { status: 500 });
  }
}

// Aynı mantıkla POST handler da eklenebilir, Vercel bazen POST kullanır.
export async function POST(request: Request) {
    console.log('Cron job started (POST): Checking user presences...');
    // GET ile aynı mantığı çağırabiliriz veya direkt buraya kopyalayabiliriz.
    // Şimdilik basitlik adına GET'i çağıralım veya aynı kodu tekrar edelim.
    // En iyisi kodu bir helper fonksiyona alıp ikisinden de çağırmak olurdu ama tek dosya için tekrar edebiliriz.
    try {
        const users = await getAllUsers();
        if (!users.length) {
          console.log('No users found or error fetching users. Cron job ending.');
          return NextResponse.json({ message: 'No users found or error fetching users.' });
        }
        console.log(`Found ${users.length} active users to check.`);
    
        for (const user of users) {
          const currentPresence = await getUserPresence(user.id);
          if (currentPresence === null) continue;
    
          const userStatusRef = doc(db, USER_STATUS_COLLECTION, user.id);
          const userStatusSnap = await getDoc(userStatusRef);
          const now = serverTimestamp() as Timestamp;
    
          let previousPresence: string | undefined = undefined;
          if (userStatusSnap.exists()) {
            previousPresence = (userStatusSnap.data() as UserStatus)?.presence;
          }
    
          if (previousPresence !== currentPresence) {
            console.log(`User ${user.name} (${user.id}) presence changed from ${previousPresence || 'N/A'} to ${currentPresence}`);
            await setDoc(doc(collection(db, PRESENCE_LOG_COLLECTION)), {
              userId: user.id,
              userName: user.name,
              presence: currentPresence,
              timestamp: now,
              previousPresence: previousPresence || null,
            });
            await setDoc(userStatusRef, {
              userId: user.id,
              userName: user.name,
              presence: currentPresence,
              last_changed: now,
              last_checked: now,
            }, { merge: true });
          } else {
            if (userStatusSnap.exists()) {
              await setDoc(userStatusRef, { last_checked: now }, { merge: true });
            } else {
              await setDoc(userStatusRef, {
                userId: user.id,
                userName: user.name,
                presence: currentPresence,
                last_checked: now,
                last_changed: now,
              }, { merge: true });
            }
          }
        }
        console.log('Cron job finished successfully.');
        return NextResponse.json({ message: 'Presence check completed.' });
      } catch (error) {
        console.error('Error in cron job:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: 'Cron job failed', details: errorMessage }, { status: 500 });
      }
  } 