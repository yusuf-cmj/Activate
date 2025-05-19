import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase'; // Firebase db importu
import { collection, doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const PRESENCE_LOG_COLLECTION = 'presence_logs';
const USER_STATUS_COLLECTION = 'user_statuses'; // Kullanıcıların son durumlarını saklamak için

interface SlackUser {
  id: string;
  name: string;
  is_bot: boolean;
  deleted: boolean;
  // İhtiyaç duyulabilecek diğer alanlar eklenebilir
}

interface UserStatus {
  userId: string;
  presence: string; // 'active' or 'away'
  last_checked: Timestamp;
  last_changed?: Timestamp;
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
      if (!data.ok) throw new Error(`Slack API Error (users.list): ${data.error}`);
      
      const activeUsers = data.members.filter((user: SlackUser) => !user.is_bot && !user.deleted);
      users = users.concat(activeUsers);
      cursor = data.response_metadata?.next_cursor;
    } while (cursor);
    return users;
  } catch (error) {
    console.error('Error fetching users from Slack:', error);
    return []; // Hata durumunda boş liste dön
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
      // Belirli kullanıcı için hata olursa logla ama diğerlerini etkileme
      console.error(`Slack API Error (users.getPresence for ${userId}): ${data.error}`);
      return null;
    }
    return data.presence; // 'active' or 'away'
  } catch (error) {
    console.error(`Error fetching presence for user ${userId}:`, error);
    return null; // Hata durumunda null dön
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    // Vercel cron job'ları POST isteği gönderir, güvenlik için kontrol edelim
    // Ancak bazen GET ile de tetiklenebilir, header kontrolü daha güvenli olabilir
    // Örneğin: if (req.headers['x-vercel-cron'] !== process.env.CRON_SECRET)
    console.log('Received non-POST request to cron handler', req.method);
    // return res.status(405).end('Method Not Allowed');
  }

  console.log('Cron job started: Checking user presences...');

  try {
    const users = await getAllUsers();
    if (!users.length) {
      console.log('No users found or error fetching users. Cron job ending.');
      return res.status(200).json({ message: 'No users found or error fetching users.' });
    }

    console.log(`Found ${users.length} active users to check.`);

    for (const user of users) {
      const currentPresence = await getUserPresence(user.id);
      if (currentPresence === null) continue; // Kullanıcı için presence alınamadıysa atla

      const userStatusRef = doc(db, USER_STATUS_COLLECTION, user.id);
      const userStatusSnap = await getDoc(userStatusRef);
      const now = serverTimestamp() as Timestamp; // serverTimestamp Firestore için özel bir değerdir

      let previousPresence: string | undefined = undefined;
      if (userStatusSnap.exists()) {
        previousPresence = userStatusSnap.data()?.presence;
      }

      // Durum değiştiyse veya ilk kez loglanıyorsa
      if (previousPresence !== currentPresence) {
        console.log(`User ${user.name} (${user.id}) presence changed from ${previousPresence || 'N/A'} to ${currentPresence}`);
        // Değişikliği ana log koleksiyonuna yaz
        await setDoc(doc(collection(db, PRESENCE_LOG_COLLECTION)), {
          userId: user.id,
          userName: user.name, // Kullanıcı adını da loglayalım
          presence: currentPresence,
          timestamp: now,
          previousPresence: previousPresence || null,
        });
        // Kullanıcının son durumunu güncelle
        await setDoc(userStatusRef, {
          userId: user.id,
          userName: user.name,
          presence: currentPresence,
          last_changed: now,
          last_checked: now,
        }, { merge: true });
      } else {
        // Durum değişmediyse bile son kontrol zamanını güncelle
        if (userStatusSnap.exists()) {
            await setDoc(userStatusRef, { last_checked: now }, { merge: true });
        }
         else { // İlk defa bu kullanıcı için kayıt atılıyorsa
            await setDoc(userStatusRef, {
                userId: user.id,
                userName: user.name,
                presence: currentPresence,
                last_checked: now,
                last_changed: now, // İlk kayıt olduğu için last_changed de now olsun
            }, { merge: true });
        }
      }
      
      // Rate limit için küçük bir bekleme (isteğe bağlı, kullanıcı sayısına göre ayarlanabilir)
      // await new Promise(resolve => setTimeout(resolve, 200)); // 200ms bekle
    }

    console.log('Cron job finished successfully.');
    return res.status(200).json({ message: 'Presence check completed.' });
  } catch (error) {
    console.error('Error in cron job:', error);
    return res.status(500).json({ error: 'Cron job failed', details: (error as Error).message });
  }
} 