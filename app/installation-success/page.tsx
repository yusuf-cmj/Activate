import { Suspense } from 'react';
import ClientSuccessPage from './client-page';

// This is the main Server Component for the page.
export default function InstallationSuccessPage() {
  return (
    // Wrap the Client Component in a Suspense boundary.
    <Suspense fallback={<Loading />}>
      <ClientSuccessPage />
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