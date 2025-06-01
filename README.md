# Activate - Slack User Activity Tracking Application

Activate is a web application that tracks users' online presence (active, away, etc.) on Slack and provides detailed reports by analyzing this data. Thanks to its Slack integration, it automatically detects and saves users' Slack statuses.

## Key Features

*   **Real-time Activity Tracking:** Monitors users' current activity status.
*   **Detailed User Reports:** Shows metrics like total active time, work sessions, and number of activity changes for a specific date.
*   **Daily Activity Timeline:** Visually presents a user's activity transitions throughout the day.
*   **Date Selection:** Allows viewing activity data for past dates.
*   **Slack Integration:** Automatically fetches users' Slack statuses.
*   **Data Caching:** Improves performance with a client-side caching mechanism for frequently accessed data.

## Technologies Used

*   **Next.js:** React-based web application development framework.
*   **TypeScript:** Static type checking for JavaScript.
*   **Firebase (Firestore):** NoSQL database for user activity logs and other data.
*   **Tailwind CSS:** A CSS framework for rapid UI development.
*   **Shadcn/ui:** Reusable UI components.
*   **NextAuth.js:** Authentication management.
*   **GitHub Actions:** To periodically trigger cron jobs on Vercel.

## Setup and Running

1.  **Clone the Project:**
    ```bash
    git clone <project-repo-url>
    cd Activate
    ```

2.  **Install Dependencies:**
    ```bash
    pnpm install
    ```

3.  **Set Up Environment Variables:**
    Copy the `.env.local.example` file (if it exists) to `.env.local` and enter your Firebase project credentials, NextAuth settings, and the necessary secret keys for Slack integration.
    Example `.env.local` content:
    ```env
    # Firebase (Get from Firebase Console)
    NEXT_PUBLIC_FIREBASE_API_KEY=
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
    NEXT_PUBLIC_FIREBASE_APP_ID=

    # NextAuth
    AUTH_SECRET= # To generate: openssl rand -hex 32
    NEXTAUTH_URL=http://localhost:3000 # For development environment

    # Slack (Get from your Slack app)
    NEXT_PUBLIC_SLACK_CLIENT_ID=
    SLACK_CLIENT_SECRET=
    SLACK_SIGNING_SECRET= # Optional, for event verification
    SLACK_BOT_TOKEN= # Token starting with xoxb-...

    # Cron Job (For triggering Vercel via GitHub Actions)
    VERCEL_CRON_SECRET= # A secure key you define
    ```

4.  **Start the Development Server:**
    ```bash
    pnpm dev
    ```
    You can view the application in your browser at [http://localhost:3000](http://localhost:3000).

## API Endpoints (Key Ones)

*   `GET /api/auth/[...nextauth]`: Authentication endpoints managed by NextAuth.js.
*   `POST /api/slack/webhook`: Listens for events from Slack (event subscriptions, slash commands, etc.).
*   `GET /api/cron/check-presence`: Periodically checks users' current statuses from Slack and saves them to Firestore. This endpoint is regularly triggered by GitHub Actions.


## Cron Jobs

*   **User Status Check (`check-presence`):**
    *   **Purpose:** To regularly check the Slack statuses of active users and save them to the database.
    *   **Trigger Mechanism:** A GitHub Actions workflow (`.github/workflows/trigger-vercel-cron.yml`) calls the `/api/cron/check-presence` endpoint on Vercel.
    *   **Frequency:** Every 5 minutes.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
