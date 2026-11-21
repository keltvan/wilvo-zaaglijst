# Changelog

Versienummer staat rechtsboven in de app. Nieuwe functie = tweede cijfer omhoog, reparatie = derde cijfer.
Elke versie heeft een git-tag (`v1.3.0` enz.), zodat je altijd terug kunt naar een vorige versie.

## 1.5.2 — 2026-11-21
- App-iconen in WILVO-stijl: de logoplaat (rode kap, donkerblauw vlak) met drie gezaagde stukken die om-en-om in elkaar liggen.

## 1.5.1 — 2026-11-21
- Geen oranje markeringen en "controleer"-teksten meer. Rood alleen nog bij echte leesfouten; een ontbrekende hoogte is een neutraal label "hoogte invullen".
- Boven- en zijaanzicht staan in de juiste verhouding (dikte : hoogte): één verticale schaal voor beide. Ingezoomd groeit dat door tot ware schaal.

## 1.5.0 — 2026-11-21
- WILVO-huisstijl zoals de Engineering Hub: logo en merkstreep in de kop, Bitter en Roboto, rechte hoeken, lichtblauwe knoppen met rood accent. Op desktop staan de knoppen in de kop.
- Hoogte en dikte per profiel: hoogte = zijaanzicht (de schuine snede loopt hierover), dikte = bovenaanzicht. Ingevuld uit de omschrijving als die een maat noemt, anders zelf invullen. Vervangt "schuin over".
- Jobtabel vraagt de hoogte alleen nog als die onbekend is.
- Tablet: per staaf een korte telling ("10× 937 · 3× 889") in plaats van alle lengtes achter elkaar.

## 1.4.1 — 2026-11-21
- Verstek-kolom vraagt direct de profielmaat ("over … mm"), oranje zolang die ontbreekt. Eerder stond die vraag alleen in het profielpaneel, waardoor een ingestelde verstek ongemerkt als recht werd gerekend.

## 1.4.0 — 2026-11-21
- Handgeschreven notities op de foto ("Onder 45° verstek zagen (2x)") worden herkend, ook als de OCR "verstek" verkeerd leest (Uersteh, verstck) en ook onder OPERATIONS. Eén materiaalregel: notitie wordt daarop toegepast (oranje: aangenomen). Meer regels: notitie wordt getoond.
- Nieuwe kolom Verstek in de jobtabel: per regel recht / 1 kant / 2 kanten / ruit en de hoek zelf instellen.
- Nieuw veld "schuin over" per profiel: de profielmaat waarover de schuine snede loopt, voor omschrijvingen zonder maat (zoals extrusieprofielen). Zonder maat telt de app de stukken als recht.
- "2x 45°" wordt niet meer gelezen als profielmaat 2 × 45; "versteviging" telt niet als verstek.

## 1.3.3 — 2026-11-21
- Zaagsneden en wiggen tussen de stukken tonen de gearceerde staaf in plaats van wit.

## 1.3.2 — 2026-11-21
- Elke staaf wordt apart getekend (Staaf 1, 2, 3 …), ook als meerdere staven precies hetzelfde zijn ingedeeld.
- Zijaanzicht altijd zichtbaar, ook bij rechte profielen.

## 1.3.1 — 2026-11-21
- Indeling (tekening per staaf) verschijnt pas als je "Nesten" aanzet; de berekening staat er altijd.
- "Nesten" werkt nu ook bij profielen met alleen rechte stukken (toont de indeling kop aan kop).

## 1.3.0 — 2026-11-21
- Desktop: lijst met profielen links, berekening en indeling rechts (pas na klikken op een profiel).
- Berekening per profiel: stukken + zaagsneden − nesten = nodig, ÷ staaf = minimaal, → indeling.
- Tekening per staaf met boven- en zijaanzicht, zoomen (knoppen, Ctrl+scroll) en slepen.
- Bovenaanzicht toont de hele contour van punt tot punt; zichtbaar zaagvlak donker, verborgen rand gestippeld.
- Eén knop "Job toevoegen" voor foto's en PDF's.
- Nesten-schakelaar bij elk profiel (grijs bij alleen rechte stukken).

## 1.2.0 — 2026-11-21
- Nesten: schuine stukken in elkaar zagen (ruitvorm, trapezium, aan één zijde), gecontroleerd tegen CAD.
- "L=12" in de omschrijving = staaflengte 12 m.

## 1.1.0 — 2026-11-20
- QR-code op desktop en installeerbaar als app.
- Fotoknop neemt ook PDF.

## 1.0.0 — 2026-11-20
- Job Traveler (PDF of foto) inlezen, staven per profiel berekenen, bestellijst kopiëren.
