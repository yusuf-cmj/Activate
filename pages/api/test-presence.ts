import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  const userIdToQuery = 'U06N8ANMTF1'; // User ID güncellendi

  if (!slackBotToken) {
    return res.status(500).json({ error: 'SLACK_BOT_TOKEN is not set in .env.local' });
  }

  if (req.method === 'GET') {
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
        console.error('Slack API Error:', data.error);
        return res.status(500).json({ error: `Slack API Error: ${data.error}`, details: data });
      }

      return res.status(200).json(data);
    } catch (error) {
      console.error('Error fetching presence:', error);
      return res.status(500).json({ error: 'Failed to fetch presence', details: error });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 