'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link';

// Başarı sayfasının arayüzü
function SuccessDisplay({ workspace }: { workspace: string | null }) {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
      <h1>Kurulum Başarılı!</h1>
      {workspace ? (
        <p>
          Slack uygulaması <strong>{workspace}</strong> çalışma alanına başarıyla eklendi.
        </p>
      ) : (
        <p>Slack uygulaması başarıyla eklendi.</p>
      )}
      <p>Artık bu pencereyi kapatabilir veya uygulamanıza geri dönebilirsiniz.</p>
      <p><Link href="/">Ana Sayfaya Dön</Link></p>
    </div>
  );
}

// Parametreleri okumak için asıl istemci bileşeni
export default function ClientSuccessPage() {
  const searchParams = useSearchParams();
  const workspace = searchParams.get('workspace');
  
  return <SuccessDisplay workspace={workspace} />;
} 