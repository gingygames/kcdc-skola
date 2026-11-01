// Slovníky stránek výchozího UI pro náhled mimo hru (tools/ui-dev/?lang=en): build z nich zapíše
// dist/ui-dev-texty.json. Ve hře posílá stejné oblasti klient (src/ui-jadro.ts api.texty).
import { jazyky, oblast } from "../src/shared/i18n";
import { nahratVestavene } from "../src/lang";

export function texty(): Record<string, Record<string, string>> {
  nahratVestavene();
  const out: Record<string, Record<string, string>> = {};
  for (const j of jazyky()) out[j] = oblast(j, ["page.", "card.", "level."]);
  return out;
}
