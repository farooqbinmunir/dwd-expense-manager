# Import report — 2026-11-09T20:01:33.645Z

- Mode: **import**
- Source: https://docs.google.com/spreadsheets/d/e/2PACX-1vT4mUtPHMK1oWXl7l5PNPUvSwxktl2oavqDDiqNwi6Bn3fK50gJNRf3Y-I2uaMW2nWwpWrRxrXACwl2/pubhtml
- Source type: `sheet_import`
- Snapshot of downloaded files: `import-reports/snapshots/2026-11-09T20-01-13-154Z/`

## Summary

| Item | Count |
|---|---|
| Data rows parsed as transactions | 111 |
| Newly imported | 111 |
| Already imported earlier (skipped, no duplicate) | 0 |
| Changed in sheet since import (NOT overwritten) | 0 |
| Same content as another imported row (skipped) | 0 |
| Problem rows NOT imported (need manual fix) | 0 |
| Non-data rows skipped (titles, header, blank, footer) | 18 |
| Embedded receipt images found | 79 |
| Receipt images imported now | 79 |
| Receipt images already imported | 0 |
| Receipt images failed | 0 |
| Receipt images with no transaction on their row | 0 |

## Reconciliation

**Parsed rows vs the sheet's Summary tab**

| Check | Expected (sheet) | Actual | Result |
|---|---|---|---|
| Total received | PKR 296,500 | PKR 296,500 | ✅ match |
| Total spent | PKR 292,500 | PKR 292,500 | ✅ match |
| Remaining balance | PKR 4,000 | PKR 4,000 | ✅ match |
| Transaction count | – | 111 | |

Sheet footer "Remaining Total": PKR 4,000 — ✅ matches parsed balance.

**Database contents (this source) vs the sheet**

| Check | Expected (sheet) | Actual | Result |
|---|---|---|---|
| Total received | PKR 296,500 | PKR 296,500 | ✅ match |
| Total spent | PKR 292,500 | PKR 292,500 | ✅ match |
| Remaining balance | PKR 4,000 | PKR 4,000 | ✅ match |
| Transaction count | – | 111 | |

## Problem rows (not imported)

None.

## Imported with incomplete source data (imported as-is, nothing invented)

| Row | Date | Amount | Description | Issues |
|---|---|---|---|---|
| 18 | 2026-10-15 | -PKR 400 | Ghora pori 2 (4ft) for ceiling and electrician 2 days bill (100 each per day) | No 'Paid to' in sheet |
| 21 | 2026-10-17 | -PKR 100 | Motor rabber 8tha (2 (50 each)) | Date 2026-10-17 is earlier than the row above (2026-10-18); kept as written |
| 29 | 2026-10-23 | PKR 50,000 | For floor chips material | Payment method recorded as "20k cash + 30k bank" |
| 31 | 2026-10-23 | -PKR 60,100 | Bill payment of all material for Floor chips | Payment method recorded as "39300 Online + 20800 cash" |
| 34 | 2026-10-24 | PKR 9,000 | Labor for floor chips - balance | No payment method in sheet; No 'Paid by' in sheet; No 'Paid to' in sheet |
| 38 | 2026-10-24 | -PKR 530 | Khana floor mistri labor | No payment method in sheet; No 'Paid to' in sheet |
| 39 | 2026-10-24 | -PKR 420 | Chaiye (Tea) | No payment method in sheet; No 'Paid to' in sheet |
| 41 | 2026-10-24 | -PKR 1,500 | Floor chips mazdoor | No 'Paid to' in sheet |
| 42 | 2026-10-25 | -PKR 1,400 | Office indoor(Basket, Aishtray, Mobile stands, Garbage bags) | No 'Paid to' in sheet |
| 43 | 2026-10-25 | -PKR 6,520 | _(blank)_ | No description in sheet; No payment method in sheet; No 'Paid to' in sheet |
| 44 | 2026-10-25 | -PKR 200 | Chaiye morning(3) | No 'Paid to' in sheet |
| 45 | 2026-10-25 | -PKR 450 | Lunch khana(Gosht 300 and roti 150) | No 'Paid to' in sheet |
| 46 | 2026-10-25 | -PKR 300 | Chaye after lunch (5) | No 'Paid to' in sheet |
| 47 | 2026-10-25 | -PKR 70 | Aari blade | No 'Paid to' in sheet |
| 58 | 2026-10-28 | -PKR 510 | Khana + chaye labor | No payment method in sheet; No 'Paid to' in sheet |
| 59 | 2026-10-29 | PKR 4,000 | Incoming balance for chips shortage | No 'Paid to' in sheet |
| 60 | 2026-10-29 | PKR 1,000 | Incoming balance for chips colour shortage | No 'Paid to' in sheet |
| 61 | 2026-10-29 | -PKR 3,600 | Chips 20 bori *180 | No 'Paid to' in sheet |
| 62 | 2026-10-29 | -PKR 900 | Chips color 2kg | No 'Paid to' in sheet |

Merged cells expanded (value shared with the row above in the sheet): 23 ranges; rows affected: 4 (date A3:A4); 6 (date A5:A7); 7 (date A5:A7); 20 (date A19:A20); 25 (date A24:A26); 26 (date A24:A26); 28 (date A27:A28); 30 (date A29:A32, purpose C29:C30); 31 (date A29:A32); 32 (date A29:A32); 34 (date A33:A39); 35 (date A33:A39); 36 (date A33:A39); 37 (date A33:A39); 38 (date A33:A39); 39 (date A33:A39); 43 (date A42:A50); 44 (date A42:A50); 45 (date A42:A50); 46 (date A42:A50); 47 (date A42:A50); 48 (date A42:A50); 49 (date A42:A50); 50 (date A42:A50); 52 (date A51:A53); 53 (date A51:A53); 95 (date A94:A95, purpose C94:C95, payment_method D94:D95, paid_by E94:E95, paid_to F94:F95); 97 (date A96:A97, purpose C96:C97, payment_method D96:D97, paid_by E96:E97, paid_to F96:F97).

Rows whose blank date was carried down from the row above: 9, 14, 16, 17, 18, 40, 41, 99.

## Category suggestions

The sheet has no category column. Categories below were suggested from each description by fixed keyword rules and are flagged *auto* in the app so they can be reviewed. Rows that matched no rule are left **Uncategorised**.

| Row | Type | Amount | Description | Paid to | Category |
|---|---|---|---|---|---|
| 3 | in | PKR 25,000 | Ceiling | Farooq | Funds Received |
| 4 | out | PKR 3,500 | Advance for Ceiling | Uniq Interior | Ceiling |
| 5 | out | PKR 19,250 | Ceiling remaining bill paid | Uniq Interior | Ceiling |
| 6 | out | PKR 330 | New measurement 2ft increase + 10 holes' 200 | Uniq Interior labour | Ceiling |
| 7 | out | PKR 320 | Labour lunch (khana + chaye) | Uniq Interior labour | Food & Refreshments |
| 8 | in | PKR 25,000 | For electric materials and wall colour materials, and mistri work | Farooq | Funds Received |
| 9 | out | PKR 8,620 | Electric equipments(Sub-meter, lights, wire etc) | Fancy Electric and hardware | Electrical |
| 10 | out | PKR 300 | Extra T payment for ceiling gallery area to cover | Uniq Interior labour | Ceiling |
| 11 | out | PKR 1,650 | Cement 1 bag/bori | Muhammad Naem(Cement wala/vendor) | Construction Materials |
| 12 | out | PKR 100 | Wire cover dabi 1 length | Fancy Electric and hardware | Electrical |
| 13 | out | PKR 12,440 | Colour material(White cement, Distamber etc) | Talha paint house | Paint & Colour |
| 14 | in | PKR 10,000 | Electrician labour and additional colour materials like distamber and glue 2kg etc | Farooq | Funds Received |
| 15 | out | PKR 4,000 | Electrician labour | Shakeel Electrician | Electrical |
| 16 | out | PKR 2,850 | Distamber 1 balti Aishwhite and 2kg glue | Talha paint house | Paint & Colour |
| 17 | out | PKR 3,000 | 1st quarter of total amount of colour labour | Zubair Billa - Rang saaz | Paint & Colour |
| 18 | out | PKR 400 | Ghora pori 2 (4ft) for ceiling and electrician 2 days bill (100 each per day) |  | Tools & Equipment Rental |
| 19 | in | PKR 10,000 | Colour man labour | Farooq | Funds Received |
| 20 | out | PKR 3,000 | 2nd quarter of total amount of colour labour | Zubair Billa - Rang Saaz | Paint & Colour |
| 21 | out | PKR 100 | Motor rabber 8tha (2 (50 each)) | Qari Santary store | Plumbing & Sanitary |
| 22 | out | PKR 4,000 | Filling 2 gallon small, 1 quarter brown color, kerosene oil, brushes | Talha paint house | Paint & Colour |
| 23 | out | PKR 4,000 | 3rd payment of Colour labor | Zubair Billa | Paint & Colour |
| 24 | in | PKR 16,000 | Received for carpet | Farooq | Funds Received |
| 25 | out | PKR 13,500 | Carpet payment | Carpet vendor | Furnishing & Fittings |
| 26 | out | PKR 2,000 | Dinner | Tikka vendor | Food & Refreshments |
| 27 | out | PKR 2,400 | 8 packets Glue lightweight for mixing in white cement for outside colour | White cement vendor | Paint & Colour |
| 28 | out | PKR 100 | Pest control chemical for deemak | Shop hardware | Other |
| 29 | in | PKR 50,000 | For floor chips material | Farooq | Funds Received |
| 30 | in | PKR 25,000 | For floor chips material | Farooq | Funds Received |
| 31 | out | PKR 60,100 | Bill payment of all material for Floor chips | Haji building material jalo more | Floor Chips |
| 32 | out | PKR 200 | Bottle to Building material loader/unloader labor/driver | Shop | Food & Refreshments |
| 33 | out | PKR 950 | Ghora pori return, 9.5 days(100 per day) | Building materials rental services | Tools & Equipment Rental |
| 34 | in | PKR 9,000 | Labor for floor chips - balance |  | Funds Received |
| 35 | out | PKR 4,000 | Paid to Abdulreman for Rickshaw repair | Abdulreman | Transport & Fuel |
| 36 | out | PKR 2,000 | Colour labor | Billa Zubair | Paint & Colour |
| 37 | out | PKR 400 | Petrol for Pest control | Petrol pump | Transport & Fuel |
| 38 | out | PKR 530 | Khana floor mistri labor |  | Food & Refreshments |
| 39 | out | PKR 420 | Chaiye (Tea) |  | Food & Refreshments |
| 40 | out | PKR 2,500 | Floor chips mistri | M Amjad Mistri | Floor Chips |
| 41 | out | PKR 1,500 | Floor chips mazdoor |  | Floor Chips |
| 42 | out | PKR 1,400 | Office indoor(Basket, Aishtray, Mobile stands, Garbage bags) |  | Furnishing & Fittings |
| 43 | out | PKR 6,520 | _(blank)_ |  | **Uncategorised** |
| 44 | out | PKR 200 | Chaiye morning(3) |  | Food & Refreshments |
| 45 | out | PKR 450 | Lunch khana(Gosht 300 and roti 150) |  | Food & Refreshments |
| 46 | out | PKR 300 | Chaye after lunch (5) |  | Food & Refreshments |
| 47 | out | PKR 70 | Aari blade |  | Tools & Equipment Rental |
| 48 | in | PKR 10,000 | Balance added for Office indoors | Farooq | Funds Received |
| 49 | out | PKR 2,500 | Labor Mistri | Mistri | Labour |
| 50 | out | PKR 1,500 | Labor Mazdoor | Mazdoor | Labour |
| 51 | out | PKR 320 | Khana + chaye labor | Vendor | Food & Refreshments |
| 52 | out | PKR 2,500 | Labor mistri | Mistri | Labour |
| 53 | out | PKR 1,500 | Labor Mazdoor | Mazdoor | Labour |
| 54 | out | PKR 4,400 | Cement 2 bori + black colour 2kg | Hafiz building material store | Construction Materials |
| 55 | in | PKR 5,000 | Balance added for labor | Farooq | Funds Received |
| 56 | out | PKR 2,500 | Labor mistri | Mistri | Labour |
| 57 | out | PKR 1,500 | Labor Mazdoor | Mazdoor | Labour |
| 58 | out | PKR 510 | Khana + chaye labor |  | Food & Refreshments |
| 59 | in | PKR 4,000 | Incoming balance for chips shortage |  | Funds Received |
| 60 | in | PKR 1,000 | Incoming balance for chips colour shortage |  | Funds Received |
| 61 | out | PKR 3,600 | Chips 20 bori *180 |  | Floor Chips |
| 62 | out | PKR 900 | Chips color 2kg |  | Floor Chips |
| 63 | out | PKR 340 | Bottle and Chaye | Shop | Food & Refreshments |
| 64 | in | PKR 2,000 | Incoming balance for labor | Farooq | Funds Received |
| 65 | in | PKR 3,400 | Return 2 bori cement | Farooq | Refunds & Returns |
| 66 | in | PKR 1,200 | Return chips 7 bori, received 1260, paid 60 for unloading labor | Farooq | Refunds & Returns |
| 67 | out | PKR 2,000 | Labor mistri and mazdoor | Floor Labor | Labour |
| 68 | out | PKR 1,740 | Khana at office with office friends(Tikkah and bottle) | Tikka shop | Food & Refreshments |
| 69 | out | PKR 1,400 | Returned rental building materials(Karahi, Belcha, Drum) | Building material rent service | Tools & Equipment Rental |
| 70 | out | PKR 200 | Lota | Shop | Furnishing & Fittings |
| 71 | out | PKR 300 | Tea spoon | Shop | Furnishing & Fittings |
| 72 | in | PKR 10,000 | Incoming balance for Curtains | Farooq | Funds Received |
| 73 | out | PKR 8,000 | Curtains payment | Curtain vendor | Furnishing & Fittings |
| 74 | out | PKR 1,080 | Curtains handle/rod material | Fancy electric and hardware store | Furnishing & Fittings |
| 75 | out | PKR 500 | Curtains settlment labor | Electrician | Furnishing & Fittings |
| 76 | in | PKR 15,000 | Incoming balance for motor | Farooq | Funds Received |
| 77 | in | PKR 1,000 | Incoming balance for motor | Farooq | Funds Received |
| 78 | out | PKR 16,000 | Motor payment | Motor shop | Plumbing & Sanitary |
| 79 | in | PKR 20,000 | Incoming balance for Santary material | Farooq | Funds Received |
| 80 | out | PKR 20,000 | Santri materials | Santri store | Plumbing & Sanitary |
| 81 | in | PKR 10,000 | Incoming balance for plumber labor | Farooq | Funds Received |
| 82 | out | PKR 750 | Gate wall water pipe for shower | Shop | Plumbing & Sanitary |
| 83 | out | PKR 8,000 | Plumber labor partial | Plumber | Plumbing & Sanitary |
| 84 | out | PKR 3,160 | Missing Santri materials(P-Traps, Pipe, Steel Jaliyan) | Shop | Plumbing & Sanitary |
| 85 | out | PKR 300 | Advance given to Mistri | Mistri | Labour |
| 86 | out | PKR 1,000 | Paid to mistri Advance | Mistri | Labour |
| 87 | out | PKR 400 | Bottle and Chaye | Mistri | Food & Refreshments |
| 88 | in | PKR 10,000 | Paid for washroom and kitchen Mistri work | Farooq | Funds Received |
| 89 | out | PKR 1,700 | Cement 1 bori | Hafiz building material store | Construction Materials |
| 90 | out | PKR 4,000 | Labor payment (1 mistri, 1 mzdoor), Washrom farsh + Kitchen Farsh + Setting broken Dhaarein | Labor | Labour |
| 91 | out | PKR 200 | Chaye pani labor | Labor | Food & Refreshments |
| 92 | in | PKR 10,000 | Incoming balance for washroom other santry fitting material | Farooq | Funds Received |
| 93 | out | PKR 8,200 | Finishing Santri materials(Shower, Tuti, Wasin, Sink) etc | Qari santry store | Plumbing & Sanitary |
| 94 | in | PKR 2,100 | Paid directly to electic shop by Naveed | Bhata chowk electric shop | Funds Received |
| 95 | out | PKR 2,100 | Paid directly to electic shop by Naveed | Bhata chowk electric shop | Electrical |
| 96 | in | PKR 5,700 | Paid directy to Manawan marble and tiles store by Naveed | Manawan marble and tiles store | Funds Received |
| 97 | out | PKR 5,700 | Paid directy to Manawan marble and tiles store by Naveed | Manawan marble and tiles store | Construction Materials |
| 98 | out | PKR 450 | Dahi bhallay and Chana chaat | Shop | Food & Refreshments |
| 99 | out | PKR 3,250 | Tiles helping material(Plastic hammer, Grinder blade 4 inch, spunch, combot accessories, Seat cover etc, Motor wall lock) | Qari santri store | Tools & Equipment Rental |
| 100 | in | PKR 1,000 | Shop rent received | Farooq | Rent Income |
| 101 | in | PKR 1,000 | Cash received for Mistri labor | Farooq | Funds Received |
| 102 | out | PKR 1,600 | Cash paid + plastic hammer cost 400, total 2000 paid | Mistri | Labour |
| 103 | in | PKR 100 | Cash received to figure the 900 to 1000 | Farooq | Funds Received |
| 104 | out | PKR 200 | Santri material change and return if wrong seat cover in favor of exceeding bill amount | Qari santri store | Plumbing & Sanitary |
| 105 | in | PKR 10,000 | Incoming balance for Toolkit, new seat cover, drill rent, other misc | Farooq | Funds Received |
| 106 | out | PKR 1,700 | New seat cover | Manawan combot shop | Plumbing & Sanitary |
| 107 | out | PKR 2,100 | Toolkit custom | Machinary store | Tools & Equipment Rental |
| 108 | out | PKR 300 | Petrol | Petrol pump | Transport & Fuel |
| 109 | out | PKR 330 | Drill vermey 2 | Fancy hardware store | Tools & Equipment Rental |
| 110 | out | PKR 1,000 | Khana offered by Naveed | Khana shop | Food & Refreshments |
| 111 | out | PKR 4,870 | Door locks 3 | Fancy hardware store | Furnishing & Fittings |
| 112 | in | PKR 4,000 | Shop rent received | Farooq | Rent Income |
| 113 | out | PKR 500 | Petrol Ragrai wali machine laany k liye from Manawala to Jalo | Petrol pump | Transport & Fuel |

Uncategorised rows: 43.

## Receipt images

| Cell | Row | Outcome | Detail |
|---|---|---|---|
| G3 | 3 | imported |  |
| G4 | 4 | imported |  |
| G5 | 5 | imported |  |
| G6 | 6 | imported |  |
| G8 | 8 | imported |  |
| G9 | 9 | imported |  |
| H9 | 9 | imported |  |
| G10 | 10 | imported |  |
| G11 | 11 | imported |  |
| G13 | 13 | imported |  |
| H13 | 13 | imported |  |
| G14 | 14 | imported |  |
| G15 | 15 | imported |  |
| G16 | 16 | imported |  |
| H16 | 16 | imported |  |
| G17 | 17 | imported |  |
| G19 | 19 | imported |  |
| G20 | 20 | imported |  |
| G21 | 21 | imported |  |
| H21 | 21 | imported |  |
| G22 | 22 | imported |  |
| H22 | 22 | imported |  |
| G23 | 23 | imported |  |
| G27 | 27 | imported |  |
| H27 | 27 | imported |  |
| G29 | 29 | imported |  |
| G30 | 30 | imported |  |
| G31 | 31 | imported |  |
| H31 | 31 | imported |  |
| G36 | 36 | imported |  |
| G40 | 40 | imported |  |
| G41 | 41 | imported |  |
| G42 | 42 | imported |  |
| G43 | 43 | imported |  |
| G48 | 48 | imported |  |
| G49 | 49 | imported |  |
| G50 | 50 | imported |  |
| G52 | 52 | imported |  |
| G53 | 53 | imported |  |
| G54 | 54 | imported |  |
| H54 | 54 | imported |  |
| G55 | 55 | imported |  |
| G56 | 56 | imported |  |
| G57 | 57 | imported |  |
| G59 | 59 | imported |  |
| G60 | 60 | imported |  |
| G61 | 61 | imported |  |
| G62 | 62 | imported |  |
| G64 | 64 | imported |  |
| G72 | 72 | imported |  |
| G73 | 73 | imported |  |
| G74 | 74 | imported |  |
| H74 | 74 | imported |  |
| G75 | 75 | imported |  |
| G76 | 76 | imported |  |
| G77 | 77 | imported |  |
| G78 | 78 | imported |  |
| G79 | 79 | imported |  |
| G80 | 80 | imported |  |
| H80 | 80 | imported |  |
| G81 | 81 | imported |  |
| G82 | 82 | imported |  |
| G83 | 83 | imported |  |
| G84 | 84 | imported |  |
| G88 | 88 | imported |  |
| G89 | 89 | imported |  |
| H89 | 89 | imported |  |
| G92 | 92 | imported |  |
| G93 | 93 | imported |  |
| H93 | 93 | imported |  |
| G94 | 94 | imported |  |
| G96 | 96 | imported |  |
| G99 | 99 | imported |  |
| G104 | 104 | imported |  |
| G105 | 105 | imported |  |
| G106 | 106 | imported |  |
| G107 | 107 | imported |  |
| G109 | 109 | imported |  |
| G111 | 111 | imported |  |

## Skipped non-data rows

- Row 1: Title row
- Row 2: Column header row
- Row 129: Summary/footer row ("Remaining Total")
- Blank rows (15): 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128
