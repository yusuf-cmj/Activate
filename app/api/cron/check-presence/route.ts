import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/firebase'; // Firebase db importu
import { collection, doc, getDoc, getDocs, setDoc, Timestamp, query, where, updateDoc, addDoc } from 'firebase/firestore';

// const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN; // Artık kullanılmayacak, workspace'e özel token kullanılacak
const USER_STATUS_COLLECTION = 'user_statuses';
const SLACK_WORKSPACES_COLLECTION = 'slack_workspaces';
const ACTIVITY_SESSIONS_COLLECTION = 'activity_sessions'; // Yeni koleksiyon

interface SlackUser {
  id: string;
  name: string; 
  is_bot: boolean;
  deleted: boolean;
  team_id?: string; // Kullanıcının hangi workspace'e ait olduğunu belirlemek için
  profile?: {
    real_name?: string;
    display_name?: string;
    status_text?: string;
    status_emoji?: string;
    status_expiration?: number;
    image_original?: string;
    image_512?: string;
  };
}

interface SlackUsersListResponse {
  ok: boolean;
  members: SlackUser[];
  response_metadata?: {
    next_cursor?: string;
  };
  error?: string;
  needed?: string;
  provided?: string;
}

interface UserStatus {
  user_id: string;
  workspace_id: string;
  name: string;
  presence?: string;
  last_presence?: string; // Önceki durumu takip etmek için
  active_session_id?: string | null; // Aktif oturumun ID'si
  status_text: string;
  status_emoji: string;
  status_expiration: number;
  real_name: string;
  display_name: string;
  image_original: string;
  updated_at: Timestamp;
}

interface ActivitySession {
  user_id: string;
  workspace_id: string;
  start_time: Timestamp;
  end_time: Timestamp | null;
  last_seen: Timestamp; // Oturum devam ederken son görülme zamanı
}

interface SlackWorkspace {
  workspace_id: string;
  workspace_name: string;
  bot_token: string;
  status: string;
  // Diğer potansiyel alanlar...
}

async function getActiveWorkspaces(): Promise<SlackWorkspace[]> {
  const workspaces: SlackWorkspace[] = [];
  try {
    const q = query(collection(db, SLACK_WORKSPACES_COLLECTION), where("status", "==", "active"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      workspaces.push(doc.data() as SlackWorkspace);
    });
    console.log(`Found ${workspaces.length} active Slack workspaces.`);
    return workspaces;
  } catch (error) {
    console.error("Error fetching active Slack workspaces:", error);
    return []; // Hata durumunda boş array dön
  }
}


async function getAllUsers(botToken: string): Promise<SlackUser[]> {
  if (!botToken) throw new Error('botToken is not provided to getAllUsers');
  let users: SlackUser[] = [];
  let cursor: string | undefined = undefined;
  console.log(`Fetching users with a provided bot token...`);
  try {
    do {
      const response: Response = await fetch(
        `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${cursor}` : ''}`,
        {
          method: 'GET', // Explicitly set method for clarity
          headers: { Authorization: `Bearer ${botToken}` },
        }
      );
      const data: SlackUsersListResponse = await response.json();
      if (!data.ok) {
        // Token'ın hangi workspace'e ait olduğunu loglamak faydalı olabilir (ama token'ı direkt loglama)
        console.error(`Slack API Error (users.list): ${data.error} - Needed: ${data.needed}, Provided: ${data.provided}. This might indicate an issue with the token or its scopes.`);
        throw new Error(`Slack API Error (users.list): ${data.error}`);
      }
      
      const activeUsers = data.members
        .filter((user: SlackUser) => !user.is_bot && !user.deleted)
        .map((user: SlackUser) => {
          const resolvedName = user.profile?.real_name || user.profile?.display_name || user.name;
          return { ...user, name: resolvedName }; 
        });

      users = users.concat(activeUsers);
      cursor = data.response_metadata?.next_cursor;
    } while (cursor);
    console.log(`Fetched ${users.length} users for the current workspace.`);
    return users;
  } catch (error) {
    console.error('Error fetching users from Slack:', error);
    return [];
  }
}

async function getUserPresence(userId: string, botToken: string): Promise<string | null> {
  if (!botToken) throw new Error('botToken is not provided to getUserPresence');
  try {
    const response = await fetch(
      `https://slack.com/api/users.getPresence?user=${userId}`,
      {
        method: 'GET', // Explicitly set method
        headers: { Authorization: `Bearer ${botToken}` },
      }
    );
    const data = await response.json();
    if (!data.ok) {
      console.error(`Slack API Error (users.getPresence for ${userId}): ${data.error} - Needed: ${data.needed}, Provided: ${data.provided}`);
      return null;
    }
    return data.presence;
  } catch (error) {
    console.error(`Error fetching presence for user ${userId}:`, error);
    return null;
  }
}

async function processWorkspace(workspace: SlackWorkspace) {
  const { workspace_id, workspace_name, bot_token } = workspace;

  console.log(`[${workspace_id}] Processing workspace: ${workspace_name}`);

  if (!bot_token) {
    console.error(`[${workspace_id}] Bot token is missing for workspace ${workspace_name}. Skipping.`);
    return;
  }
  
  try {
    const users = await getAllUsers(bot_token);
    if (!users || users.length === 0) {
      console.log(`[${workspace_id}] No users found for workspace ${workspace_name}.`);
      return;
    }
    console.log(`[${workspace_id}] Fetched ${users.length} users.`);

    for (const user of users) {
      if (!user.id || user.is_bot || user.deleted) {
        continue;
      }
      
      const newPresence = await getUserPresence(user.id, bot_token);
      if (newPresence === null) {
        console.log(`[${workspace_id}] Could not get presence for user ${user.id} (${user.name}). Skipping.`);
        continue;
      }
      
      const userStatusRef = doc(db, USER_STATUS_COLLECTION, user.id);
      const userStatusSnap = await getDoc(userStatusRef);
      const lastStatus = userStatusSnap.exists() ? userStatusSnap.data() as UserStatus : null;
      const lastPresence = lastStatus?.presence || 'away';

      const now = Timestamp.now();
      
      // Update general user info regardless of presence change
      const statusData: Partial<UserStatus> = {
        user_id: user.id,
        workspace_id: workspace_id,
        name: user.name || '',
        presence: newPresence,
        status_text: user.profile?.status_text || '',
        status_emoji: user.profile?.status_emoji || '',
        status_expiration: user.profile?.status_expiration || 0,
        real_name: user.profile?.real_name || '',
        display_name: user.profile?.display_name || '',
        image_original: user.profile?.image_original || user.profile?.image_512 || '',
        updated_at: now,
      };

      if (newPresence === 'active' && lastPresence !== 'active') {
        // Durum 'away' -> 'active': Yeni oturum başlat
        console.log(`[${workspace_id}] User ${user.id} changed status to 'active'. Starting new session.`);
        const sessionData: ActivitySession = {
          user_id: user.id,
          workspace_id: workspace_id,
          start_time: now, // Oturum başlangıcı anlık zaman
          end_time: null,
          last_seen: now,
        };
        const sessionRef = await addDoc(collection(db, ACTIVITY_SESSIONS_COLLECTION), sessionData);
        statusData.active_session_id = sessionRef.id;

      } else if (newPresence === 'active' && lastPresence === 'active') {
        // Durum 'active' -> 'active': Mevcut oturumu güncelle (last_seen)
        console.log(`[${workspace_id}] User ${user.id} is still 'active'. Updating last_seen.`);
        if (lastStatus?.active_session_id) {
          const sessionRef = doc(db, ACTIVITY_SESSIONS_COLLECTION, lastStatus.active_session_id);
          await updateDoc(sessionRef, { last_seen: now });
        } else {
            // Edge case: user_status'da session ID yok ama kullanıcı aktif. Yeni oturum başlat.
            console.warn(`[${workspace_id}] User ${user.id} is 'active' but has no active_session_id. Starting a new session.`);
            const sessionData: ActivitySession = {
                user_id: user.id,
                workspace_id: workspace_id,
                start_time: now,
                end_time: null,
                last_seen: now,
            };
            const sessionRef = await addDoc(collection(db, ACTIVITY_SESSIONS_COLLECTION), sessionData);
            statusData.active_session_id = sessionRef.id;
        }

      } else if (newPresence !== 'active' && lastPresence === 'active') {
        // Durum 'active' -> 'away': Mevcut oturumu sonlandır
        console.log(`[${workspace_id}] User ${user.id} changed status to 'away'. Ending session.`);
        if (lastStatus?.active_session_id) {
          const sessionRef = doc(db, ACTIVITY_SESSIONS_COLLECTION, lastStatus.active_session_id);
          await updateDoc(sessionRef, { end_time: now, last_seen: now });
        }
        statusData.active_session_id = null;
      }
      
      // Update user status in all cases
      await setDoc(userStatusRef, statusData, { merge: true });
    }
    console.log(`[${workspace_id}] Finished presence check for workspace: ${workspace_name}`);
  } catch (error) {
    console.error(`[${workspace_id}] Error processing workspace ${workspace_name}:`, error);
  }
}


export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET) {
    console.error('CRON_SECRET environment variable is not set.');
    return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
  }

  if (authHeader !== expectedToken) {
    console.warn('Unauthorized cron job access attempt.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('Cron job started (GET): Checking user presences for all active workspaces...');
  try {
    const activeWorkspaces = await getActiveWorkspaces();
    if (!activeWorkspaces || activeWorkspaces.length === 0) {
      console.log('No active workspaces found. Cron job ending.');
      return NextResponse.json({ message: 'No active workspaces found.' });
    }

    for (const workspace of activeWorkspaces) {
      await processWorkspace(workspace);
    }

    console.log('Cron job finished successfully for all workspaces.');
    return NextResponse.json({ message: 'Presence check completed for all workspaces.' });
  } catch (error) {
    console.error('Error in cron job execution:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Cron job failed', details: errorMessage }, { status: 500 });
  }
}

// POST handler da benzer şekilde güncellenmeli eğer kullanılıyorsa.
// Şimdilik sadece GET'i güncelledik.
export async function POST(request: NextRequest) {
  // Güvenlik kontrolü GET ile aynı
  const authHeader = request.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expectedToken) {
    console.warn('Unauthorized cron job POST access attempt.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log('Cron job started (POST): Checking user presences for all active workspaces...');
  try {
    const activeWorkspaces = await getActiveWorkspaces();
    if (!activeWorkspaces || activeWorkspaces.length === 0) {
      console.log('No active workspaces found (POST). Cron job ending.');
      return NextResponse.json({ message: 'No active workspaces found.' });
    }

    for (const workspace of activeWorkspaces) {
      await processWorkspace(workspace);
        }

    console.log('Cron job finished successfully for all workspaces (POST).');
    return NextResponse.json({ message: 'Presence check completed for all workspaces.' });
  } catch (error) {
    console.error('Error in cron job execution (POST):', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Cron job failed (POST)', details: errorMessage }, { status: 500 });
  }
} 