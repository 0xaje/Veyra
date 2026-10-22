import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

async function unusedPort(): Promise<number> {
  const server=createServer();
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  const address=server.address();
  if (!address || typeof address==="string") throw new Error("No test port");
  const port=address.port;
  server.close();
  await once(server,"close");
  return port;
}
async function waitForServer(base:string, child:ReturnType<typeof spawn>) {
  for(let attempt=0;attempt<80;attempt++){
    if(child.exitCode!==null) throw new Error("Veyra API exited before readiness");
    try { const response=await fetch(base+"/health",{signal:AbortSignal.timeout(500)});
      if(response.ok) return;
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error("Veyra API did not become ready");
}
test("real local HTTP routes fail closed without Walrus credentials or persistent writes", {timeout:20000}, async()=>{
  const port=await unusedPort();
  const env: NodeJS.ProcessEnv = {...process.env,VEYRA_PORT:String(port)};
  delete env.MEMWAL_PRIVATE_KEY;
  delete env.MEMWAL_ACCOUNT_ID;
  delete env.VEYRA_HISTORY_FILE;
  delete env.VEYRA_AUTHORIZATIONS_FILE;
  const child=spawn(process.execPath,["--experimental-strip-types","scripts/preflight-api.mjs"],{
    cwd:process.cwd(),env,stdio:"ignore",
  });
  const base="http://127.0.0.1:"+port;
  try{
    await waitForServer(base,child);
    const health=await (await fetch(base+"/health")).json();
    assert.equal(health.paymentAuthorized,false);
    const history=await (await fetch(base+"/v1/history")).json();
    assert.equal(history.enabled,false);
    assert.deepEqual(history.records,[]);
    const html=await fetch(base+"/memory");
    assert.equal(html.status,200);
    assert.match(await html.text(),/Recipient memory timeline/);
    const payload={chain:"sui",network:"mainnet",counterpartyId:"recipient",
      address:"0x2",memoryIntent:"update",confirmedAddressChange:false,
      previousAddress:"0x1",previousBlobId:"prior-blob",
      confirmation:{method:"independent_contact",confirmedAt:"2026-10-21T12:00:00.000Z",reference:"Not submitted"},
      userApprovedStorage:false,confirmWrite:""};
    const unsupported=await fetch(base+"/v1/recipient-memory",{
      method:"POST",headers:{"Content-Type":"text/plain"},body:"not json",
    });
    assert.equal(unsupported.status,415);
    const crossOrigin=await fetch(base+"/v1/recipient-memory",{
      method:"POST",headers:{"Content-Type":"application/json","Origin":"https://example.org"},body:JSON.stringify(payload),
    });
    assert.equal(crossOrigin.status,403);
    const unavailable=await fetch(base+"/v1/recipient-memory",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),
    });
    assert.equal(unavailable.status,503);
    assert.match((await unavailable.json()).error,/credentials unavailable/);
    const malformed=await fetch(base+"/v1/preflight",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({counterpartyId:"recipient",proposedAddress:"not-an-address"}),
    });
    assert.equal(malformed.status,400);
    assert.equal((await malformed.json()).paymentAuthorized,false);
  } finally {
    child.kill("SIGTERM");
    if(child.exitCode===null) await Promise.race([
      once(child,"exit"),
      new Promise(resolve=>setTimeout(resolve,2000)),
    ]);
    if(child.exitCode===null) child.kill("SIGKILL");
  }
});
