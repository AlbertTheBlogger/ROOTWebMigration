// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import {interpolateBox} from './presentation-model.js';
import {motionDuration} from './sound.js';
let camera={context:null,value:null,target:null,element:null,frame:null};
export function moveCamera(map,box,context){
  const target=typeof box==='string'?box.split(/\s+/).map(Number):box;
  if(target.length!==4||!target.every(Number.isFinite))return;
  const fresh=camera.context!==context;
  if(fresh){cancelAnimationFrame(camera.frame);camera={context,value:map.dataset.fullView.split(/\s+/).map(Number),target:null,element:map,frame:null};}
  camera.element=map;
  map.setAttribute('viewBox',camera.value.join(' '));
  if(camera.target?.every((value,i)=>Math.abs(value-target[i])<.01)){
    map.dataset.cameraMoving=String(camera.frame!==null);return;
  }
  cancelAnimationFrame(camera.frame);
  const from=[...camera.value],start=performance.now(),duration=motionDuration(480);
  camera.target=[...target];map.dataset.cameraMoving='true';
  const tick=now=>{
    const progress=duration?Math.min(1,(now-start)/duration):1;
    camera.value=interpolateBox(from,target,progress);
    camera.element.setAttribute('viewBox',camera.value.join(' '));
    camera.element.parentElement?.dispatchEvent(new Event('map-camera-frame'));
    if(progress<1)camera.frame=requestAnimationFrame(tick);
    else{camera.frame=null;camera.element.dataset.cameraMoving='false';}
  };
  if(duration)camera.frame=requestAnimationFrame(tick);else tick(start);
}
export function resetCamera(){cancelAnimationFrame(camera.frame);camera={context:null,value:null,target:null,element:null,frame:null};}
