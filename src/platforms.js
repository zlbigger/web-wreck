// One-way surfaces: jump through from below, land on surviving pixels from above.
export function landingSurface(platforms, x, beforeY, afterY, aliveAt) {
  return platforms.filter(p => beforeY <= p.y + 1 && afterY >= p.y && x + 8 > p.x && x - 8 < p.x + p.w)
    .sort((a,b) => a.y - b.y)
    .find(p => [-6,0,6].some(dx => x + dx >= p.x && x + dx < p.x + p.w && aliveAt(x + dx, p.y + 5)));
}
export function makePlatforms(paint, width, height, realSite) {
  const platforms = [];
  if (realSite) {
    const s = width / 1280;
    const add = (x,y,w,label) => platforms.push({x:x*s,y:y*s,w:w*s,label});
    add(198,35,211,'博客招牌');
    [32,143,253].forEach((x,i) => { add(x,270,84,['把','自','己'][i]); add(x,373,84,['产','品','化'][i]); });
    add(558,194,588,'人物插画');
    add(34,518,490,'自我介绍'); add(34,567,220,'业务落地');
    add(34,661,450,'工作流'); add(34,697,420,'长期运营');
  }
  // Detect text and card rows below the hero, using their actual snapshot pixels.
  const {data} = paint.getImageData(0,0,width,height);
  for(let y=realSite?800:140;y<height-16;y+=28) {
    let start=-1;
    for(let x=20;x<width-20;x+=12) {
      let ink=0;
      for(let yy=y;yy<y+10;yy+=2) for(let xx=x;xx<x+12;xx+=2) {
        const i=(yy*width+xx)*4;
        if(data[i]+data[i+1]+data[i+2]<450) ink++;
      }
      if(ink>=3 && start<0) start=x;
      if((ink<3 || x>=width-32) && start>=0) {
        if(x-start>=48) platforms.push({x:start,y,w:x-start,label:'网页元素'});
        start=-1;
      }
    }
  }
  return platforms;
}
