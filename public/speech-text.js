const digit=['zero','one','two','three','four','five','six','seven','eight','nine'];
const teens=['ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'],tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
function integerWords(value){const n=Number(value);if(n<10)return digit[n];if(n<20)return teens[n-10];if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+digit[n%10]:'');if(n<1000)return digit[Math.floor(n/100)]+' hundred'+(n%100?' '+integerWords(n%100):'');return digit[Math.floor(n/1000)]+' thousand'+(n%1000?' '+integerWords(n%1000):'');}
// Keep display facts unchanged. Explicit access digits and decimal units get a
// deterministic spoken rendering rather than trusting a voice's normalizer.
export function speechText(text){
  return String(text).replace(/\b([0-9]{3,8})#/g,(_,code)=>[...code].map(n=>digit[Number(n)]).join(', ')+', pound')
    .replace(/((?:gate|access)\s+code(?:\s+is|:)?\s+)([0-9]{3,8})(?![0-9#])/gi,(_,prefix,code)=>prefix+[...code].map(n=>digit[Number(n)]).join(', '))
    .replace(/\b([0-9]{1,4})\.([0-9]{1,3})\s*(kWh|kW|W)\b/g,(_,whole,decimal,unit)=>integerWords(whole)+' point '+[...decimal].map(n=>digit[Number(n)]).join(' ')+' '+({kWh:'kilowatt hours',kW:'kilowatts',W:'watts'}[unit]));
}
