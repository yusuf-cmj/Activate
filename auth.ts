import NextAuth from 'next-auth';
import { authConfig } from './auth.config'; // Bir önceki adımda oluşturduğumuz config dosyasını import ediyoruz

export const {
  handlers: { GET, POST }, // API rotaları (app/api/auth/[...nextauth]/route.ts) için
  auth,                       // Sunucu tarafı (RSC, API rotaları, middleware) session kontrolü için
  signIn,                     // Sunucu tarafı veya Client Component'te giriş başlatmak için
  signOut,                    // Sunucu tarafı veya Client Component'te çıkış yapmak için
} = NextAuth(authConfig); 