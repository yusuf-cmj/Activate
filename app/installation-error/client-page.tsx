'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link';

// Hata sayfasının arayüzü
function ErrorDisplay({ error }: { error: string | null }) {
  let errorMessage = "Bilinmeyen bir hata oluştu.";

  if (error) {
    switch (error) {
      case 'access_denied':
        errorMessage = "Kurulum isteği reddedildi veya iptal edildi.";
        break;
      case 'no_code':
        errorMessage = "Slack'ten yetkilendirme kodu alınamadı.";
        break;
      case 'config_error':
        errorMessage = "Uygulama sunucu tarafında doğru şekilde yapılandırılmamış. Lütfen sistem yöneticisi ile iletişime geçin.";
        break;
      case 'token_exchange_failed':
        errorMessage = "Slack ile yetkilendirme anahtarı değişimi başarısız oldu.";
        break;
      case 'oauth_exception':
        errorMessage = "OAuth işlemi sırasında beklenmedik bir sunucu hatası oluştu.";
        break;
      default:
        errorMessage = `Detay: ${error}`;
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
      <h1>Kurulum Başarısız</h1>
      <p>Slack uygulamasının çalışma alanınıza kurulumu sırasında bir sorun oluştu.</p>
      <p style={{ color: 'red' }}>{errorMessage}</p>
      <p>Lütfen tekrar deneyin veya destek için iletişime geçin.</p>
      <p><Link href="/">Ana Sayfaya Dön</Link></p>
    </div>
  );
}

// Parametreleri okumak için asıl istemci bileşeni
export default function ClientErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return <ErrorDisplay error={error} />;
} 