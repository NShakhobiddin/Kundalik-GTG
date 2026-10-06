# Ish daftari — Telegram Mini App

GlobalTrainings «Shaxsiy rivojlanish tizimi» kursi ishtirokchisining ish daftari (32 dars, 10 bo'lim, 54 ta ish kartasi) — Telegram ichida ochiladigan interaktiv ko'rinishda.

## Imkoniyatlar

- **54 ta karta** — har bir savol, jadval, belgilash ro'yxati va formula to'ldiriladigan maydonga aylantirilgan.
- **Avtomatik saqlash** — Telegram ichida javoblar **Telegram CloudStorage**'ga yoziladi (boshqa qurilmada ham ochiladi), qo'shimcha ravishda qurilmada ham saqlanadi.
- **Kirill / Lotin** — yuqoridagi «Кир / Lot» tugmasi bilan butun daftar yozuvini almashtirish.
- **Progress** — har bir karta va bo'lim bo'yicha to'ldirilganlik, «Kartani yakunladim» belgisi.
- **«Qayerdan boshlash?»** — vaziyatga qarab bo'limni tanlash yo'l ko'rsatkichi.
- **Qidiruv** — kirill yoki lotinda yozsa ham kartalar, savollar va o'z javoblaringiz bo'yicha.
- **Ulashish va eksport** — kartani yoki butun daftarni matn qilib nusxalash / chatga yuborish, zaxira kodi orqali tiklash.
- Telegram mavzusiga moslashadi (yorug' / qorong'i), native «Orqaga» tugmasi, vibratsiya.

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `index.html` | Sahifa skeleti |
| `style.css` | Dizayn (daftar ranglari: #254C3B yashil, #C99A5B oltin) |
| `data.js` | Daftar mazmuni — barcha bo'limlar va kartalar |
| `app.js` | Ilova mantiqi: navigatsiya, saqlash, Telegram integratsiyasi |

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

## Mazmunni tahrirlash

Matnlar `data.js` faylida. Savol qo'shish uchun kartaning `b` ro'yxati **oxiriga** yangi qator qo'shing — javoblar maydon tartib raqami bo'yicha saqlanadi, shuning uchun mavjud bloklar tartibini o'zgartirmang.
