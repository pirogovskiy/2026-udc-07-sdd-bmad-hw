# Простежуваність: spec → code → tests (Task C)

**Специфікація:** `docs/spec/pricing-discounts.md`
**Реалізація:** `app/src/discounts.ts`
**Тести:** `app/src/discounts.test.ts`

## Таблиця

| AC | Що перевіряє | Де реалізовано (файл:символ) | Тест (назва) | Статус |
|---|---|---|---|---|
| AC-1 | Знижка за рівнем Gold від сирого підсумку, без промокодів | `discounts.ts:priceOrder` (розрахунок `tierDiscountKopecks`) | `AC-1: gold tier discount with no coupons` | ✅ |
| AC-2 | Рівень + один необмежений промокод застосовуються послідовно | `discounts.ts:priceOrder` (цикл по `eligible`, база = `remaining`) | `AC-2: silver tier plus one unrestricted percent coupon apply sequentially` | ✅ |
| AC-3 | Два промокоди на одну категорію — лише вигідніший | `discounts.ts:resolveCategoryConflicts` | `AC-3: two coupons on the same category — only the most beneficial applies` | ✅ |
| AC-4 | Прострочений промокод ігнорується мовчки | `discounts.ts:resolveEligibleCoupons` (перевірка `expiresAt`) | `AC-4: an expired coupon is silently ignored` | ✅ |
| AC-5 | Фіксований промокод більший за базу — зрізається, підсумок не йде в мінус | `discounts.ts:couponAmountKopecks` (зрізання до `base`) + `priceOrder` (`Math.min(..., remaining)`) | `AC-5 (граничний): a fixed coupon larger than the order is capped, goods total floors at 0` | ✅ |
| AC-6 | `minSubtotalKopecks` перевіряється проти сирого підсумку, а не залишку після знижки за рівнем | `discounts.ts:resolveEligibleCoupons` (`rawSubtotal < coupon.minSubtotalKopecks`) | `AC-6: minSubtotalKopecks eligibility is checked against the raw subtotal, not the post-tier balance` | ✅ |
| AC-7 | Промокод на категорію рахується від сирої суми лише цієї категорії | `discounts.ts:categorySubtotalKopecks` + `priceOrder` (вибір `base` для `coupon.category`) | `AC-7: a category-restricted coupon's base is only that category's raw subtotal` | ✅ |
| AC-8 (граничний) | Округлення: рівно пів копійки — вгору | `discounts.ts:roundHalfUp` | `AC-8 (граничний, округлення): exactly half a kopeck rounds up` | ✅ |
| AC-9 (граничний) | Порожнє замовлення — нульові знижки, нульова доставка, без винятку | `discounts.ts:priceOrder` (весь пайплайн на `items: []`) + `pricing.ts:shippingKopecks` (уже специфіковано, не змінено) | `AC-9 (граничний, порожнє замовлення): an item-less order yields zero discounts and zero shipping` | ✅ |
| AC-10 | Код промокоду, якого немає в каталозі (включно з розбіжністю лише в регістрі), — точне, чутливе до регістру зіставлення й мовчазна відмова | `discounts.ts:resolveEligibleCoupons` (`catalog.find((c) => c.code === code)` — точне порівняння рядків) | `AC-10: a coupon code missing from the catalog is silently ignored`; `AC-10: coupon code matching is exact and case-sensitive (catalog SAVE10, typed save10)` | ✅ |
| AC-11 | Той самий код, введений двічі, застосовується один раз | `discounts.ts:resolveEligibleCoupons` (`seen`-дедуплікація) | `AC-11: the same coupon code entered twice applies only once` | ✅ |

## Зворотна перевірка

- **Чи є в коді поведінка, якої немає в жодному AC?**
  Одне: `priceOrder` бере `Math.min(tierDiscountKopecks, remaining)` при
  обчисленні знижки за рівнем, хоча на цьому кроці `remaining === rawSubtotal`
  завжди (жодна знижка ще не застосована) — тобто цей `Math.min` математично
  ніколи не «зрізає» нічого і жоден AC не вимагає його окремо. Залишив як є:
  це не нова поведінка, а той самий захист «підсумок не йде в мінус» (D-7),
  застосований симетрично до обох видів знижки, а не спеціальний випадок
  лише для промокодів. Прибирати заради «рівно по AC» здалось би штучним.
- **Чи є AC без тесту?** Немає — усі AC-1..AC-11 мають тест у
  `discounts.test.ts`, названий за ID (AC-10 має два тести: базовий і на
  чутливість до регістру).
- **Чи є тест, який не мапиться на жоден AC?** Один: `regression: a
  fractional percent does not drift on a float boundary (...)` —
  доданий після рев'ю, коли знайшли, що `(base * value) / 100` могло
  давати 161 замість 162 через похибку double для `value = 16.15`
  (виправлено через ціле арифметичне обчислення в `percentOfKopecks`).
  Це не порушення D-4/AC-8 (правило округлення саме таке — пів копійки
  вгору), а регресійний тест на конкретний баг реалізації цього правила;
  залишив без AC-номера, бо це не нова вимога специфікації, а гарантія,
  що реалізація не відступає від уже прийнятого D-4.

## Що з цього вийшло

Зворотна перевірка не знайшла жодного пропущеного AC — розбіжність зі спекою
обмежилась одним рядком кода (захисний `Math.min` для знижки за рівнем), і
він логічно випливає з уже прийнятого рішення D-7, а не є новою
неспецифікованою поведінкою. Це говорить про те, що специфікація (Task A)
вже була достатньо повною до початку кодування — жодного разу не довелося
повертатись і дописувати AC після того, як код показав прогалину.

Окремо, зовнішнє код-рев'ю (не сама зворотна перевірка) знайшло реальний
дефект реалізації D-4: `(base * value) / 100` для дробового відсотка
(`value = 16.15`) могло впертись у похибку double й округлити 161.5 у
161 замість 162 — правило округлення (D-4) було правильне, а от код його
реалізовував нестабільно. Виправлено через ціле арифметичне обчислення
(`percentOfKopecks`, BigInt) і закріплено регресійним тестом без AC-номера
(див. зворотну перевірку вище). `cd app && npm test` — 21/21 зелені
(8 наявних + 13 нових: 11 за AC, один додатковий тест на AC-10, і один
регресійний), `npm run typecheck` — чисто.
