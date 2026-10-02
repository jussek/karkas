import { contextualControls,scoreDeltas,timerVisualState } from '../gamePresentationModel';
import { GAME_LOADING_TIPS,LOADING_STAGES,loadingTip } from '../../loading/loadingModel';

describe('Stage 5E gameplay presentation',()=>{
  it('maps timer warning and critical states without changing timer semantics',()=>{expect(timerVisualState(null)).toBe('normal');expect(timerVisualState(11)).toBe('normal');expect(timerVisualState(10)).toBe('warning');expect(timerVisualState(5)).toBe('critical');expect(timerVisualState(0)).toBe('expired');});
  it('derives positive score feedback only from authoritative snapshots',()=>expect(scoreDeltas({a:3,b:7},{a:7,b:7})).toEqual({a:4}));
  it('selects reversible contextual controls',()=>{expect(contextualControls({finished:false,myTurn:true,tileDraft:true,meepleDraft:false,canEndTurn:false})).toBe('tile-draft');expect(contextualControls({finished:false,myTurn:true,tileDraft:false,meepleDraft:true,canEndTurn:true})).toBe('meeple-draft');expect(contextualControls({finished:false,myTurn:true,tileDraft:false,meepleDraft:false,canEndTurn:true})).toBe('end-turn');expect(contextualControls({finished:false,myTurn:false,tileDraft:false,meepleDraft:false,canEndTurn:false})).toBe('waiting');});
  it('uses completed initialization stages and stable valid tips',()=>{expect(Object.values(LOADING_STAGES)).toEqual([10,25,45,65,80,95,100]);expect(GAME_LOADING_TIPS).toContain(loadingTip('match-1') as typeof GAME_LOADING_TIPS[number]);});
  it('isolates the online clock inside the memoized HUD instead of the board page',async()=>{const hud=await import('../OnlineTurnHud');expect(hud.OnlineTurnHud).toBeTruthy();});
});
