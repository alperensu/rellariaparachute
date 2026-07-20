# Rellaria Parachute Drop 🪂

Kick yayıncıları için interaktif paraşüt drop overlay'i. İzleyiciler sohbete `!drop` veya `!atla` yazarak 1920×1080 şeffaf OBS overlay'ine paraşütle atlar; kaseye inen kazanır, puan Kick sohbetine otomatik yazılır.

## Özellikler

- **Şeffaf Phaser Overlay**: 1920×1080, OBS Browser Source uyumlu
- **Kick Sohbet Entegrasyonu**: Pusher WebSocket ile salt-okunur sohbet dinleme
- **Paraşüt Fiziği**: Havada çarpışma, sekme, rüzgar etkisi
- **Pembe İksir Kasesi**: Rastgele konumda beliren hedef; kaseye inenler puan alır
- **Kick Bot Mesajları**: Resmi Kick OAuth 2.1 PKCE ile sohbete puan bildirimi
- **Kick Emote Desteği**: `!drop [emote:id:isim]` ile özel Kick emote karakteri
- **Otomatik Ölçekleme**: Katılımcı sayısına göre oyuncu boyutu dinamik ayarlanır
- **60 Saniyelik Etkinlikler**: Her etkinlikte kullanıcı başına tek atlayış, süre bitince temizlenir

## Kurulum

```bash
npm install
```

`.env.example` dosyasını `.env` adıyla kopyalayın ve değerleri doldurun:

```bash
cp .env.example .env
```

### Gerekli Ortam Değişkenleri

| Değişken | Açıklama |
|---|---|
| `KICK_CHANNEL_SLUG` | Kick kanal adı (örn: `rellaria`) |
| `KICK_CLIENT_ID` | Kick Developer Portal'dan alınan Client ID |
| `KICK_CLIENT_SECRET` | Kick Developer Portal'dan alınan Client Secret |
| `KICK_BOT_TOKEN` | OAuth ile otomatik alınır, elle de girilebilir |
| `PUBLIC_BASE_URL` | Canlı URL (örn: `https://rellariaparachute.onrender.com`) |
| `PORT` | Sunucu portu (varsayılan: `3000`) |

## Çalıştırma

### Geliştirme

```bash
npm run dev
```

### Üretim

```bash
npm run build
npm start
```

## Kick Bot Yetkilendirmesi (OAuth 2.1 PKCE)

Bot'un Kick sohbetine mesaj yazabilmesi için yayıncının yetkilendirme yapması gerekir:

1. Tarayıcıda açın: `https://<sunucu-adresiniz>/auth/kick`
2. Kick izin ekranında **"Erişim İzni Ver"** butonuna tıklayın
3. Token otomatik olarak sunucuya kaydedilir

> **Not:** Sunucu her yeniden başladığında token kaybolur. Kalıcı olması için Render.com Environment'a `KICK_BOT_TOKEN` olarak kaydedin.

## OBS Ayarları

```text
URL: http://localhost:3000
Genişlik: 1920
Yükseklik: 1080
FPS: 60
```

## Komutlar

| Komut | Açıklama |
|---|---|
| `!drop` | Varsayılan 🙂 karakteriyle atla |
| `!atla` | `!drop` ile aynı (Türkçe alias) |
| `!drop 🦄` | Belirtilen emoji ile atla |
| `!drop [emote:id:isim]` | Kick emote ile atla |

## API Endpoint'leri

| Endpoint | Açıklama |
|---|---|
| `GET /health` | Sunucu ve Kick bağlantı durumu |
| `GET /api/info` | Uygulama bilgisi |
| `GET /api/reload` | Tüm OBS overlay'lerini uzaktan yenile |
| `GET /auth/kick` | OAuth 2.1 yetkilendirme başlat |
| `GET /auth/kick/callback` | OAuth callback (otomatik) |

## Test

```bash
npm test
npm run build
```

## Teknik Detaylar

- **Backend**: Node.js + Express + Socket.io + TypeScript
- **Frontend**: Phaser 4 (şeffaf canvas overlay)
- **Kick Bağlantısı**: Pusher WebSocket (`wss://ws-us2.pusher.com`) ile salt-okunur sohbet
- **Chat Bot**: Kick OAuth 2.1 PKCE + Resmi `api.kick.com/public/v1/chat` endpoint'i
- **Hosting**: Render.com (ücretsiz plan uyumlu)

## Lisans

MIT
