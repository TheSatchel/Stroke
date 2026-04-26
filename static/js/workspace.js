/**
 * Stroke · Image Generation Workspace
 * 从 image_gen_workspace_v3.html 提取的交互逻辑
 */

(function(){
  'use strict';

  var tool='las', lassoing=false, lx=0, ly=0, dragSrc=null;
  var flagDone=false, isCollapsed=false, generating=false;
  var savedOrder=null;

  window.setTool = function(t){
    tool=t;
    var btnSel=document.getElementById('btnSel'), btnLas=document.getElementById('btnLas');
    if(btnSel) btnSel.classList.toggle('active',t==='sel');
    if(btnLas) btnLas.classList.toggle('active',t==='las');
    var hint=document.getElementById('tHint');
    if(hint) hint.textContent=t==='las'?'拖拽画圈以标注区域':'点击选择区域';
    var canvas=document.getElementById('canvas');
    if(canvas) canvas.style.cursor=t==='las'?'crosshair':'default';
  };

  window.startL = function(e){
    if(tool!=='las') return;
    lassoing=true;
    var r=document.getElementById('canvas').getBoundingClientRect();
    lx=e.clientX-r.left; ly=e.clientY-r.top;
    var el=document.getElementById('lEl');
    el.style.display='block'; el.style.left=lx+'px'; el.style.top=ly+'px';
    el.style.width='0'; el.style.height='0';
    document.getElementById('lLbl').style.display='none';
  };

  window.moveL = function(e){
    if(!lassoing) return;
    var r=document.getElementById('canvas').getBoundingClientRect();
    var sz=Math.max(Math.abs(e.clientX-r.left-lx),Math.abs(e.clientY-r.top-ly));
    var el=document.getElementById('lEl');
    el.style.left=(lx-sz/2)+'px'; el.style.top=(ly-sz/2)+'px';
    el.style.width=sz+'px'; el.style.height=sz+'px';
  };

  window.endL = function(e){
    if(!lassoing) return; lassoing=false;
    var el=document.getElementById('lEl');
    if(parseFloat(el.style.width)>20){
      var lb=document.getElementById('lLbl');
      lb.style.display='block';
      lb.style.left=(parseFloat(el.style.left)+parseFloat(el.style.width)/2-30)+'px';
      lb.style.top=(parseFloat(el.style.top)-20)+'px';
      document.getElementById('rBlock').style.display='block';
    } else { el.style.display='none'; }
  };

  window.selHist = function(i){
    document.querySelectorAll('.hist-item').forEach(function(el,idx){el.classList.toggle('active',idx===i);});
    document.getElementById('savedL').style.display=i===0?'block':'none';
    document.getElementById('rBlock').style.display=i===0?'block':'none';
    if(i!==0){
      document.getElementById('lEl').style.display='none';
      document.getElementById('lLbl').style.display='none';
    }
  };

  window.simUpload = function(){
    document.getElementById('uz').style.display='none';
    document.getElementById('uf').style.display='block';
  };

  window.remUp = function(){
    document.getElementById('uz').style.display='block';
    document.getElementById('uf').style.display='none';
  };

  window.toggleFlag = function(){
    flagDone=!flagDone;
    var fb=document.getElementById('flagBtn');
    fb.classList.toggle('done',flagDone);
  };

  function collapse(){
    var wrap=document.getElementById('secWrap');
    var body=document.getElementById('rightBody');
    var bodyH=body.getBoundingClientRect().height;
    var wrapH=wrap.getBoundingClientRect().height;
    var offset=Math.max(0, wrapH - bodyH + 8);
    wrap.style.setProperty('--collapse-offset', offset+'px');
    wrap.classList.add('collapsed');
    isCollapsed=true;
  }

  function expand(){
    var wrap=document.getElementById('secWrap');
    wrap.classList.remove('collapsed');
    isCollapsed=false;
  }

  window.doGen = function(){
    if(generating) return;
    generating=true;
    var btn=document.getElementById('genBtn');
    btn.textContent='生成中...'; btn.disabled=true;

    collapse();

    setTimeout(function(){
      expand();
      btn.textContent='重新生成'; btn.disabled=false;
      generating=false;
      var fb=document.getElementById('flagBtn');
      if(fb){ fb.classList.add('done'); }
      flagDone=true;
    }, 2200);
  };

  window.openSettings = function(){
    document.getElementById('overlay').classList.remove('hidden');
  };

  window.closeSettings = function(e){
    if(!e||e.target===document.getElementById('overlay')){
      document.getElementById('overlay').classList.add('hidden');
    }
  };

  window.provChange = function(sel){
    document.getElementById('epField').style.display=sel.value==='自定义端点'?'block':'none';
    var m=document.getElementById('modelSel');
    if(sel.value==='OpenAI'){
      m.innerHTML='<option>gpt-image-1</option><option selected>dall-e-3</option><option>dall-e-2</option>';
    } else if(sel.value==='Replicate'){
      m.innerHTML='<option selected>stability-ai/sdxl</option><option>black-forest-labs/flux</option>';
    } else if(sel.value==='Stability AI'){
      m.innerHTML='<option selected>stable-diffusion-xl-1024</option><option>sd3-medium</option>';
    } else {
      m.innerHTML='<option>custom-model</option>';
    }
  };

  // --- 拖拽排序 ---
  window.dStart = function(e,id){
    dragSrc=id;
    e.dataTransfer.effectAllowed='move';
    setTimeout(function(){
      var el=document.getElementById(id);
      if(el) el.classList.add('dragging');
    },0);
  };

  window.dOver = function(e){
    e.preventDefault();
    e.dataTransfer.dropEffect='move';
    var s=e.currentTarget.closest('.drag-section');
    if(s) s.classList.add('drag-over');
  };

  window.dLeave = function(e){
    var s=e.currentTarget.closest('.drag-section');
    if(s) s.classList.remove('drag-over');
  };

  window.dDrop = function(e,tid){
    e.preventDefault();
    document.querySelectorAll('.drag-section').forEach(function(s){s.classList.remove('drag-over','dragging');});
    if(dragSrc&&dragSrc!==tid){
      var list=document.getElementById('secList');
      var src=document.getElementById(dragSrc), tgt=document.getElementById(tid);
      if(src&&tgt&&list){
        var si=Array.from(list.children).indexOf(src), ti=Array.from(list.children).indexOf(tgt);
        if(si<ti) list.insertBefore(src,tgt.nextSibling); else list.insertBefore(src,tgt);
      }
    }
    dragSrc=null;
  };

})();