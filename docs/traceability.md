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
| AC-10 | Код промокоду, якого немає в каталозі, — мовчазна відмова | `discounts.ts:resolveEligibleCoupons` (`catalog.find` не знаходить) | `AC-10: a coupon code missing from the catalog is silently ignored` | ✅ |
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
  `discounts.test.ts`, названий за ID.
- **Чи є тест, який не мапиться на жоден AC?** Немає — кожен `it(...)` у
  `discounts.test.ts` названий за конкретним AC-N з `docs/spec/pricing-discounts.md`.

## Що з цього вийшло

Зворотна перевірка не знайшла жодного пропущеного AC чи «зайвого» тесту —
розбіжність, яку вона виявила, обмежилась одним рядком кода (захисний
`Math.min` для знижки за рівнем), і він логічно випливає з уже прийнятого
рішення D-7, а не є новою неспецифікованою поведінкою. Це говорить про те,
що специфікація (Task A) вже була достатньо повною до початку кодування —
жодного разу не довелося повертатись і дописувати AC після того, як код
показав прогалину. `cd app && npm test` — 19/19 зелені (8 наявних +
11 нових за AC), `npm run typecheck` — чисто.
