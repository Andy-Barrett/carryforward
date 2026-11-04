const timestamp=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
export function isOffsetObservationTime(value){
 if(typeof value!=='string')return false;const m=value.match(timestamp);if(!m)return false;
 const [,year,month,day,hour,minute,second='00',fraction='',offset]=m;
 if(+hour>23||+minute>59||+second>59||offset==='-00:00')return false;
 if(offset!=='Z'){const h=+offset.slice(1,3),min=+offset.slice(4);if(h>14||min>59||(h===14&&min!==0))return false;}
 const wall=new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}Z`);
 return Number.isFinite(wall.getTime())&&wall.getUTCFullYear()===+year&&wall.getUTCMonth()+1===+month&&wall.getUTCDate()===+day&&Number.isFinite(Date.parse(value));
}
export function observationInputParts(value=''){
 const match=String(value).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:\d{2})?$/);
 return {wall:match?.[1]||'',offset:match?.[2]||''};
}
export function deviceOffsetAt(wall){
 const date=wall?new Date(wall):new Date();if(!Number.isFinite(date.getTime()))return '';
 const minutes=-date.getTimezoneOffset(),absolute=Math.abs(minutes);
 return `${minutes<0?'-':'+'}${String(Math.floor(absolute/60)).padStart(2,'0')}:${String(absolute%60).padStart(2,'0')}`;
}
export function collectObservationTime(wall,offset,previous=''){
 const before=observationInputParts(previous);
 if(wall===before.wall&&offset===before.offset)return previous;
 return wall?wall+String(offset||'').trim():'';
}
