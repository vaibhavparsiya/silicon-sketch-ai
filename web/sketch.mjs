export async function sketch(file){
 if(!file)return undefined;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8e6)throw Error('Choose a PNG, JPEG or WebP under 8 MB.');
 const img=await createImageBitmap(file);
 try{
 const scale=Math.min(1,1024/Math.max(img.width,img.height)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
 const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
 return canvas.toDataURL('image/jpeg',.74);
 }finally{img.close();}
}
