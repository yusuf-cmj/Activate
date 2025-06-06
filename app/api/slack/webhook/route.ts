import { NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
// import { google } from 'googleapis'; // Eski Google Calendar API importu, artık direkt Meet API kullanacağız
import { OAuth2Client, GoogleAuth } from 'google-auth-library';
import { SpacesServiceClient, protos } from '@google-apps/meet';
import crypto from 'crypto';
import { db } from '@/lib/firebase'; // Firebase db örneğinizin yolu
import { doc, getDoc } from 'firebase/firestore';

// .env.local dosyasından değişkenleri al
// const slackBotToken = process.env.SLACK_BOT_TOKEN;
// const googleCalendarId = process.env.GOOGLE_CALENDAR_ID; // Meet API için doğrudan gerekli değil, ama loglama vs. için tutulabilir

// Yeni OAuth2 değişkenleri
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

// KALDIRILACAK KONTROL:
if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error("Google OAuth credentials are not defined in .env.local");
}

// Function to get a primed OAuth2Client instance
async function getOAuth2Client(): Promise<OAuth2Client> {
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google OAuth credentials are not configured.");
  }

  const oauth2Client = new OAuth2Client(
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET
    // Redirect URI is not needed here as we are using a refresh token
  );
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

  try {
    // Prime the client by fetching an access token.
    const tokenResponse = await oauth2Client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error("Failed to retrieve access token using OAuth2Client and refresh token.");
    }
    console.log("Successfully obtained access token via OAuth2Client, instance is primed.");
    return oauth2Client;
  } catch (error) {
    console.error("Error priming OAuth2Client or getting access token:", error);
    throw new Error("Failed to initialize OAuth2Client. Details: " + (error instanceof Error ? error.message : String(error)));
  }
}

export async function POST(request: Request) {
  if (!SLACK_SIGNING_SECRET) {
    console.error("SLACK_SIGNING_SECRET is not defined in environment variables.");
    return new Response("Internal Server Error: Slack signing secret not configured.", { status: 500 });
  }

  const signature = request.headers.get('x-slack-signature');
  const timestamp = request.headers.get('x-slack-request-timestamp');
  
  const rawBody = await request.clone().text(); // Klonla, çünkü body bir kez okunabilir

  if (!signature || !timestamp) {
    console.warn("Warning: Slack signature or timestamp missing from request headers.");
    return new Response("Forbidden: Missing Slack signature or timestamp.", { status: 403 });
  }

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (60 * 5);
  if (parseInt(timestamp, 10) < fiveMinutesAgo) {
    console.warn("Warning: Slack request timestamp is too old.");
    return new Response("Forbidden: Slack request timestamp too old.", { status: 403 });
  }

  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const mySignature = 'v0=' +
    crypto.createHmac('sha256', SLACK_SIGNING_SECRET)
      .update(sigBasestring, 'utf8')
      .digest('hex');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(mySignature, 'utf8'), Buffer.from(signature, 'utf8'))) {
      console.warn("Warning: Invalid Slack signature.");
      return new Response("Forbidden: Invalid Slack signature.", { status: 403 });
    }
  } catch {
    console.error("Error during timingSafeEqual (signatures might have different lengths or other issue):");
    return new Response("Forbidden: Signature comparison failed.", { status: 403 });
  }
  
  console.log("Slack request signature verified successfully.");

  // Önce URL verification kontrolü (genellikle JSON formatında gelir)
  try {
    const jsonData = JSON.parse(rawBody); // rawBody'yi direkt kullan
    if (jsonData && jsonData.type === "url_verification" && jsonData.challenge) {
      console.log("Responding to Slack URL verification challenge.");
      return NextResponse.json({ challenge: jsonData.challenge });
    }
  } catch {
    // JSON parse hatası, muhtemelen slash command (x-www-form-urlencoded)
    console.log("Not a JSON body or not a URL verification, proceeding to parse as form data.");
  }

  // Slash komutları için x-www-form-urlencoded parse et
  let formPayload: URLSearchParams;
    try {
    formPayload = new URLSearchParams(rawBody);
  } catch (e) {
    console.error("Failed to parse Slack request body as x-www-form-urlencoded:", e);
    // response_url burada henüz bilinmiyor olabilir, genel hata dön
    return new Response("Bad Request: Could not parse body.", { status: 400 });
  }

  const teamId = formPayload.get('team_id');
  const command = formPayload.get('command');
  const channelId = formPayload.get('channel_id');
  const userId = formPayload.get('user_id');
  const meetingTopicText = formPayload.get('text');
  const slackResponseUrl = formPayload.get('response_url');

  if (!teamId) {
    console.error("team_id missing from Slack request body.");
    if (slackResponseUrl) {
        try {
            await fetch(slackResponseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Error: Missing team_id in request.' }),
            });
        } catch (fetchError) {
            console.error("Error sending error via response_url for missing team_id:", fetchError);
        }
    }
    return new Response(null, { status: 200 }); 
  }

  // Firestore'dan workspace için bot_token al
  let workspaceBotToken: string | null = null;
  try {
    const workspaceDocRef = doc(db, 'slack_workspaces', teamId);
    const workspaceDocSnap = await getDoc(workspaceDocRef);

    if (workspaceDocSnap.exists()) {
      const workspaceData = workspaceDocSnap.data();
      if (workspaceData && workspaceData.status === 'active' && workspaceData.bot_token) {
        workspaceBotToken = workspaceData.bot_token as string;
        console.log(`Retrieved bot token for workspace ${teamId}`);
      } else {
        console.warn(`Workspace ${teamId} is not active, bot_token is missing, or data is malformed. Data:`, workspaceData);
      }
    } else {
      console.warn(`Workspace ${teamId} not found in Firestore.`);
    }
  } catch (dbError) {
    console.error(`Error fetching workspace ${teamId} from Firestore:`, dbError);
    if (slackResponseUrl) {
        try {
            await fetch(slackResponseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Error: Could not retrieve workspace configuration.' }),
            });
        } catch (fetchError) {
            console.error("Error sending error via response_url for dbError:", fetchError);
        }
    }
    return new Response(null, { status: 200 }); 
  }

  if (!workspaceBotToken) {
    console.error(`Bot token not found or workspace not active for team_id: ${teamId}`);
          if (slackResponseUrl) {
        try {
            await fetch(slackResponseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Error: This Slack workspace is not configured correctly, is inactive, or bot token is missing.' }),
            });
        } catch (fetchError) {
            console.error("Error sending error via response_url for missing bot token:", fetchError);
        }
    }
    return new Response(null, { status: 200 }); 
  }

  const dynamicSlackClient = new WebClient(workspaceBotToken);

  // Şimdi komutları işle
  if (command) {
    if (command === "/meeting") {
      console.log(`Received /meeting command for workspace ${teamId} from user ${userId} in channel ${channelId}. Topic: "${meetingTopicText}"`);
      const meetingTopic = meetingTopicText || "Hızlı Toplantı";

        if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
        console.error("Google OAuth credentials error for /meeting command.");
          if (slackResponseUrl) {
          try {
            await fetch(slackResponseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: 'Google kimlik doğrulama hatası. Lütfen yönetici ile iletişime geçin.' }),
            });
          } catch (fetchError) {
            console.error("Error sending Google OAuth error via response_url:", fetchError);
          }
          }
          return new Response(null, { status: 200 });
        }

        try {
          const primedOAuth2Client = await getOAuth2Client();
          
          const googleAuthWrapper = new GoogleAuth({
          authClient: primedOAuth2Client,
          scopes: ['https://www.googleapis.com/auth/meetings.space.created']
          });

          const meetClient = new SpacesServiceClient({
          auth: googleAuthWrapper,
          });

        console.log("Creating Google Meet space for /meeting command...");
          
          const requestParams: protos.google.apps.meet.v2.ICreateSpaceRequest = {
            space: {
              config: {
              accessType: "OPEN"
              }
            }
          };

          const [createdSpace] = await meetClient.createSpace(requestParams);

          if (!createdSpace || !createdSpace.meetingUri) {
            throw new Error('Failed to create Google Meet space or get meeting URI.');
          }

          const meetLink = createdSpace.meetingUri;
          console.log(`Google Meet space created. URI: ${meetLink}`);
          
        if (!channelId) {
            console.error("channel_id is missing, cannot post message for /meeting.");
             if (slackResponseUrl) {
                try {
                    await fetch(slackResponseUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: "Bir hata oluştu: Kanal ID'si alınamadı." }),
                    });
                } catch (fetchError) {
                    console.error("Error sending channel_id error via response_url:", fetchError);
                }
            }
            return new Response(null, { status: 200 });
        }

        await dynamicSlackClient.chat.postMessage({
            channel: channelId,
          text: `Toplantı hazır! :video_camera:\\nKonu: *${meetingTopic}*\\nGoogle Meet Linki: ${meetLink}`,
          });
        // For slash commands, an immediate HTTP 200 OK is expected.
        // The message is posted asynchronously. No need for explicit response body here
        // if the postMessage is successful and we don't use response_url for success.
          return new Response(null, { status: 200 });


        } catch (error: unknown) {
        console.error("Error creating Google Meet link or posting to Slack for /meeting:", error);
        let detailedErrorMessage = "Google Meet linki oluşturulurken bir hata oluştu.";
          
          if (typeof error === 'object' && error !== null) {
            const err = error as { message?: string; code?: string | number; details?: string };
          if (err.message) detailedErrorMessage += ` Detay: ${err.message}`;
          if (err.code) detailedErrorMessage += ` (Kod: ${err.code})`;
          } else if (error instanceof Error) {
          detailedErrorMessage += ` Detay: ${error.message}`;
          }
          
          if (slackResponseUrl) {
            try {
              await fetch(slackResponseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: detailedErrorMessage }),
              });
          } catch (fetchError) {
            console.error("Error sending detailed error via response_url for /meeting:", fetchError);
            }
        } else if (channelId && userId) { 
            try {
                await dynamicSlackClient.chat.postEphemeral({
                channel: channelId,
                user: userId,
                    text: detailedErrorMessage,
              });
            } catch (ephemeralError) {
                console.error("Error sending ephemeral error message to Slack for /meeting:", ephemeralError);
            }
          }
        return new Response(null, { status: 200 }); 
      }
    }
    // ... (diğer slash komutları buraya eklenebilir) ...
    else {
        console.log(`Received unknown command: ${command} for team_id: ${teamId}`);
        if (slackResponseUrl) {
            try {
                await fetch(slackResponseUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: `Bilinmeyen komut: ${command}` }),
                });
            } catch (fetchError) {
                console.error("Error sending unknown command error via response_url:", fetchError);
            }
        }
        return new Response(null, { status: 200 });
    }
  } else {
      // Komut yoksa, event olabilir (bu örnekte sadece slash command handle ediliyor)
      console.log(`Received Slack request without a command for team_id: ${teamId}. Body keys: ${Array.from(formPayload.keys()).join(', ')}`);
      // Slack'e genellikle bir yanıt beklenir, özellikle response_url varsa.
      // Ancak, bu senaryo için özel bir işlem yoksa, sadece loglamak yeterli olabilir.
      // Ya da genel bir "İşlem tamamlandı ama bu olay için özel bir eylem tanımlanmadı" mesajı gönderilebilir.
      // if (slackResponseUrl) { ... }
      return new Response(null, { status: 200 }); // Genel OK
  }
  
  // Bu noktaya gelinmemeli eğer tüm yollar bir response dönüyorsa
  // return new Response("Unhandled request path.", { status: 404 });
}

// GET handler (olduğu gibi bırakıyoruz)
// export async function GET(request: Request) {
//   return NextResponse.json({ message: 'Slack webhook endpoint. Please use POST for events.' });
// } 