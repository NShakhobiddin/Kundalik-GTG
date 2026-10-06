# Ish daftari — Telegram Mini App

GlobalTrainings «Shaxsiy rivojlanish tizimi» kursi ishtirokchisining ish daftari (32 dars, 10 bo'lim, 54 ta ish kartasi) — Telegram ichida ochiladigan interaktiv ko'rinishda.

## Imkoniyatlar

- **54 ta karta** — har bir savol, jadval, belgilash ro'yxati va formula to'ldiriladigan maydonga aylantirilgan.
- **Avtomatik saqlash** — Telegram ichida javoblar **Telegram CloudStorage**'ga yoziladi (boshqa qurilmada ham ochiladi), qo'shimcha ravishda qurilmada ham saqlanadi.
- **Lotin va Kirill** — birinchi ochilishda yozuv tanlanadi (standart: Lotin). Keyin yuqoridagi tugma yoki *Sozlamalar* orqali bir bosishda almashtiriladi. Tanlov Telegram bulutida saqlanadi.
- **Ilova kabi** — pastki menyu (Asosiy, Bo'limlar, Qidirish, Qaydlar, Sozlamalar), sahifalar orasida silliq o'tishlar, orqaga qaytganda ro'yxatdagi joy saqlanadi, yozayotganda menyu yashirinadi.
- **To'liq ekran** — Telegram (Android/iOS, Bot API 8.0+) ichida ochilganda butun ekranni egallaydi; Sozlamalarda o'chirib qo'yish mumkin. «Bosh ekranga qo'shish» tugmasi orqali telefon ekraniga ikonka sifatida qo'yiladi.
- **Oflayn** — bir marta ochilgandan keyin internetsiz ham ishlaydi (service worker). Brauzerda PWA sifatida o'rnatish mumkin.
- **Progress** — har bir karta va bo'lim bo'yicha to'ldirilganlik, «Kartani yakunladim» belgisi.
- **«Qayerdan boshlash?»** — vaziyatga qarab bo'limni tanlash yo'l ko'rsatkichi.
- **Qidiruv** — kirill yoki lotinda yozsa ham kartalar, savollar va o'z javoblaringiz bo'yicha.
- **PDF** — to'ldirilgan javoblarni chiroyli A4 PDF qilib saqlash: muqova (ism, sana, progress), bo'limlar, jadvallar, belgilangan bandlar, sahifa raqamlari. Butun daftar (Asosiy sahifa yoki Sozlamalar) yoki bitta karta (karta ostidagi «PDF» tugmasi). Faqat to'ldirilgan joylar kiradi.
- **Ulashish va eksport** — kartani yoki butun daftarni matn qilib nusxalash / chatga yuborish, zaxira kodi orqali tiklash.
- Telegram mavzusiga moslashadi (yorug' / qorong'i), native «Orqaga» tugmasi, vibratsiya.

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `index.html` | Sahifa skeleti |
| `style.css` | Dizayn (daftar ranglari: #254C3B yashil, #C99A5B oltin) |
| `data.js` | Daftar mazmuni — barcha bo'limlar va kartalar |
| `app.js` | Ilova mantiqi: navigatsiya, saqlash, Telegram integratsiyasi |
| `pdf.js` | PDF yaratish va yetkazish |
| `vendor/` | pdfmake kutubxonasi va Roboto shrifti (faqat PDF bosilganda yuklanadi) |
| `config.js` | Ixtiyoriy sozlama: PDF'ni bot orqali chatga yuborish manzili |
| `worker/pdf-bot.js` | Ixtiyoriy server (Cloudflare Worker) — PDF'ni chatga yuboradi |
| `sw.js`, `manifest.webmanifest`, `icons/` | Oflayn ishlash va ilova sifatida o'rnatish |

Hech qanday build kerak emas — oddiy statik fayllar.

## Ishga tushirish

### 1. Saytga joylash (GitHub Pages)

1. GitHub'da repo → **Settings → Pages**.
2. **Source**: «Deploy from a branch», branch sifatida shu fayllar turgan branchni tanlang, papka `/ (root)`.
3. Bir necha daqiqadan so'ng manzil chiqadi, masalan `https://<user>.github.io/Kundalik-GTG/`.

(Istalgan HTTPS hostingga ham — Netlify, Vercel, o'z serveringiz — shunchaki fayllarni yuklash kifoya.)

### 2. Telegram botga ulash

[@BotFather](https://t.me/BotFather)'da:

- **Menyu tugmasi:** `/mybots` → botni tanlang → *Bot Settings → Menu Button* → yuqoridagi URL'ni kiriting.
- **Yoki Mini App sifatida:** `/newapp` → botni tanlang → nom, tavsif, rasm → URL → qisqa nom (masalan `daftar`). Shunda havola: `https://t.me/<bot>/daftar`.

Muayyan kartani to'g'ridan-to'g'ri ochish: `https://t.me/<bot>/daftar?startapp=c12` (12-karta) yoki `?startapp=s3` (III bo'lim).

Yozuvni havolada belgilash: `?startapp=lat` yoki `?startapp=cyr`, kartaga birga: `?startapp=lat_c12`. Brauzerda: `.../Kundalik-GTG/?lat` yoki `?cyr`.

> To'liq ekran rejimi BotFather'dagi Mini App sozlamasiga ham bog'liq: `/mybots` → bot → *Bot Settings → Configure Mini App → Enable Fullscreen* (mavjud bo'lsa) ni yoqing.

## PDF qanday yetkaziladi

PDF har doim telefonning o'zida yaratiladi. Telegram ilovalari Mini App ichidan faylni to'g'ridan-to'g'ri yuklab olishga har doim ham ruxsat bermaydi, shuning uchun:

1. **Bot orqali chatga** (eng qulay, ixtiyoriy) — `config.js`'da `pdfApi` berilgan bo'lsa, PDF botdan foydalanuvchiga hujjat sifatida keladi. Sozlash: `worker/pdf-bot.js` faylining boshidagi yo'riqnoma (Cloudflare Workers, bepul tarif yetadi; `BOT_TOKEN` secret sifatida). Foydalanuvchi botga avval `/start` bosgan bo'lishi kerak.
2. **iPhone** — telefonning «Ulashish» oynasi ochiladi: «Fayllarga saqlash» yoki istalgan chatga yuborish.
3. **Brauzer / Telegram Desktop** — fayl darhol yuklab olinadi.
4. **Android (botsiz)** — «Brauzerda ochib yuklab olish» tugmasi: javoblar havolaning `#` qismiga siqib joylanadi (serverga bormaydi), brauzerda PDF yaratilib «Downloads»ga saqlanadi.

## Mazmunni tahrirlash

Matnlar `data.js` faylida. Savol qo'shish uchun kartaning `b` ro'yxati **oxiriga** yangi qator qo'shing — javoblar maydon tartib raqami bo'yicha saqlanadi, shuning uchun mavjud bloklar tartibini o'zgartirmang.
