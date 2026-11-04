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


// Additional fictional assignments exercise different systems and missing context.
// They are dispatch inputs only; none represents completed field work.
function assignment({id,customer,address,phone,systemId,issue,scope,history,system,customerNotes,access,planning,checks}){
  const origin=`DEMO-PACKET-${id.split('-').at(-1)}`;
  const n=(key,text,kind='context')=>note(`${id}-${key}`,text,kind,origin);
  return validateOrder({version:demoOrder.version,id,customer,property:`${address} · fictional site`,systemId,
    customerContact:{phone,address,source:source(`${id}-CONTACT`,'Operations contact record')},
    reportedIssue:issue,requestedWork:scope,
    history:history.map(([date,text],i)=>({id:`${id}-H${i+1}`,date,text})),
    briefing:{system:[n('system',system)],problem:[n('problem',issue,'reported')],
      customer:[n('customer',customerNotes,'reported')],access:[n('access',access,'reported')],
      troubleshooting:[n('planning',planning,'hypothesis')],
      safety:[n('safety','Ground-level assessment only. No switching, energized work, repair or equipment-specific procedure is authorized by this packet. Obtain the applicable approved procedure and qualified direction before a scope change.','reference')],
      ladder:[n('ladder','No roof or ladder access is included in this assignment.','reference')]},checks});
}
const check=(id,label,question)=>({id,label,question});
export const demoWorkOrders=[detailedDemoOrder,
  assignment({id:'DEMO-WO-1045',customer:'Marcus Reed',address:'18 Juniper Lane, Conway, AR 72034',phone:'+1 (501) 555-0145',systemId:'DEMO-SYS-018',
    issue:'Monitoring has not updated since the customer replaced the home router on November 1. Current solar production is unknown; stale monitoring does not prove the system is not generating.',
    scope:['Confirm the installed monitoring equipment and record the communication findings.','Document any authorized connection change and check for a current monitoring timestamp.','Keep measured production separate from restored communications. Return any unresolved access or connection needs to Operations.'],
    history:[['2022-04-19','Installation inventory lists 20 Enphase IQ8+ microinverters, 20 × 400 W modules (8.0 kW DC) and an IQ Gateway. Confirm this inventory onsite.'],['2026-11-01','Customer replaced the home router. The last monitoring timestamp predates that change; no current portal check is retained.'],['2026-11-02','Operations arranged a November 3 afternoon assessment and promised a monitoring status update. No replacement or billable repair has been approved.']],
    system:'Inventory: 20 Enphase IQ8+ microinverters and an IQ Gateway in the utility room. No battery is listed. Exact gateway model/serial and current production have not been verified.',
    customerNotes:'Marcus works from home. Text before arrival; avoid a router restart during work calls. Customer must approve any network interruption and enter Wi-Fi credentials directly; do not record passwords.',
    access:'No driveway gate or gate code. Park on the street and use the side walkway. Marcus will provide utility-room access on arrival; no lockbox code is supplied.',
    planning:'A router change is a possible communication lead, not a confirmed cause. No Enphase equipment procedure is attached. Confirm access and customer availability before changing a connection.',
    checks:[check('repair','Investigation and authorized changes','What did you find and what authorized changes, if any, did you make?'),check('monitoring','Current monitoring timestamp','Did monitoring resume, and what timestamp and source support that report?'),check('production','Production status','Was production separately observed with units, time and source, or does it remain unverified?'),check('customer-update','Customer follow-up','Was the monitoring update given, or who owns the remaining customer follow-up?')]}),
  assignment({id:'DEMO-WO-1046',customer:'Priya Shah',address:'42 Cedar Bend, Russellville, AR 72802',phone:'+1 (479) 555-0146',systemId:'DEMO-SYS-019',
    issue:'Customer reports less energy this October than last October. New tree growth is reported near the west array edge. Weather, shading, equipment status and comparable production data have not been assessed.',
    scope:['Confirm equipment identity and record the customer’s comparison periods and source.','Photograph visible shading and equipment condition from ground level.','Record current readings with units and time; distinguish instantaneous power from monthly energy.','Return findings and any need for a separate performance review to Operations. No cleaning, tree work, roof access or replacement is authorized.'],
    history:[['2020-08-11','Assignment inventory lists a SolarEdge SE5000H-US and 18 × 330 W modules (5.94 kW DC). Exact equipment variant is unverified.'],['2026-10-31','Customer compared two monthly app totals but did not provide screenshots or weather-adjusted data.'],['2026-11-02','Customer mentioned a taller tree on the west side. Operations promised to review the supporting records after a ground-level assessment; no cause or savings estimate was promised.']],
    system:'Inventory: SolarEdge SE5000H-US, 5.0 kW AC, and 18 × 330 W modules, 5.94 kW DC. Mounted on the west garage wall. Exact variant, serial number and current telemetry are not established.',
    customerNotes:'Priya prefers a call on arrival. She wants an explanation of the comparison and a next step, without an unsupported promise of restored output.',
    access:'No gate code is recorded. Call Priya for access; do not reuse another customer’s code. Park on the paved drive beside the mailbox and keep the garage entrance clear.',
    planning:'Shading, weather and equipment behavior are possibilities, not diagnoses. Obtain comparable dated energy records. The SE7600H-US references from another demonstration system are not attached to this job.',
    checks:[check('repair','Inspection findings','What did you inspect and observe within the authorized scope?'),check('production','Production comparison','What current power or historical energy values were recorded, with units, period and source?'),check('performance-review','Performance follow-up','What comparison remains unresolved, and who owns the next review?')]}),
  assignment({id:'DEMO-WO-1047',customer:'Owen Carter',address:'9 Willow Trace, Morrilton, AR 72110',phone:'+1 (501) 555-0147',systemId:'DEMO-SYS-020',
    issue:'After a storm, the customer saw a branch near the array and reported an unfamiliar sound. Damage, electrical condition and current production are unknown. Customer was asked to keep people away from the affected area and await qualified assessment.',
    scope:['Perform only an authorized ground-level visual assessment from a safe position.','Record visible conditions and customer testimony separately; capture a photo only if safely accessible.','Escalate damaged or exposed equipment and any unsafe access to Operations.','Return an owned next step. No roof access, branch removal, switching or repair is authorized.'],
    history:[['2021-05-18','Retained inventory says a roof-mounted PV array; manufacturer, inverter model and module count are not available in this packet.'],['2026-11-02','Customer reported a fallen branch after a storm. No photo or independent inspection has been received.'],['2026-11-03','Operations requested a ground-level assessment before arranging any specialist or elevated work. No repair price, warranty coverage or completion time has been agreed.']],
    system:'Roof-mounted solar system. Inverter manufacturer/model, system capacity, serial numbers and battery presence are not established. Do not infer the equipment from another work order.',
    customerNotes:'Call Owen on arrival. Operations owns arranging qualified follow-up and a customer update. Do not describe the system as safe, repaired or producing based on an appearance or photograph.',
    access:'Customer-supplied pedestrian gate code 7319#. Gate is beside the east fence. Park on the street away from the reported branch; reassess site conditions before entering.',
    planning:'Storm damage is reported, not verified. Observe only within authorized scope and escalate uncertainty. No manufacturer manual is matched because equipment identity is missing.',
    checks:[check('inspection','Ground-level observations','What could you observe safely, and what could not be assessed?'),check('escalation','Escalation and access limits','What conditions need qualified follow-up, and who owns that next action?'),check('customer-update','Customer commitments','What was communicated to the customer and what update remains with Operations?')]}),
];
