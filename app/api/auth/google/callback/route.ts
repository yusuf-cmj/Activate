import { NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';

const GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'https://fe92-78-163-189-239.ngrok-free.app/api/auth/google/callback'; // Next.js portuna göre ayarla

const SCOPES = ['https://www.googleapis.com/auth/meetings.space.created'];

const oauth2Client = new OAuth2Client(
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  REDIRECT_URI
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Google OAuth Client ID veya Secret ortam değişkenlerinde eksik.' }, { status: 500 });
  }

  if (code) {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // token.json dosyasına kaydetmek yerine doğrudan refresh_token'ı gösterelim
      // Bu sadece tek seferlik bir işlem olduğu için.
      if (tokens.refresh_token) {
        console.log('GOOGLE_REFRESH_TOKEN:', tokens.refresh_token);
        // Geliştirme ortamında token.json'a da yazabiliriz (opsiyonel)
        // const tokenPath = path.join(process.cwd(), 'token.json');
        // await fs.writeFile(tokenPath, JSON.stringify(tokens));
        // console.log('Access and refresh tokens stored to token.json');
        
        return NextResponse.json({ 
          message: 'Yetkilendirme başarılı! Aşağıdaki Refresh Token\'ı kopyalayıp .env.local dosyanıza GOOGLE_REFRESH_TOKEN olarak ekleyin ve sunucuyu yeniden başlatın. Bu pencereyi kapatabilirsiniz.',
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token // Sadece bilgi amaçlı
        });
      } else {
        return NextResponse.json({ 
          message: 'Refresh token alınamadı. Muhtemelen daha önce yetki verilmiş ve refresh token zaten mevcut veya bir hata oluştu. Google hesap izinlerinizi kontrol edin ve uygulamayı kaldırıp tekrar deneyin.',
          access_token: tokens.access_token // Sadece bilgi amaçlı
        }, { status: 400 });
      }
    } catch (error: unknown) {
      console.error('Error retrieving access token:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: 'Error retrieving access token', details: errorMessage }, { status: 500 });
    }
  } else {
    // Eğer 'code' yoksa, kullanıcıyı yetkilendirme URL'sine yönlendir
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // 'offline' refresh_token almak için gerekli
      scope: SCOPES,
      prompt: 'consent' // Her seferinde onay ekranını göster (refresh token için önemli)
    });
    return NextResponse.redirect(authUrl);
  }
} 