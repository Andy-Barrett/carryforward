import {demoOrder,validateOrder} from './engine.js';
const source=(id,title)=>({id,title:'Fictional '+title,revision:'DEMO-2026-11-02'});
const note=(id,text,kind='context',origin='DEMO-PACKET-1044')=>({id,text,kind,source:source(origin,'Operations work-order packet')});
// Assignment fixture only. Existing saved jobs are never rewritten with this data.
export const detailedDemoOrder=validateOrder({...structuredClone(demoOrder),id:'DEMO-WO-1044',
  customerContact:{...demoOrder.customerContact,address:'7 Meadow Court, Conway, AR 72032'},
  property:'7 Meadow Court, Conway, AR 72032 · fictional site',
  reportedIssue:'Elena reports the inverter stopped producing on October 29. Monitoring also stopped updating that afternoon; whether these share a cause is unknown. No current output or live monitoring has been checked.',
  requestedWork:['Investigate the production complaint within authorized ground-level diagnostic scope.','Record equipment identity and the findings; replacement requires Operations authorization and an applicable procedure.','Capture any post-work output reading with units, time and measurement source; verify monitoring separately.','Return findings, outstanding work and customer commitments to Operations. Roof work is outside this visit scope.'],
  history:[
    {id:'DEMO-H1044-1',date:'2019-06-14',text:'Assignment inventory lists 24 × 400 W modules (9.6 kW DC) and one SolarEdge SE7600H-US inverter (7.6 kW AC). This has not been verified at today’s visit.'},
    {id:'DEMO-H1044-2',date:'2026-10-29',text:'Customer said production stopped and the monitoring app showed an old timestamp. Customer did not provide an exact error code or a photo.'},
    {id:'DEMO-H1044-3',date:'2026-10-30',text:'Operations booked a November 2 visit, 1–3 PM America/Chicago, and promised a warranty eligibility update. Warranty approval and a replacement shipment are not confirmed.'},
    {id:'DEMO-H1044-4',date:'2026-11-01',text:'Customer said home Wi-Fi was changed last week. This is a possible communication lead, not an established cause of lost production.'},
  ],briefing:{
    system:[note('equipment','Inventory: SolarEdge SE7600H-US string inverter, 7.6 kW AC; 24 × 400 W modules, 9.6 kW DC. Inverter mounted on east exterior garage wall. Serial number has not been recorded; confirm identity on site.'),note('monitoring-platform','SolarEdge monitoring portal is the listed monitoring platform. Battery presence and current telemetry are not established.')],
    problem:[note('customer-complaint','Production and monitoring both reportedly stopped October 29; exact fault code, cause and current status remain unknown.','reported')],
    troubleshooting:[note('planning','Changed Wi-Fi could explain stale monitoring, but does not establish why production stopped. Separate the two outcomes. No applicable manufacturer diagnostic or switching procedure is attached.','hypothesis')],
    customer:[note('visit-window','November 2, 2026, 1–3 PM America/Chicago. Elena prefers a text before travel and a call on arrival. She wants a clear next step before the technician leaves.','reported'),note('warranty-owner','Operations owns the warranty eligibility update and any replacement authorization. No approval, stock, shipment, price or completion date is promised.')],
    access:[note('access-gate','Driveway gate code 2468#. Gate is on the south driveway. Park on the gravel beside the detached garage; keep the driveway clear. Customer says the dog will be inside; confirm on arrival.','reported','DEMO-ACCESS-017')],
    safety:[note('scope-safety','Ground-level visit. No roof access is authorized. No approved site/equipment isolation, switching, repair or PPE procedure is attached. Stop and obtain qualified direction if conditions or scope are uncertain.','reference')],
    ladder:[note('ladder-scope','Roof and ladder work are outside this assignment; equipment and site conditions require assessment before any scope change.','reference')],
  }});
