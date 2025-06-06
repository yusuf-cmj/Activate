import React from 'react';

// URL'den query parametrelerini almak için (Server Component)
interface InstallationErrorPageProps {
  searchParams: {
    error?: string;
    // Diğer potansiyel hata detayları için parametreler eklenebilir
  };
}

// Sayfayı async yapıyoruz
export default async function InstallationErrorPage({ searchParams }: InstallationErrorPageProps) {
  // searchParams artık doğrudan kullanılabilir, Next.js bunu Server Component'larda yönetir.
  const error = searchParams?.error;
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
        // Daha fazla özelleştirilmiş hata mesajı için buraya case'ler eklenebilir
        // Veya gelen `error` mesajını doğrudan gösterebiliriz, ancak güvenlik açısından
        // önceden tanımlanmış mesajlar daha iyi olabilir.
        errorMessage = `Detay: ${error}`;
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
      <h1>Kurulum Başarısız</h1>
      <p>Slack uygulamasının çalışma alanınıza kurulumu sırasında bir sorun oluştu.</p>
      <p style={{ color: 'red' }}>{errorMessage}</p>
      <p>Lütfen tekrar deneyin veya destek için iletişime geçin.</p>
      <p><a href="/">Ana Sayfaya Dön</a></p>
    </div>
  );
} 