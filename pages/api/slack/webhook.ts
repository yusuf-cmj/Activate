import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Log the raw request body and headers for debugging
  console.log("Request headers:", req.headers);
  console.log("Raw request body:", req.body);

  // Slack URL doğrulama (challenge)
  if (req.body && req.body.type === "url_verification" && req.body.challenge) {
    console.log("Responding to Slack URL verification challenge.");
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Event loglama
  if (req.body && req.body.event) {
    console.log("Slack event received:", req.body.event);
    // Burada Firestore'a yazma işlemini daha sonra ekleyeceğiz
  } else {
    // Eğer event değilse veya body beklenmedik bir formatta ise
    console.log("Received non-event request or unexpected body format:", req.body);
  }

  // Her durumda Slack'e hızlı bir 200 OK dönmek iyi bir pratik.
  // Slack 3 saniye içinde yanıt bekler.
  res.status(200).json({ ok: true });
}

// Next.js API route config - bodyParser'ı devre dışı bırakmamız gerekebilir
// eğer Slack'in isteği text/plain veya farklı bir formatta geliyorsa
// ve Next.js'in varsayılan JSON parser'ı sorun çıkarıyorsa.
// Şimdilik varsayılanı kullanalım, gerekirse değiştiririz.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb', // Slack istekleri genellikle küçük olur
    },
  },
}; 