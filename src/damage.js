// Scan-convert the exact damage polygon on the CPU, avoiding GPU pixel readback.
export function erasePolygon(mask, width, height, vertices) {
  const low=Math.max(0,Math.floor(Math.min(...vertices.map(p=>p[1]))));
  const high=Math.min(height-1,Math.ceil(Math.max(...vertices.map(p=>p[1]))));
  const intersections=[];
  for(let y=low;y<=high;y++) {
    intersections.length=0;
    const scan=y+.5;
    for(let i=0,j=vertices.length-1;i<vertices.length;j=i++) {
      const a=vertices[j],b=vertices[i];
      if((a[1]>scan)!==(b[1]>scan)) intersections.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    intersections.sort((a,b)=>a-b);
    for(let i=0;i+1<intersections.length;i+=2) {
      const left=Math.max(0,Math.ceil(intersections[i]-.5)),right=Math.min(width,Math.ceil(intersections[i+1]-.5));
      if(right>left)mask.fill(0,y*width+left,y*width+right);
    }
  }
}
