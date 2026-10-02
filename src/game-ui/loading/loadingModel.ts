export const GAME_LOADING_TIPS=[
  'Дороги приносят очки после завершения.',
  'Город нельзя занять, если в нём уже есть чужой человечек.',
  'Монастырь получает очки за окружающие карты.',
  'Карту можно отменить до подтверждения установки.',
] as const;
export const LOADING_STAGES={shell:10,catalog:25,players:45,state:65,artwork:80,renderer:95,ready:100} as const;
export function loadingTip(seed:string):string{return GAME_LOADING_TIPS[Array.from(seed).reduce((sum,char)=>sum+char.charCodeAt(0),0)%GAME_LOADING_TIPS.length];}
