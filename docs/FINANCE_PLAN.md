# Chayxana POS — Moliya Moduli Rejasi

Bu hujjat Chayxana POS uchun moliya hisobini aniq, izchil va tekshiriladigan tarzda yuritish qoidalarini belgilaydi.

Bu hozircha implementatsiya emas. Bu hujjat keyingi schema, API, backend va UI ishlari uchun manba bo'ladi.

Aniq schema, endpoint va formula darajasidagi spetsifikatsiya [FINANCE_IMPLEMENTATION_SPEC.md](./FINANCE_IMPLEMENTATION_SPEC.md) faylida yozilgan.

## 1. Maqsad

Tizim quyidagilarni aniq hisoblay olishi kerak:

1. Jami savdo
2. Chegirmalar
3. Sof savdo
4. Qarzga berilgan savdo
5. Kunlik chiqimlar
6. Qarz qaytimi
7. Savdo bo'yicha foyda
8. Pul oqimi bo'yicha kun natijasi

Tizimdagi moliyaviy raqamlar keyin jimgina o'zgartirilmasligi kerak. Xato yozuvlar alohida tuzatish yozuvi bilan yopiladi.

## 2. Asosiy tamoyillar

### 2.1. Rost hisob

Tizim bitta son bilan hamma narsani aralashtirmaydi.

Quyidagi tushunchalar alohida yuritiladi:

1. Savdo bo'ldi
2. Pul tushdi
3. Qarz ochildi
4. Qarz qaytdi
5. Chiqim qilindi

### 2.2. O'zgartirib bo'lmaydigan moliyaviy yozuv

Saqlangan moliyaviy yozuv:

1. oddiy `edit` qilinmaydi
2. oddiy `delete` qilinmaydi
3. faqat yangi qarshi yozuv bilan bekor qilinadi

Bu ayniqsa quyidagilar uchun majburiy:

1. chiqim
2. qarz
3. qarz qaytimi
4. yakunlangan to'lov

### 2.3. Xizmat haqi

`Xizmat haqi` restoran foydasi emas. U alohida ko'rsatiladi va foyda hisobiga qo'shilmaydi.

### 2.4. Float ishlatilmaydi

Hisob-kitobda `float` yoki oddiy kasrli `number` ga suyanilmaydi. Summalar ichkarida aniq pul qiymati sifatida yuritiladi.

## 3. Maxfiylik va ruxsatlar

### 3.1. Admin

`ADMIN` quyidagilarni qila oladi:

1. chiqim kiritish
2. qarzga savdo rasmiylashtirish
3. qarz qaytimini kiritish
4. qarzlar ro'yxatini ko'rish
5. faqat operatsion moliya ro'yxatlarini ko'rish

`ADMIN` quyidagilarni ko'rmaydi:

1. to'liq foyda hisoboti
2. to'liq kunlik moliyaviy yakun
3. owner uchun yuboriladigan to'liq hisobot

### 3.2. Owner

`OWNER` quyidagilarni ko'radi:

1. barcha chiqimlar
2. barcha qarzlar
3. barcha qarz qaytimlari
4. savdo hisobotlari
5. foyda hisobotlari
6. Telegram orqali avtomatik kunlik hisobot

### 3.3. Telegram

Telegram hisobot faqat `OWNER` ga yuboriladi.

## 4. Moliya voqealari

Tizim moliyani voqealar sifatida yuritadi. Asosiy voqealar:

1. buyurtma yopildi
2. to'lov olindi
3. to'lovning bir qismi qarzga yozildi
4. chiqim qilindi
5. qarz qaytdi
6. xato moliyaviy yozuv reversal bilan yopildi

## 5. To'lov algoritmi

Buyurtma yopilganda quyidagi to'lov turlari bo'lishi mumkin:

1. `CASH`
2. `CARD`
3. `DEBT`

Qoidalar:

1. `cash + card + debt = order.totalSnapshot`
2. aralash to'lov mumkin
3. `debt > 0` bo'lsa, alohida qarz yozuvi ochiladi

Misol:

1. Buyurtma jami: `200 000`
2. Naqd: `50 000`
3. Qarz: `150 000`

Natija:

1. buyurtma yopiladi
2. `50 000` real tushum hisoblanadi
3. `150 000` qarz sifatida alohida yoziladi

## 6. Qarz modeli

### 6.1. Qarz yozuvi

Har bir qarz quyidagilarni saqlaydi:

1. qaysi buyurtmadan chiqqani
2. qarzdor nomi yoki izohi
3. asl qarz summasi
4. qolgan qarz summasi
5. qarz ochilgan sana-vaqt
6. holati: `OPEN | PARTIAL | PAID`
7. kim rasmiylashtirgani
8. izoh

### 6.2. Qarz qaytimi

Qarz qaytganda alohida yozuv yaratiladi:

1. qaysi qarzga tegishli
2. qancha qaytgan
3. qaysi usulda qaytgan: `CASH | CARD`
4. qachon qaytgan
5. kim qabul qilgan
6. izoh

Qoidalar:

1. qarz qaytishi eski buyurtma summasini o'zgartirmaydi
2. qarz qaytishi yangi moliyaviy voqea hisoblanadi
3. `remainingAmount = 0` bo'lsa qarz `PAID` bo'ladi

## 7. Chiqim modeli

Har bir chiqim yozuvida quyidagilar bo'lishi shart:

1. chiqim turi
2. chiqim sababi
3. summa
4. sana-vaqt
5. kim kiritgani
6. izoh
7. holat

Majburiy kategoriya misollari:

1. Go'sht
2. Sabzavot
3. Ichimlik
4. Transport
5. Xo'jalik
6. Ishchilar oyligi
7. Avans
8. Boshqa

### 7.1. Chiqimni tuzatish

Saqlangan chiqim keyin to'g'ridan-to'g'ri tahrirlanmaydi.

Xato bo'lsa:

1. eski yozuv saqlanib qoladi
2. unga bog'langan yangi `reversal` yoki `correction` yozuvi yaratiladi
3. audit log'da kim va qachon tuzatganligi qoladi

Bu qoida moliya ishonchliligi uchun majburiy.

## 8. Hisobotlarda ishlatiladigan aniqlamalar

### 8.1. Brutto savdo

Shu kuni sotilgan buyurtmalar subtotal yig'indisi.

### 8.2. Chegirmalar

Shu kuni berilgan chegirmalar jami.

### 8.3. Sof savdo

`Brutto savdo - chegirmalar`

### 8.4. Qarzga savdo

Shu kuni yopilgan buyurtmalarda `DEBT` sifatida yozilgan summa.

### 8.5. Shu kuni real tushgan pul

Shu kuni buyurtma yopilganda real olingan:

1. naqd
2. karta

Bu yerga `DEBT` kirmaydi.

### 8.6. Eski qarzdan bugun qaytgan pul

Bugun kelib to'langan qarz summasi.

Bu bugungi savdo emas, bugungi pul oqimi.

### 8.7. Kunlik chiqimlar

`occurredAt` shu kunga tushgan chiqimlar yig'indisi.

### 8.8. Savdo bo'yicha foyda

`Sof savdo - shu kundagi chiqimlar`

Bu ko'rsatkich savdo qilingan kun bo'yicha foyda tasavvurini beradi.

### 8.9. Pul oqimi bo'yicha kun natijasi

`(shu kuni real tushgan pul + shu kuni qaytgan eski qarz) - shu kundagi chiqimlar`

Bu ko'rsatkich kassaga va bankka real kirib-chiqqan pulni ko'rsatadi.

## 9. Qarz qaytgandagi eng muhim qoida

Bu moduldagi eng nozik masala shu.

Siz talab qilgan operatsion mantiq:

1. qarz qaysi buyurtmadan chiqqan bo'lsa, o'sha buyurtma keyin `to'langan` deb ko'rinishi kerak
2. eski kun yozuvida ham qarz holati keyin `to'landi` deb aks etishi mumkin

Lekin rost moliya hisobi uchun yana bitta qatlam majburiy:

1. pul qaysi kuni real kelgan bo'lsa, o'sha kunning pul oqimida ko'rinadi
2. u bugungi yangi savdo sifatida ko'rinmaydi

Shuning uchun tizim 2 xil ko'rinishni yuritadi:

1. `Savdo registri`
2. `Pul oqimi registri`

### 9.1. Savdo registri

Savdo registrida:

1. buyurtma qaysi kuni sotilgan bo'lsa o'sha kunda turadi
2. qarz ochilgan summasi ko'rinadi
3. keyin qaytganda `to'langan` holatiga o'tadi

### 9.2. Pul oqimi registri

Pul oqimi registrida:

1. qarz qaytgan sana bo'yicha pul tushumi yoziladi
2. bu tushum bugungi kunga tegishli bo'ladi
3. u eski savdo sanasiga ko'chirib yuborilmaydi

Bu ikki qatlam alohida yuritilmasa, hisobot noto'g'ri bo'ladi.

## 10. Kunlik hisobot algoritmi

Kunlik hisobotda kamida quyidagi bloklar bo'ladi:

### 10.1. Savdo bloki

1. Brutto savdo
2. Chegirmalar
3. Sof savdo
4. Qarzga savdo
5. Xizmat haqi
6. Bekor qilingan buyurtmalar
7. To'lovsiz ketgan buyurtmalar

### 10.2. Pul bloki

1. Shu kuni naqd tushum
2. Shu kuni karta tushum
3. Shu kuni qaytgan qarzlar
4. Jami real tushgan pul

### 10.3. Chiqim bloki

1. Kunlik chiqimlar jami
2. Chiqimlar kategoriya bo'yicha
3. Ishchilar oyligi alohida satrda

### 10.4. Yakuniy natija bloki

1. Savdo bo'yicha foyda
2. Pul oqimi bo'yicha kun natijasi

## 11. Oylik hisobot algoritmi

Oylik hisobot quyidagilarni beradi:

1. oylik brutto savdo
2. oylik chegirmalar
3. oylik sof savdo
4. oylik qarzga savdo
5. oylik qaytgan qarzlar
6. oylik chiqimlar
7. oylik savdo bo'yicha foyda
8. oylik pul oqimi natijasi
9. kunma-kun kesim

## 12. Owner uchun Telegram hisobot

Telegram hisobot faqat `OWNER` ga avtomatik yuboriladi.

Unda kamida quyidagilar bo'ladi:

1. sana
2. yopilgan buyurtmalar soni
3. brutto savdo
4. chegirmalar
5. sof savdo
6. qarzga savdo
7. shu kuni real tushgan pul
8. bugun qaytgan eski qarzlar
9. kunlik chiqimlar
10. savdo bo'yicha foyda
11. pul oqimi bo'yicha kun natijasi
12. xizmat haqi
13. bekor qilinganlar
14. to'lovsiz ketganlar

## 13. Audit qoidalari

Audit log'da kamida quyidagilar yozilishi kerak:

1. `EXPENSE_CREATED`
2. `EXPENSE_REVERSED`
3. `DEBT_CREATED`
4. `DEBT_PAYMENT_RECORDED`
5. `DEBT_CLOSED`
6. `REPORT_SENT`
7. `REPORT_SEND_FAILED`

## 14. Taqiqlanadigan amallar

Quyidagilarni modul ruxsat bermasligi kerak:

1. saqlangan chiqimni jimgina o'zgartirish
2. saqlangan chiqimni izsiz o'chirish
3. qarz summasini keyin izsiz kamaytirish yoki oshirish
4. qarz qaytimi sanasini yashirincha orqaga surish
5. bugun qaytgan qarzni bugungi savdo deb ko'rsatish
6. xizmat haqini restoran foydasiga qo'shish

## 15. Keyingi implementatsiya bosqichlari

Keyingi ishlar quyidagi tartibda qilinadi:

1. locked qarorlarni yangilash
2. schema dizayni
3. API contract dizayni
4. repository va service qatlami
5. audit log kengaytirish
6. admin uchun chiqim va qarz ekranlari
7. owner uchun to'liq moliyaviy hisobot
8. Telegram yuborish
9. verification senariylari

## 16. Yakuniy qaror

Bu modulda bitta umumiy son bilan "foyda" deb yolg'on soddalashtirish qilinmaydi.

Tizim quyidagi ikki haqiqatni alohida saqlaydi:

1. `Savdo bo'yicha foyda`
2. `Pul oqimi bo'yicha kun natijasi`

Shu yondashuv modulni aniq, tekshiriladigan va keyinchalik audit qilinadigan holatda ushlab turadi.
