import test from 'node:test';
import assert from 'node:assert/strict';
import {demoWorkOrders} from './public/demo-work-orders.js';
import {validateOrder} from './public/engine.js';
import {prepareConversation} from './lib/meta-conversation.mjs';
import {directAssignmentAnswer} from './lib/lookup-context.mjs';

test('different work orders prepare only their own equipment, history and access context',()=>{
  for(const order of demoWorkOrders){
    const prepared=prepareConversation({order:validateOrder(order),text:'What should I know about this job?'});
    assert.ok(prepared.customerHistory.every(h=>h.jobId===order.id&&h.systemId===order.systemId));
    const context=JSON.stringify(prepared.request);
    assert.ok(context.includes(order.customer));
    for(const other of demoWorkOrders.filter(o=>o.id!==order.id))assert.ok(!context.includes(other.customer));
    if(order.systemId!=='DEMO-SYS-017')assert.deepEqual(prepared.equipmentSources,[]);
    const foreign=demoWorkOrders.find(o=>o.id!==order.id);
    assert.throws(()=>prepareConversation({order,text:'What is the gate code?',history:[{jobId:foreign.id,question:'A question from another visit',reply:'A different job reply'}]}),/wrong-job/);
  }
});
test('missing gate codes and equipment models cannot reuse Elena’s assignment answers',()=>{
  const [elena,marcus,priya,owen]=demoWorkOrders;
  const ask=(order,text)=>directAssignmentAnswer({order,text});
  assert.match(ask(elena,'What is the gate code?').reply,/2468#/);
  assert.match(ask(owen,'What is the gate code?').reply,/7319#/);
  assert.equal(ask(priya,'What is the gate code?'),null);
  assert.equal(ask(marcus,'What is the gate code?'),null);
  assert.equal(ask(owen,'What inverter model is listed?'),null);
});
