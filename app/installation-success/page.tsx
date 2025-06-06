import React from 'react';

// URL'den query parametrelerini almak için (Server Component)
interface InstallationSuccessPageProps {
  searchParams: {
    workspace?: string;
    error?: string; // Genel bir hata mesajı da gelebilir diye ekleyelim
  };
}

// Sayfayı async yapıyoruz
export default async function InstallationSuccessPage({ searchParams }: InstallationSuccessPageProps) {
  // searchParams artık doğrudan kullanılabilir, Next.js bunu Server Component'larda yönetir.
  const workspace = searchParams?.workspace;
  const error = searchParams?.error;

  if (error) {
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', textAlign: 'center' }}>
        <h1>Kurulum Hatası</h1>
        <p>Slack uygulamasının kurulumu sırasında bir hata oluştu.</p>
        <p style={{ color: 'red' }}>Hata Detayı: {error}</p>
        <p><a href="/">Ana Sayfaya Dön</a></p>
      </div>
    );
  }

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
      <p><a href="/">Ana Sayfaya Dön</a></p>
    </div>
  );
} 