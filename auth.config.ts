import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export const authConfig = {
  // pages: {
  //   signIn: '/login', // Opsiyonel: Özel bir giriş sayfası isterseniz. Şimdilik Auth.js'in varsayılanını kullanabiliriz.
  // },
  providers: [
    Credentials({
      // Kullanıcıdan alınacak alanları tanımlayabilirsiniz (formda görünür)
      credentials: {
        email: { label: "Email", type: "email", placeholder: "test@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const expectedEmail = process.env.AUTH_USERNAME; // AUTH_USERNAME'i e-posta olarak düşünelim
        const expectedPassword = process.env.AUTH_PASSWORD;

        if (!credentials) return null;

        // Auth.js varsayılan formu 'email' ve 'password' gönderir
        const { email, password } = credentials as { email?: unknown; password?: unknown };

        if (typeof email !== 'string' || typeof password !== 'string') {
            console.error("Email or Password are not strings", { email, password });
            return null;
        }

        if (email === expectedEmail && password === expectedPassword) {
          // Başarılı giriş durumunda bir kullanıcı objesi döndürün.
          // Bu obje session'da saklanacak.
          return { id: "1", name: email.split('@')[0] || email, email: email }; // name olarak email'in @ öncesi kısmı veya direkt email
        } else {
          // Başarısız giriş
          console.log('Invalid credentials', { email });
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user; // Kullanıcı giriş yapmış mı? (session var mı?)
      const isOnDashboard = nextUrl.pathname.startsWith('/'); // Veya korunmasını istediğiniz ana yol
      const isAuthRoute = nextUrl.pathname.startsWith('/api/auth'); // Auth.js'in kendi yolları
      const isPublicAsset = nextUrl.pathname.includes('.') // Genel statik varlıkları dışarıda bırakmak için basit bir kontrol
                          || nextUrl.pathname.startsWith('/_next');

      if (isAuthRoute || isPublicAsset) {
        return true; // Auth yollarına ve genel varlıklara her zaman izin ver
      }

      if (isOnDashboard) {
        if (isLoggedIn) return true; // Eğer dashboard'da ve giriş yapmışsa, izin ver
        return false; // Giriş yapmamışsa, giriş sayfasına yönlendir (Auth.js bunu otomatik yapar)
      } else if (isLoggedIn) {
        // Eğer giriş yapmışsa ve zaten /login gibi bir sayfadaysa, ana sayfaya yönlendirebiliriz (opsiyonel)
        // return Response.redirect(new URL('/', nextUrl));
        return true;
      }
      // Diğer tüm durumlar için (örneğin, Auth.js'in kendi API yolları /api/auth/*) izin ver
      return true;
    },
  },
  // session: { strategy: "jwt" }, // Credentials provider için JWT varsayılandır.
  // callbacks: { // İhtiyaç duyarsanız callback'leri burada tanımlayabilirsiniz.
  //   async jwt({ token, user }) {
  //     if (user) {
  //       token.id = user.id;
  //     }
  //     return token;
  //   },
  //   async session({ session, token }) {
  //     if (session.user && token.id) {
  //       (session.user as any).id = token.id;
  //     }
  //     return session;
  //   },
  // },
} satisfies NextAuthConfig; 