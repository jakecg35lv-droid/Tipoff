// Lift chunkedBatch out of functions/index.js and run it against a
// fake Firestore that enforces the real 500-write ceiling.
const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'..','functions/index.js'),'utf8');
const start=src.indexOf('const BATCH_LIMIT');
const end=src.indexOf('\n}', src.indexOf('function chunkedBatch'))+2;
const code=src.slice(start,end);

let committedTotal=0, batches=[], rejected=0;
const db={ batch(){ const ops=[]; return {
  set(ref,data,opts){ ops.push(1); },
  async commit(){
    if(ops.length>500){ rejected++; throw new Error('INVALID_ARGUMENT: maximum 500 writes allowed per request'); }
    batches.push(ops.length); committedTotal+=ops.length;
  } }; } };
const console2={log(){}};
const chunkedBatch=new Function('db','console','return (function(){'+code+'; return chunkedBatch;})()')(db,console2);

let pass=0,fail=0;
const ok=(n,c,d)=>{ c?(pass++,console.log('PASS  '+n)):(fail++,console.log('FAIL  '+n+(d?'  -> '+d:''))); };

(async()=>{
  // The exact shape that breaks a plain db.batch(): a heavy slate.
  const b=chunkedBatch();
  for(let i=0;i<703;i++) b.set({id:i},{x:i},{merge:true});
  ok('accumulates without committing', committedTotal===0 && b.size===703, String(b.size));
  const n=await b.commit();
  ok('every write lands', n===703 && committedTotal===703, committedTotal+' of 703');
  ok('no batch exceeded the ceiling', rejected===0 && Math.max(...batches)<=500, JSON.stringify(batches));
  ok('split into the expected number of batches', batches.length===2, JSON.stringify(batches));
  ok('the accumulator is emptied after commit', b.size===0, String(b.size));

  // A plain batch at this size is exactly what used to happen.
  const raw=db.batch();
  for(let i=0;i<703;i++) raw.set({},{});
  let threw=false; try{ await raw.commit(); }catch(e){ threw=true; }
  ok('and a raw batch at the same size DOES reject', threw,
     'if this passes, the fake is not modelling the real ceiling');

  // Small slate still one batch, no behaviour change.
  batches=[]; committedTotal=0;
  const s=chunkedBatch();
  for(let i=0;i<209;i++) s.set({},{});
  await s.commit();
  ok('a normal night is still a single batch', batches.length===1 && batches[0]===209, JSON.stringify(batches));

  ok('empty commit is a no-op', (await chunkedBatch().commit())===0);
  console.log('\n'+pass+'/'+(pass+fail)+' chunked batch checks pass');
  process.exit(fail?1:0);
})();
