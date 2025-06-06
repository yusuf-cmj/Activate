import { Suspense } from 'react';
import ClientErrorPage from './client-page';

// This is the main Server Component for the page.
export default function InstallationErrorPage() {
  return (
    // Wrap the Client Component in a Suspense boundary.
    // This allows the rest of the page to be rendered on the server
    // while the part that uses searchParams waits for the client.
    <Suspense fallback={<Loading />}>
      <ClientErrorPage />
    </Suspense>
  );
}

// A simple loading component to show as a fallback.
function Loading() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
      <h2>Loading...</h2>
    </div>
  );
} 