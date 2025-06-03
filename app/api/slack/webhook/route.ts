import { NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
// import { google } from 'googleapis'; // Eski Google Calendar API importu, artık direkt Meet API kullanacağız
import { OAuth2Client, GoogleAuth } from 'google-auth-library';
import { SpacesServiceClient, protos } from '@google-apps/meet';

// .env.local dosyasından değişkenleri al
const slackBotToken = process.env.SLACK_BOT_TOKEN;
// const googleCalendarId = process.env.GOOGLE_CALENDAR_ID; // Meet API için doğrudan gerekli değil, ama loglama vs. için tutulabilir

// Yeni OAuth2 değişkenleri
const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

if (!slackBotToken) {
  console.error("SLACK_BOT_TOKEN is not defined in .env.local");
}
if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error("Google OAuth credentials are not defined in .env.local");
}

// Slack Web API clientını başlat
const slackClient = slackBotToken ? new WebClient(slackBotToken) : null;

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
  try {
    const rawText = await request.text();
    console.log("Raw request text from Slack:", rawText);

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawText);
    } catch {
      const params = new URLSearchParams(rawText);
      for (const [key, value] of params.entries()) {
        body[key] = value;
      }
    }
    console.log("Parsed Slack request body:", body);

    if (body && (body.type as string) === "url_verification" && (body.challenge as string)) {
      console.log("Responding to Slack URL verification challenge.");
      return NextResponse.json({ challenge: body.challenge as string });
    }

    if (body && (body.command as string)) {
      if ((body.command as string) === "/meeting") {
        console.log("Received /meeting command:", body);
        const channelId = body.channel_id as string;
        const userId = body.user_id as string;
        const meetingTopic = (body.text as string | undefined) || "Hızlı Toplantı";
        const slackResponseUrl = body.response_url as string | undefined;

        if (!slackClient) {
          console.error("Slack client is not initialized.");
          // Slack'e anında yanıt için response_url kullanabiliriz
          if (slackResponseUrl) {
            await fetch(slackResponseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: 'Slack bot token hatası.' }),
            });
          }
          return new Response(null, { status: 200 }); // Slack'e OK dön, hatayı response_url ile bildirdik
        }
        if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
          console.error("Google OAuth credentials error.");
          if (slackResponseUrl) {
            await fetch(slackResponseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: 'Google kimlik doğrulama hatası.' }),
            });
          }
          return new Response(null, { status: 200 });
        }

        try {
          const primedOAuth2Client = await getOAuth2Client();
          
          // Explicitly wrap the primed OAuth2Client with a GoogleAuth instance
          const googleAuthWrapper = new GoogleAuth({
            authClient: primedOAuth2Client, // Pass the existing AuthClient instance
            scopes: ['https://www.googleapis.com/auth/meetings.space.created'] // Scopes might also be needed here
          });
          
          // It might be necessary to "prime" the GoogleAuthWrapper too, though it uses an already primed client
          // await googleAuthWrapper.getAccessToken(); // Optional: test if this is needed or causes issues

          const meetClient = new SpacesServiceClient({
            auth: googleAuthWrapper, // Pass the GoogleAuth instance that wraps the OAuth2Client
          });

          console.log("Creating Google Meet space...");
          
          // The createSpace request can be an empty object or specify a spaceId if needed for idempotency
          // For a new meeting each time, an empty request is fine.
          const requestParams: protos.google.apps.meet.v2.ICreateSpaceRequest = {};

          // If you want to assign a specific ID for the space (e.g., from your system)
          // you can set requestParams.space = { spaceId: "your-unique-space-id" };
          // Or for conference record solution settings:
          // requestParams.space = { 
          //   config: { 
          //     accessType: "OPEN", // Or "RESTRICTED" or "TRUSTED"
          //   }
          // };

          const [createdSpace] = await meetClient.createSpace(requestParams);

          if (!createdSpace || !createdSpace.meetingUri) {
            throw new Error('Failed to create Google Meet space or get meeting URI.');
          }

          const meetLink = createdSpace.meetingUri;
          console.log(`Google Meet space created. URI: ${meetLink}`);
          
          // Meet linkini takvim etkinliğine eklemek isterseniz, burada Google Calendar API'yi 
          // (yine OAuth2 ile) çağırıp, meetLink'i description veya location'a ekleyebilirsiniz.
          // Şimdilik sadece Meet linkini Slack'e gönderiyoruz.

          await slackClient.chat.postMessage({
            channel: channelId,
            text: `Toplantı hazır! :video_camera:\nKonu: *${meetingTopic}*\nGoogle Meet Linki: ${meetLink}`,
          });
          return new Response(null, { status: 200 });

        } catch (error: unknown) {
          console.error("Error creating Google Meet link or posting to Slack:", error);
          let errorMessage = "Google Meet linki oluşturulurken bir hata oluştu.";
          
          if (typeof error === 'object' && error !== null) {
            const err = error as { message?: string; code?: string | number; details?: string };
            if (err.message) {
              errorMessage += ` Detay: ${err.message}`;
            }
            if (err.code) {
              errorMessage += ` (Kod: ${err.code})`;
            }
            if (err.details) {
              errorMessage += ` Detaylar: ${err.details}`;
            }
          } else if (error instanceof Error) {
            errorMessage += ` Detay: ${error.message}`;
          } else {
            errorMessage += ` Detay: ${String(error)}`;
          }
          
          if (slackResponseUrl) {
            try {
              await fetch(slackResponseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: errorMessage }),
              });
            } catch (slackError) {
              console.error("Error sending error message via response_url:", slackError);
            }
          } else {
             // response_url yoksa, normal mesaj olarak göndermeyi dene (daha az tercih edilir)
            try {
              await slackClient.chat.postEphemeral({
                channel: channelId,
                user: userId,
                text: errorMessage,
              });
            } catch (slackError) {
              console.error("Error sending ephemeral error message to Slack:", slackError);
            }
          }
          return new Response(null, { status: 200 }); // Slack'e hata oluştuğunu bildirdik
        }
    } else {
        console.log(`Received unhandled slash command: ${body.command as string}`);
        return NextResponse.json({
            response_type: "ephemeral",
            text: `Bilinmeyen komut: ${body.command as string}`
        }, { status: 200 });
      }
    }

    console.log("Request processed, returning generic OK to Slack if no specific response sent.");
    return NextResponse.json({ ok: true });

  } catch (error: unknown) {
    console.error('Error processing Slack webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Genel bir hata durumunda Slack'e doğrudan yanıt vermeyebiliriz, loglamak daha önemli.
    return new Response(`Webhook error: ${errorMessage}`, { status: 500 });
  }
}

// GET handler (olduğu gibi bırakıyoruz)
// export async function GET(request: Request) {
//   return NextResponse.json({ message: 'Slack webhook endpoint. Please use POST for events.' });
// } 