/** Old files without these settings use a fixed, unmirrored camera. */
export function restoreVideoDisplay(saved:unknown){
 const value=saved&&typeof saved==='object'?saved as Record<string,unknown>:{};
 return {mirror:typeof value.mirror==='boolean'?value.mirror:false,tripod:typeof value.tripod==='boolean'?value.tripod:true};
}
