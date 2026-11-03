// Narrow, reviewed manufacturer-reference summaries, not full PDF ingestion.
// Both family guides list this model. The assignment lacks the exact variant;
// neither source may grant operating authority or be treated as a matched SOP.
const root='https://knowledge-center.solaredge.com/sites/kc/files/';
const common={kind:'manufacturer_family_reference_applicability_unconfirmed',manufacturer:'SolarEdge',listedModel:'SE7600H-US',reviewedAt:'2026-11-03',applicability:'Candidate only. Confirm the full nameplate part number, hardware/configuration variant and relevant current manufacturer guidance. The work order does not establish LCD versus SetApp. No procedure is approved for this unit by these summaries.'};
const catalog=[
 {...common,id:'manufacturer-solaredge-hd-wave-lcd',title:'Single Phase Inverter with HD-Wave Technology — North America',revision:'MAN-01-00306-1.1 · July 2018',url:root+'se_hd_wave_inverter_installation_guide_na.pdf',pages:[4,23,45,47,52,61,62,63,77],text:'This LCD-interface family guide includes SE7600H-US in its specification table. The nameplate identifies the serial number and electrical ratings (p. 23). Support preparation calls for model/serial, indicated fault, array/string configuration, communication method and inverter software version (p. 4). Monitoring communication and power harvesting are separate: communications are required for monitoring, not for harvesting (p. 52). On the LCD variant, S_OK denotes a successful monitoring-server connection (p. 61); it does not verify output. Status information is covered on pp. 45–49 and communication troubleshooting on pp. 62–63. These are reference facts, not a current site reading or a switching/testing sequence.'},
 {...common,id:'manufacturer-solaredge-hd-wave-setapp',title:'Single Phase Inverter with HD-Wave Technology with SetApp Configuration — North America',revision:'MAN-01-00541-1.4 · August 2020',url:root+'se_hd_wave_inverter_with_SetApp_installation_guide_na.pdf',pages:[26,40,43,47,60,62,63,73,76],text:'This SetApp-configuration family guide lists SE7600H-US (p. 73) and identifies SetApp commissioning through a local built-in Wi-Fi access point (p. 76). That local configuration connection does not itself establish a working internet monitoring connection. Inverter identification is on p. 26; activation/commissioning is on pp. 40–43; monitoring communication on pp. 47–60; and errors/communication troubleshooting on pp. 62–63. The work order has not established this variant. Use the guide as a candidate reference only until exact unit applicability and authorized work are established; no operating sequence is included here.'},
];
export function equipmentReferencesForOrder(order){
  // This catalog is currently limited to the explicitly fictional demonstration
  // system, including cloned visits. No customer/system cross-match is inferred.
  if(!/^DEMO-/.test(order.id)||order.systemId!=='DEMO-SYS-017')return [];
  const inventory=(order.briefing?.system||[]).map(s=>s.text).join(' ');
  if(!/\bSolarEdge\b/i.test(inventory)||! /\bSE7600H-US\b/i.test(inventory))return [];
  return catalog.map(source=>({...structuredClone(source),jobId:order.id,systemId:order.systemId}));
}
