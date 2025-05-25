import { NextResponse } from 'next/server';

// Eski pages/api/slack/webhook.ts içeriğini buraya uyarlayacağız

export async function POST(request: Request) {
  try {
    const body = await request.json(); // Slack istekleri JSON formatında gelir

    // Log the raw request body and headers for debugging
    // console.log("Request headers:", request.headers);
    // console.log("Raw request body (from webhook):", body);

    // Slack URL doğrulama (challenge)
    if (body && body.type === "url_verification" && body.challenge) {
      console.log("Responding to Slack URL verification challenge.");
      return NextResponse.json({ challenge: body.challenge });
    }

    // Event loglama (şimdilik sadece logluyoruz, Firestore kaydı cron job'da)
    if (body && body.event) {
      console.log("Slack event received (from webhook):", body.event);
      // Gerçek uygulamada bu eventleri direkt işlemek yerine
      // bir kuyruğa atıp (örn: BullMQ, RabbitMQ) veya
      // hemen kısa bir işlem yapıp bırakmak daha iyi olabilir.
      // Bizim senaryomuzda ana loglama cron job ile yapıldığı için
      // burası sadece Slack'in "Event Subscriptions" ayarı için gerekli.
    } else {
      console.log("Received non-event request or unexpected body format (from webhook):", body);
    }

    // Her durumda Slack'e hızlı bir 200 OK dönmek iyi bir pratik.
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('Error processing Slack webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Slack'e hata dönerken bile 200 dönebiliriz ki tekrar denemeleri azaltalım,
    // ama ciddi hatalarda 500 dönmek de mantıklı olabilir.
    return NextResponse.json({ error: 'Failed to process webhook', details: errorMessage }, { status: 500 });
  }
}

// Slack genellikle POST isteği gönderir, ancak GET handler'ı da eklenebilir (nadiren gerekir).
// export async function GET(request: Request) {
//   return NextResponse.json({ message: 'Slack webhook endpoint. Please use POST for events.' });
// } 