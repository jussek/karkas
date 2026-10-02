export interface ActiveMatchReference { activeMatchId:string; lobbyId:string }
const KEY='karkas.active-online-match.v1';
type StorageLike=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const defaultStorage=():StorageLike|null=>typeof window==='undefined'?null:window.localStorage;
export function saveActiveMatch(value:ActiveMatchReference,storage=defaultStorage()):void{storage?.setItem(KEY,JSON.stringify(value));}
export function loadActiveMatch(storage=defaultStorage()):ActiveMatchReference|null{try{const raw=storage?.getItem(KEY);if(!raw)return null;const value=JSON.parse(raw) as Partial<ActiveMatchReference>;return typeof value.activeMatchId==='string'&&typeof value.lobbyId==='string'?value as ActiveMatchReference:null;}catch{return null;}}
export function clearActiveMatch(storage=defaultStorage()):void{storage?.removeItem(KEY);}
