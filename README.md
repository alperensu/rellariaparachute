# Rellaria Parachute Drop — Adım 2

Bu aşamada backend bağlantısına temel Phaser ekranı eklenmiştir:

1. Express HTTP sunucusu açılır.
2. Kick kanalının `chatroom.id` değeri bulunur.
3. Kick'in kullandığı Pusher WebSocket kanalına salt-okunur abone olunur.
4. Sohbette `!drop` veya `!atla` yazıldığında kullanıcı bilgisi yakalanır.
5. Socket.io üzerinden frontend'e `drop` olayı gönderilir.
6. `http://localhost:3000` adresindeki 1920×1080 şeffaf Phaser overlay'i olayı dinler.
7. Kullanıcı adı, katılım kartı ve paraşüt animasyonu ekranda gösterilir.

Yerçekimi, düşen karakter ve gerçek paraşüt fiziği sonraki adımlarda eklenecektir.

## Kurulum

Projede paketler kayıtlıdır. Sıfırdan kurulacaksa kullanılan komutlar:

```bash
npm install express socket.io ws dotenv phaser
npm install --save-dev typescript tsx vitest @types/node @types/express @types/ws
```

Projeyi hazırlamak için:

```bash
npm install
```

`.env.example` dosyasını `.env` adıyla kopyalayın:

```env
KICK_CHANNEL_SLUG=rellaria
KICK_CHATROOM_ID=
KICK_PUSHER_URL=wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679
PORT=3000
CLIENT_ORIGIN=*
```

`KICK_CHATROOM_ID` boş bırakılırsa backend şu herkese açık kanal bilgisinden `chatroom.id` değerini otomatik almaya çalışır. Kick, Node.js isteğine 403 döndürürse sistemdeki `curl` otomatik fallback olarak kullanılır:

```text
https://kick.com/api/v2/channels/rellaria/chatroom
```

Kick/Cloudflare bu isteği sunucuda engellerse adresi normal tarayıcıda açın, JSON içindeki `chatroom.id` sayısını `.env` dosyasındaki `KICK_CHATROOM_ID` alanına yazın.

## Çalıştırma

Geliştirme:

```bash
npm run dev
```

Oyun ekranı:

```text
http://localhost:3000
```

Ekranı açık bırakıp Kick sohbetine `!drop`, `!atla`, `!atla 😎` veya komutlardan birinin yanına bir Kick emote ekleyerek yazın. Komuttan sonra yazılan ilk Unicode emoji ya da Kick emote oyuncunun karakteri olur; sade komut için `🙂` kullanılır. Kick emote görselleri sayısal kimliği doğrulayan aynı-origin sunucu proxy'sinden yüklenir. Boştaki ilk komut 60 saniyelik etkinliği başlatır ve ekranın altında rastgele konumda pembe, simli sıvı kasesi oluşturur. Kullanıcı anında ekranın üstünden paraşütle atlar. İniş noktası ekran geneline rastgele dağıtıldığı için kaseyi tutturmak zordur; kase dışına inen oyuncular 0 puan alır. Karakter ve puanı etkinlik bitene kadar sahnede kalır. Etkinlik boyunca her kullanıcı bir kez atlayabilir; süre bitince hedef ve bütün oyuncular kapanır, sonraki komut yeni konumlu etkinliği başlatır. Overlay'in arka planı tamamen şeffaftır; iniş alanı, paraşütçüler ve puanları dışında hiçbir arayüz gösterilmez.

OBS Browser Source ayarları:

```text
URL: http://localhost:3000
Genişlik: 1920
Yükseklik: 1080
FPS: 60
```

Üretim derlemesi:

```bash
npm run build
npm start
```

Bağlantı başarılı olduğunda terminalde şuna benzer bir çıktı görünür:

```text
[KICK] rellaria sohbetine bağlandı (chatroom: 123456).
```

Bir izleyici sohbete `!drop`, `!atla` veya yanına bir karakter eklenmiş halini yazdığında:

```text
[DROP] KullaniciAdi oyuna katıldı.
```

Socket.io bütün bağlı frontend istemcilerine şu olayı yollar:

```ts
socket.on("drop", (player) => {
  // {
  //   messageId: "...",
  //   userId: "42",
  //   username: "KullaniciAdi",
  //   receivedAt: "2026-07-20T12:00:00Z"
  // }
});
```

Sunucu durumu: `http://localhost:3000/health`

## Kullanılan Kick yöntemi

`@retconned/kick-js` paketi güncel görünse de kanal bilgisini almak için Puppeteer ve Stealth eklentisi çalıştırıyor. Bu proje bunun yerine doğrudan `ws` kullanır:

```text
wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679
channel: chatrooms.{chatroomId}.v2
event: App\Events\ChatMessageEvent
```

Bu bağlantı salt-okunurdur ve Kick kullanıcı şifresi, cookie veya token istemez. Ancak resmî API değildir; Kick altyapıyı değiştirirse `KICK_PUSHER_URL` veya protokol sınıfının güncellenmesi gerekebilir. Bağlantı koptuğunda backend üstel gecikmeyle otomatik yeniden bağlanır.

## Test

```bash
npm test
npm run build
```
