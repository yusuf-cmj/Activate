import { NextResponse } from 'next/server';

// Eski pages/api/test-presence.ts içeriğini buraya uyarlayacağız

export async function GET(request: Request) {
  // URL'den user query parametresini alabiliriz veya sabit bir ID kullanabiliriz
  // const { searchParams } = new URL(request.url);
  // const userIdToQuery = searchParams.get('user') || 'U06N8ANMTF1'; // Örnek User ID
  const userIdToQuery = 'U06N8ANMTF1'; // Şimdilik sabit kalsın, önceki gibi

  const slackBotToken = process.env.SLACK_BOT_TOKEN;

  if (!slackBotToken) {
    return NextResponse.json(
      { error: 'SLACK_BOT_TOKEN is not set in .env.local' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://slack.com/api/users.getPresence?user=${userIdToQuery}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${slackBotToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();

    if (!data.ok) {
      console.error('Slack API Error (test-presence):', data.error, data.needed, data.provided);
      return NextResponse.json(
        { error: `Slack API Error: ${data.error}`, details: data },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching presence (test-presence):', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch presence', details: errorMessage },
      { status: 500 }
    );
  }
} 