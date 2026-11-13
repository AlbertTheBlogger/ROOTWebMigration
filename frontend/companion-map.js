// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
let camera={key:null,base:null,box:null},dispose=null;
export function clampCompanionBox(box,base){
  if(![...box,...base].every(Number.isFinite)||base[2]<=0||base[3]<=0)throw new Error('Invalid map bounds');
  const width=Math.min(base[2],Math.max(base[2]/4,box[2])),height=width*base[3]/base[2];
  return [Math.max(base[0],Math.min(base[0]+base[2]-width,box[0])),Math.max(base[1],Math.min(base[1]+base[3]-height,box[1])),width,height];
}
export function zoomCompanionBox(box,base,factor,anchor=[box[0]+box[2]/2,box[1]+box[3]/2]){
  if(!Number.isFinite(factor)||factor<=0)throw new Error('Invalid zoom');
  const width=Math.min(base[2],Math.max(base[2]/4,box[2]/factor)),ratio=width/box[2];
  return clampCompanionBox([anchor[0]-(anchor[0]-box[0])*ratio,anchor[1]-(anchor[1]-box[1])*ratio,width,box[3]*ratio],base);
}
export function unmountCompanionMap(){dispose?.();dispose=null;}
export function mountCompanionMap(map,key){
  unmountCompanionMap();if(!map)return;
  const base=map.getAttribute('viewBox').split(/\s+/).map(Number);
  if(camera.key!==key)camera={key,base,box:[...base]};
  const pointers=new Map(),cleanups=[];let gesture=null,suppressClick=false;
  const apply=box=>{camera.box=clampCompanionBox(box,camera.base);map.setAttribute('viewBox',camera.box.join(' '));map.parentElement.dataset.zoom=String(Math.round(camera.base[2]/camera.box[2]*100));map.parentElement.dispatchEvent(new Event('map-camera-frame'));};
  const point=(x,y)=>{const p=map.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(map.getScreenCTM().inverse());};
  const snapshot=()=>{const points=[...pointers.values()];gesture={box:[...camera.box],points,scale:Math.min(map.clientWidth/camera.box[2],map.clientHeight/camera.box[3])};};
  const on=(el,type,fn,options)=>{el.addEventListener(type,fn,options);cleanups.push(()=>el.removeEventListener(type,fn,options));};
  on(map,'pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});suppressClick=false;snapshot();});
  on(map,'pointermove',e=>{
    if(!pointers.has(e.pointerId)||!gesture)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const current=[...pointers.values()];
    if(current.length===2&&gesture.points.length===2){
      const distance=p=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),factor=distance(current)/Math.max(1,distance(gesture.points));
      const mid={x:(gesture.points[0].x+gesture.points[1].x)/2,y:(gesture.points[0].y+gesture.points[1].y)/2};
      // Convert the initial pinch center using the initial camera transform.
      map.setAttribute('viewBox',gesture.box.join(' '));const anchor=point(mid.x,mid.y);
      const box=zoomCompanionBox(gesture.box,camera.base,factor,[anchor.x,anchor.y]);
      const scale=gesture.scale*gesture.box[2]/box[2];box[0]-=((current[0].x+current[1].x)/2-mid.x)/scale;box[1]-=((current[0].y+current[1].y)/2-mid.y)/scale;
      suppressClick=true;e.preventDefault();apply(box);
    }else if(current.length===1&&gesture.points.length===1){
      const dx=current[0].x-gesture.points[0].x,dy=current[0].y-gesture.points[0].y;
      if(Math.hypot(dx,dy)<8&&!suppressClick)return;
      suppressClick=true;map.setPointerCapture(e.pointerId);e.preventDefault();apply([gesture.box[0]-dx/gesture.scale,gesture.box[1]-dy/gesture.scale,...gesture.box.slice(2)]);
    }
  },{passive:false});
  const finish=e=>{pointers.delete(e.pointerId);if(map.hasPointerCapture(e.pointerId))map.releasePointerCapture(e.pointerId);if(pointers.size)snapshot();else gesture=null;};
  on(map,'pointerup',finish);on(map,'pointercancel',finish);on(window,'pointerup',finish);
  on(map,'click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}},true);
  on(map,'wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();const anchor=point(e.clientX,e.clientY);apply(zoomCompanionBox(camera.box,camera.base,e.deltaY<0?1.2:1/1.2,[anchor.x,anchor.y]));},{passive:false});
  for(const button of document.querySelectorAll('[data-companion-camera]'))on(button,'click',()=>{
    const command=button.dataset.companionCamera;
    if(command==='reset')apply([...camera.base]);
    else if(command==='focus'){
      const points=[...map.querySelectorAll('.actionable')].map(n=>{const ground=n.querySelector('.ground');if(ground)return [Number(ground.getAttribute('cx')),Number(ground.getAttribute('cy'))];const forest=n.closest('foreignObject');return forest?[Number(forest.getAttribute('x'))+Number(forest.getAttribute('width'))/2,Number(forest.getAttribute('y'))+Number(forest.getAttribute('height'))/2]:null;}).filter(Boolean);
      if(points.length){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),width=Math.max(camera.base[2]/3,Math.max(...xs)-Math.min(...xs)+220,(Math.max(...ys)-Math.min(...ys)+160)*camera.base[2]/camera.base[3]);apply([(Math.min(...xs)+Math.max(...xs)-width)/2,(Math.min(...ys)+Math.max(...ys)-width*camera.base[3]/camera.base[2])/2,width,width*camera.base[3]/camera.base[2]]);}
    }else apply(zoomCompanionBox(camera.box,camera.base,command==='in'?1.4:1/1.4));
  });
  apply(camera.box);dispose=()=>{cleanups.forEach(f=>f());pointers.clear();gesture=null;};
}
