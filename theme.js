export const palettes={
  paper:{name:'纸白',light:['#f5f1e7','#fbf8f1','#27261f','#706d60','#d9d4c5','#9b4626','#e8e1d3'],dark:['#1b1c19','#252622','#f1ede3','#b5b2a6','#42433b','#e5a785','#33342e']},
  ocean:{name:'海盐蓝',light:['#f1f5f8','#ffffff','#172d43','#607082','#dce5ec','#245d83','#e4eff7'],dark:['#111b25','#1b2936','#e6eff6','#a4b8ca','#334657','#91c9f0','#263f52']},
  sage:{name:'鼠尾草',light:['#f2f5f0','#ffffff','#283e31','#5f7163','#dde7da','#486e53','#e8f0e3'],dark:['#151f19','#223027','#e5eee6','#a7bca9','#3e5142','#aed0aa','#314738']},
  sand:{name:'暖沙米',light:['#f8f4ec','#fffdf8','#473a2a','#796a55','#e9dfcf','#805d35','#f2e9d9'],dark:['#211e19','#302b23','#f1e8d9','#c1b298','#514739','#dec199','#433929']},
  lilac:{name:'雾紫',light:['#f5f2fa','#ffffff','#3a3050','#756983','#e6dfef','#715b92','#eee7f6'],dark:['#201b28','#2f273c','#eee7f7','#baacd0','#4c405d','#cbbbeb','#443653']},
  rose:{name:'柔雾玫瑰',light:['#faf3f3','#fffdfd','#51383d','#846870','#eddee1','#905369','#f5e7ec'],dark:['#271c21','#39292f','#f4e6eb','#c7a7b3','#5b414c','#e5b2c5','#503540']},
  graphite:{name:'石墨',light:['#f2f3f4','#ffffff','#262a30','#666d77','#dfe2e6','#424b57','#e8ebef'],dark:['#16181c','#24272c','#edf0f4','#adb3bf','#3e434d','#c4cedd','#343a44']}
};
export function applyTheme(prefs){
  const dark=prefs.appearance==='dark'||prefs.appearance==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;
  const colors=palettes[prefs.palette]?.[dark?'dark':'light']||palettes.ocean.light;
  ['bg','surface','text','muted','border','accent','soft'].forEach((key,i)=>document.documentElement.style.setProperty(`--${key}`,colors[i]));
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.documentElement.style.colorScheme=dark?'dark':'light';
  document.querySelector('meta[name="theme-color"]').content=colors[0];
}
