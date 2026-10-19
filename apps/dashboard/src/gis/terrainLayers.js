import { buildRegionOutline } from './outline.js';

/** 层级明确：地形底纹 → 晕渲 → 区外压暗 → 细县界 → 城市轮廓光带 → Three.js 飞线。 */
export function addLandscapeLayers(map, config, boundary, terrain) {
  const sourceOptions=terrain?{tileSize:terrain.tileSize,minzoom:terrain.minzoom||0,maxzoom:terrain.maxzoom,...(terrain.bounds?{bounds:terrain.bounds}:{})}:null;
  if(terrain?.reliefTiles&&!config.tilesUrl) {
    map.addSource('relief',{type:'raster',tiles:terrain.reliefTiles,...sourceOptions});
    map.addLayer({id:'terrain-relief',type:'raster',source:'relief',paint:{'raster-opacity':1,'raster-saturation':-.08,'raster-fade-duration':0}});
  }
  if(config.tilesUrl) {
    map.addSource('basemap',{type:'raster',tiles:[config.tilesUrl],tileSize:256});
    map.addLayer({id:'basemap',type:'raster',source:'basemap',paint:{'raster-opacity':.92,'raster-saturation':-.28,'raster-fade-duration':0}});
  }
  map.addSource('districts',{type:'geojson',data:boundary});
  map.addLayer({id:'districts-fill',type:'fill',source:'districts',paint:{'fill-color':terrain?'#148b88':'#074867','fill-opacity':terrain?.reliefTiles?.length ? .04 : terrain ? .3 : .5}});
  if(terrain) {
    map.addSource('terrain',{type:'raster-dem',tiles:terrain.tiles,encoding:terrain.encoding,...sourceOptions});
    map.setTerrain({source:'terrain',exaggeration:terrain.exaggeration});
    map.addLayer({id:'terrain-hillshade',type:'hillshade',source:'terrain',paint:{
      'hillshade-illumination-anchor':'map','hillshade-illumination-direction':315,
      'hillshade-exaggeration':terrain.reliefTiles?.length ? .28 : .8,
      'hillshade-shadow-color':'#001a24','hillshade-highlight-color':'#b9e3ca','hillshade-accent-color':'#062e32',
    }});
  } else if(config.extrusionHeight>0) {
    map.addLayer({id:'districts-3d',type:'fill-extrusion',source:'districts',paint:{'fill-extrusion-color':'#0d526b','fill-extrusion-height':config.extrusionHeight,'fill-extrusion-base':0,'fill-extrusion-opacity':.78}});
  }
  const {outline,mask,segments}=buildRegionOutline(boundary);
  map.addSource('region-exterior',{type:'geojson',data:mask});
  map.addLayer({id:'region-exterior',type:'fill',source:'region-exterior',paint:{'fill-color':'#00162c','fill-opacity':.91}});
  map.addLayer({id:'districts-outline',type:'line',source:'districts',paint:{'line-color':'#60d9ce','line-width':.7,'line-opacity':.5}});
  map.addSource('region-outline',{type:'geojson',data:outline});
  for(const [id,width,blur,opacity,color] of [
    ['aura',17,12,.36,'#087dff'],['glow',8,5,.85,'#2ae2ff'],['edge',3.1,.65,1,'#a1f8ff'],['core',1.2,0,1,'#f0ffff'],
  ]) map.addLayer({id:`region-${id}`,type:'line',source:'region-outline',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':color,'line-width':width,'line-blur':blur,'line-opacity':opacity}});
  return {outerSegments:segments,outerRings:outline.features.length,terrainLayerIds:terrain?['terrain-hillshade',...(terrain.reliefTiles&&!config.tilesUrl?['terrain-relief']:[])]:[]};
}
