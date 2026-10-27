/* CSS Houdini Paint Worklet: subtle decorative grid. */
registerPaint('hanzet-grid',class{paint(ctx,size){const gap=34;ctx.strokeStyle='rgba(124,156,255,.055)';ctx.lineWidth=1;for(let x=0;x<size.width;x+=gap){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,size.height);ctx.stroke();}for(let y=0;y<size.height;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(size.width,y);ctx.stroke();}}});
