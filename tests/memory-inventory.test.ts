import test from "node:test";
import assert from "node:assert/strict";
import { collectMemoryInventory, type InventoryPage } from "../src/core/memory-inventory.ts";

// Explicit pagination fixtures, never live storage or qualification evidence.
const item = (id: string, namespace = "veyra-dev") => ({
 memory_id: id, blob_id: "local-fixture-blob-" + id, namespace_id: namespace,
 created_at: "2026-10-20T00:00:00.000Z", size: 100, end_epoch: 57, status: "metadata-only",
});
test("M2/M5: empty filtered pages do not truncate an inventory walk",async()=>{
 const pages:InventoryPage[]=[
  {memories:[],has_more:true,next_cursor:"page-2",snapshot_version:7},
  {memories:[item("a")],has_more:false,next_cursor:null,snapshot_version:7}
 ];
 const cursors:(string|undefined)[]=[];
 const result=await collectMemoryInventory({listMemories:async options=>{cursors.push(options.cursor);return pages.shift()!}},"veyra-dev");
 assert.deepEqual(cursors,[undefined,"page-2"]);
 assert.equal(result.count,1);assert.equal(result.completeness,"complete_snapshot");
 assert.equal(result.contentVerified,false);assert.equal(result.qualifyingMemoryCountVerified,false);
});
test("M2/M5: bounded or legacy inventory never claims completeness",async()=>{
 const partial=await collectMemoryInventory({listMemories:async()=>({memories:[item("a")],has_more:true,next_cursor:"next",snapshot_version:1})},"veyra-dev",{maxPages:1});
 assert.equal(partial.completeness,"partial");
 const legacy=await collectMemoryInventory({listMemories:async()=>({memories:[item("a")],has_more:false})},"veyra-dev");
 assert.equal(legacy.completeness,"unknown");
});
test("M2/M5: inventory rejects stale snapshots and repeated pagination cursors",async()=>{
 await assert.rejects(collectMemoryInventory({listMemories:async()=>({memories:[],has_more:true,next_cursor:"same",snapshot_version:1})},"veyra-dev"),/cursor/);
 await assert.rejects(collectMemoryInventory({listMemories:async()=>({memories:[],must_resync:true})},"veyra-dev"),/resync/);
 let page=0;
 await assert.rejects(collectMemoryInventory({listMemories:async()=>({memories:[],has_more:page++===0,next_cursor:"next",snapshot_version:page})},"veyra-dev"),/snapshot changed/);
});
test("M2/M5: scope, duplicate IDs and metadata verification stay separate",async()=>{
 const result=await collectMemoryInventory({listMemories:async()=>({
  memories:[item("a"),item("a"),item("b","private-other"),{...item("bad"),blob_id:"<script>"}],
  has_more:false,snapshot_version:1
 })},"veyra-dev");
 assert.equal(result.count,1);assert.equal(result.uniqueBlobCount,1);
 assert.equal(result.droppedCount,1);assert.equal(result.completeness,"partial");
 await assert.rejects(collectMemoryInventory({listMemories:async()=>({
  memories:[item("a"),{...item("a"),blob_id:"conflicting-fixture"}],has_more:false,snapshot_version:1
 })},"veyra-dev"),/Conflicting/);
});
test("M2/M5: a hung inventory is bounded without reporting provider success",async()=>{
 await assert.rejects(collectMemoryInventory({listMemories:()=>new Promise(()=>{})},"veyra-dev",{timeoutMs:10}),/deadline/);
});
