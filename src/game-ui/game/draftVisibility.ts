export function onlineHandVisible(phase:string,hasTileDraft:boolean):boolean{return phase==='TILE_IN_HAND'&&!hasTileDraft;}
export function localHandVisible(phase:string):boolean{return phase==='TILE_IN_HAND';}
