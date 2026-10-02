export type TimerVisualState='normal'|'warning'|'critical'|'expired';
export function timerVisualState(seconds:number|null):TimerVisualState{
  if(seconds===null||seconds>10)return'normal';
  if(seconds===0)return'expired';
  return seconds<=5?'critical':'warning';
}
export function scoreDeltas(previous:Record<string,number>,next:Record<string,number>):Record<string,number>{
  return Object.entries(next).reduce<Record<string,number>>((result,[id,score])=>{const delta=score-(previous[id]??0);if(delta>0)result[id]=delta;return result;},{});
}
export type ContextualControls='tile-draft'|'meeple-draft'|'end-turn'|'choose-cell'|'waiting'|'finished';
export function contextualControls(input:{finished:boolean;myTurn:boolean;tileDraft:boolean;meepleDraft:boolean;canEndTurn:boolean}):ContextualControls{
  if(input.finished)return'finished';if(!input.myTurn)return'waiting';if(input.tileDraft)return'tile-draft';if(input.meepleDraft)return'meeple-draft';if(input.canEndTurn)return'end-turn';return'choose-cell';
}
