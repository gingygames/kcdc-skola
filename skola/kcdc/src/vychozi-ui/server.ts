// Výchozí UI školy (resource skola-ui), serverová část: nic nedělá, jen se ohlásí. Všechna pravidla a texty má
// resource skola; tenhle resource dodává klientům panel a kartu hodiny (client.js, ui/). Bez něj škola běží dál
// s nativní nabídkou hry, jiný framework ho nahradí vlastním UI (docs/ADAPTING.md).
Events.on("resourceStart", (name: string) => {
  if (name === "skola-ui") console.log("[skola-ui] výchozí UI školy (panel a karta hodiny)");
});
