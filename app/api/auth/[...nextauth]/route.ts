import { GET, POST } from '@/auth'; // Projenizin kökündeki auth.ts dosyasından import ediyoruz

export { GET, POST };

// İsteğe bağlı: Edge runtime'ı tercih ederseniz (Auth.js v5 bunu destekler)
// export const runtime = "edge"; 