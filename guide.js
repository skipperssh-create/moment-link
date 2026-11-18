/* Legacy v1 links redirect to one product's static page. No all-product fallback. */
(() => {
 'use strict';
 const params=new URLSearchParams(location.search),category=params.get('t');
 if(!['yacht','visit','trunk','heli'].includes(category)||params.has('v')&&params.get('v')!=='1')return;
 if(['v','t','video','mode','photos'].some(key=>params.getAll(key).length>1))return;
 const mode=category==='trunk'&&params.get('mode')==='visit'?'-visit':'';
 const video=params.get('video')==='1'?'-video':'';
 const photos=category==='visit'&&params.get('photos')==='1'?'-photos':'';
 location.replace('/guide/'+category+mode+video+photos+'-v1.html');
})();
