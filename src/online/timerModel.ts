export function deadlineFor(startedAt:string,timerSeconds:0|15|30|60):string|null{return timerSeconds===0?null:new Date(Date.parse(startedAt)+timerSeconds*1000).toISOString();}
export function remainingSeconds(deadline:string|null,now=Date.now()):number|null{return deadline===null?null:Math.max(0,Math.ceil((Date.parse(deadline)-now)/1000));}
export function formatCountdown(seconds:number):string{return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
